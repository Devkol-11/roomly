package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"roomly/internal/ai"

	"github.com/redis/go-redis/v9"
)

// Hub manages all live WebSocket clients inside one room.
//
// Locking order (never acquire in the opposite direction):
//
//	focusMu -> clientsMu
//	pollsMu is independent and never held while taking another lock.
type Hub struct {
	roomID string

	clientsMu sync.RWMutex
	clients   map[string]*Client

	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
	kick       chan string
	expireCh   chan struct{}
	done       chan struct{}
	onClose    func()

	redis *redis.Client
	ai    *ai.Client

	focusMu         sync.RWMutex
	focusMode       bool
	floorHolderID   string
	floorHolderName string

	pollsMu sync.RWMutex
	polls   map[string]*Poll
}

func newHub(roomID string, redisClient *redis.Client, aiClient *ai.Client, onClose func()) *Hub {
	return &Hub{
		roomID:     roomID,
		clients:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		kick:       make(chan string),
		expireCh:   make(chan struct{}, 1),
		done:       make(chan struct{}),
		onClose:    onClose,
		redis:      redisClient,
		ai:         aiClient,
		polls:      make(map[string]*Poll),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clientsMu.Lock()
			h.clients[client.ID] = client
			h.clientsMu.Unlock()
			h.trackParticipant(client.ID, true)

			// Snapshot first (to the newcomer only), then announce to everyone.
			h.sendTo(client, mustEvent(EventRoomState, h.snapshot(client)))
			h.sendAll(mustEvent(EventUserJoined, UserPayload{
				ParticipantID: client.ID,
				DisplayName:   client.DisplayName,
				IsCreator:     client.IsCreator,
			}))

		case client := <-h.unregister:
			if h.removeClient(client) {
				h.announceLeft(client)
			}

		case targetID := <-h.kick:
			h.clientsMu.RLock()
			target, ok := h.clients[targetID]
			h.clientsMu.RUnlock()
			if !ok {
				continue
			}
			// Queue the notice, then close the send channel: WriteLoop flushes
			// the "kicked" frame, sends a close frame and shuts the socket.
			h.sendTo(target, mustEvent(EventKicked, map[string]string{
				"reason": "removed by room creator",
			}))
			if h.removeClient(target) {
				h.announceLeft(target)
			}
			log.Printf("participant %s kicked from room %s", targetID, h.roomID)

		case message := <-h.broadcast:
			h.sendAll(message)

		case <-h.expireCh:
			data := mustEvent(EventRoomExpired, map[string]string{"room_id": h.roomID})
			h.clientsMu.Lock()
			n := len(h.clients)
			for id, client := range h.clients {
				select {
				case client.send <- data:
				default:
				}
				close(client.send)
				delete(h.clients, id)
			}
			h.clientsMu.Unlock()
			log.Printf("room %s expired, disconnected %d clients", h.roomID, n)
			close(h.done)
			if h.onClose != nil {
				h.onClose()
			}
			return
		}
	}
}

// removeClient deletes the exact client (pointer match) and closes its send
// channel. Returns false if it was already gone.
func (h *Hub) removeClient(client *Client) bool {
	h.clientsMu.Lock()
	defer h.clientsMu.Unlock()
	if current, ok := h.clients[client.ID]; !ok || current != client {
		return false
	}
	delete(h.clients, client.ID)
	close(client.send)
	return true
}

func (h *Hub) announceLeft(client *Client) {
	h.trackParticipant(client.ID, false)
	h.sendAll(mustEvent(EventUserLeft, UserPayload{
		ParticipantID: client.ID,
		DisplayName:   client.DisplayName,
		IsCreator:     client.IsCreator,
	}))
	// Release the floor automatically if the holder leaves.
	h.focusMu.Lock()
	released := h.focusMode && h.floorHolderID == client.ID
	if released {
		h.floorHolderID = ""
		h.floorHolderName = ""
	}
	h.focusMu.Unlock()
	if released {
		h.sendAll(mustEvent(EventFloorReleased, FloorPayload{
			ParticipantID: client.ID,
			DisplayName:   client.DisplayName,
		}))
	}
}

func (h *Hub) snapshot(self *Client) RoomStatePayload {
	h.clientsMu.RLock()
	participants := make([]UserPayload, 0, len(h.clients))
	for _, c := range h.clients {
		participants = append(participants, UserPayload{
			ParticipantID: c.ID, DisplayName: c.DisplayName, IsCreator: c.IsCreator,
		})
	}
	h.clientsMu.RUnlock()

	h.focusMu.RLock()
	focus := FocusModePayload{
		Enabled:         h.focusMode,
		FloorHolderID:   h.floorHolderID,
		FloorHolderName: h.floorHolderName,
	}
	h.focusMu.RUnlock()

	h.pollsMu.RLock()
	polls := make([]*Poll, 0, len(h.polls))
	for _, p := range h.polls {
		cp := *p
		polls = append(polls, &cp)
	}
	h.pollsMu.RUnlock()
	for _, p := range polls {
		if votes, err := h.GetPollResults(p.ID); err == nil {
			p.Votes = votes
		}
	}

	return RoomStatePayload{
		SelfID:       self.ID,
		IsCreator:    self.IsCreator,
		Participants: participants,
		Focus:        focus,
		Polls:        polls,
		AIEnabled:    h.ai != nil && h.ai.Enabled(),
	}
}

func (h *Hub) watchExpiry() {
	ctx := context.Background()
	ttl, err := h.redis.TTL(ctx, "room:"+h.roomID).Result()
	if err != nil || ttl <= 0 {
		h.expireCh <- struct{}{}
		return
	}
	timer := time.NewTimer(ttl)
	defer timer.Stop()
	<-timer.C

	if h.ai != nil && h.ai.Enabled() {
		h.generateAndBroadcastSummary()
	}
	h.expireCh <- struct{}{}
}

func (h *Hub) generateAndBroadcastSummary() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	raw, err := h.redis.LRange(ctx, "room:"+h.roomID+":messages", 0, -1).Result()
	if err != nil {
		return
	}
	var stored []ai.StoredMessage
	for _, m := range raw {
		var sm ai.StoredMessage
		if json.Unmarshal([]byte(m), &sm) == nil {
			stored = append(stored, sm)
		}
	}
	if len(stored) == 0 {
		h.Notify(mustEvent(EventRoomSummary, SummaryPayload{
			TLDR:      "No messages were sent in this room yet.",
			Sentiment: "neutral",
		}))
		return
	}
	summary, err := h.ai.Summarize(ctx, stored)
	if err != nil {
		log.Printf("room %s summary error: %v", h.roomID, err)
		return
	}
	h.Notify(mustEvent(EventRoomSummary, SummaryPayload{
		TLDR:         summary.TLDR,
		Decisions:    summary.Decisions,
		ActionItems:  summary.ActionItems,
		Sentiment:    summary.Sentiment,
		MessageCount: len(stored),
	}))
}

func (h *Hub) RequestSummary(c *Client) error {
	if !c.IsCreator {
		return fmt.Errorf("only the room creator can request a summary")
	}
	if h.ai == nil || !h.ai.Enabled() {
		return fmt.Errorf("AI features are not enabled on this server")
	}
	go h.generateAndBroadcastSummary()
	return nil
}

// ─── Focus mode ──────────────────────────────────────────────────────────────

func (h *Hub) IsFocusActive() bool {
	h.focusMu.RLock()
	defer h.focusMu.RUnlock()
	return h.focusMode
}

func (h *Hub) IsFloorHolder(clientID string) bool {
	h.focusMu.RLock()
	defer h.focusMu.RUnlock()
	return h.floorHolderID == clientID
}

func (h *Hub) EnableFocusMode(c *Client) error {
	if !c.IsCreator {
		return fmt.Errorf("only the room creator can enable focus mode")
	}
	h.focusMu.Lock()
	h.focusMode = true
	h.floorHolderID = c.ID
	h.floorHolderName = c.DisplayName
	h.focusMu.Unlock()
	h.sendAll(mustEvent(EventFocusModeEnabled, FocusModePayload{
		Enabled:         true,
		FloorHolderID:   c.ID,
		FloorHolderName: c.DisplayName,
	}))
	return nil
}

func (h *Hub) DisableFocusMode(c *Client) error {
	if !c.IsCreator {
		return fmt.Errorf("only the room creator can disable focus mode")
	}
	h.focusMu.Lock()
	h.focusMode = false
	h.floorHolderID = ""
	h.floorHolderName = ""
	h.focusMu.Unlock()
	h.sendAll(mustEvent(EventFocusModeDisabled, FocusModePayload{Enabled: false}))
	return nil
}

func (h *Hub) RequestFloor(c *Client) error {
	h.focusMu.Lock()
	if !h.focusMode {
		h.focusMu.Unlock()
		return fmt.Errorf("focus mode is not active")
	}
	if h.floorHolderID != "" {
		name := h.floorHolderName
		h.focusMu.Unlock()
		return fmt.Errorf("floor is currently held by %s", name)
	}
	h.floorHolderID = c.ID
	h.floorHolderName = c.DisplayName
	h.focusMu.Unlock()
	h.sendAll(mustEvent(EventFloorGranted, FloorPayload{
		ParticipantID: c.ID,
		DisplayName:   c.DisplayName,
	}))
	return nil
}

func (h *Hub) ReleaseFloor(clientID, clientName string) error {
	h.focusMu.Lock()
	if !h.focusMode {
		h.focusMu.Unlock()
		return fmt.Errorf("focus mode is not active")
	}
	if h.floorHolderID != clientID {
		h.focusMu.Unlock()
		return fmt.Errorf("you do not hold the floor")
	}
	h.floorHolderID = ""
	h.floorHolderName = ""
	h.focusMu.Unlock()
	h.sendAll(mustEvent(EventFloorReleased, FloorPayload{
		ParticipantID: clientID,
		DisplayName:   clientName,
	}))
	return nil
}

func (h *Hub) GrantFloor(c *Client, targetID string) error {
	if !c.IsCreator {
		return fmt.Errorf("only the room creator can grant the floor")
	}
	h.clientsMu.RLock()
	target, ok := h.clients[targetID]
	h.clientsMu.RUnlock()
	if !ok {
		return fmt.Errorf("participant not found")
	}
	h.focusMu.Lock()
	if !h.focusMode {
		h.focusMu.Unlock()
		return fmt.Errorf("focus mode is not active")
	}
	h.floorHolderID = targetID
	h.floorHolderName = target.DisplayName
	h.focusMu.Unlock()
	h.sendAll(mustEvent(EventFloorGranted, FloorPayload{
		ParticipantID: targetID,
		DisplayName:   target.DisplayName,
	}))
	return nil
}

// ─── Broadcast with optional per-language translation ────────────────────────

func (h *Hub) broadcastMessage(sender *Client, msg MessagePayload) {
	h.storeMessage(msg)
	original := mustEvent(EventMessage, msg)

	if h.ai == nil || !h.ai.Enabled() {
		h.sendAll(original)
		return
	}

	langTargets := make(map[string][]*Client)
	h.clientsMu.RLock()
	for _, c := range h.clients {
		if c.Language == "" || c.Language == sender.Language || c == sender {
			select {
			case c.send <- original:
			default:
			}
		} else {
			langTargets[c.Language] = append(langTargets[c.Language], c)
		}
	}
	h.clientsMu.RUnlock()

	for lang, targets := range langTargets {
		go func(targetLang string, recipients []*Client) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			data := original
			if translated, err := h.ai.Translate(ctx, msg.Text, targetLang); err != nil {
				log.Printf("translate to %s: %v", targetLang, err)
			} else {
				translatedMsg := msg
				translatedMsg.OriginalText = msg.Text
				translatedMsg.Text = translated
				translatedMsg.TranslatedFrom = sender.Language
				if translatedMsg.TranslatedFrom == "" {
					translatedMsg.TranslatedFrom = "original"
				}
				data = mustEvent(EventMessage, translatedMsg)
			}
			for _, r := range recipients {
				h.sendTo(r, data)
			}
		}(lang, targets)
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// sendTo delivers to one client if it is still registered (a closed send
// channel is never written to because removal happens under the same lock).
func (h *Hub) sendTo(c *Client, data []byte) {
	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()
	if current, ok := h.clients[c.ID]; !ok || current != c {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

func (h *Hub) sendAll(data []byte) {
	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()
	for _, client := range h.clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (h *Hub) broadcastExcept(sender *Client, data []byte) {
	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()
	for _, client := range h.clients {
		if client.ID == sender.ID {
			continue
		}
		select {
		case client.send <- data:
		default:
		}
	}
}

func (h *Hub) Register(c *Client) {
	select {
	case h.register <- c:
	case <-h.done:
		close(c.send)
	}
}

func (h *Hub) Unregister(c *Client) {
	select {
	case h.unregister <- c:
	case <-h.done:
	}
}

func (h *Hub) Notify(data []byte) {
	select {
	case h.broadcast <- data:
	default:
	}
}

func (h *Hub) KickClient(c *Client, targetID string) error {
	if !c.IsCreator {
		return fmt.Errorf("only the room creator can kick members")
	}
	if c.ID == targetID {
		return fmt.Errorf("you cannot kick yourself")
	}
	select {
	case h.kick <- targetID:
	case <-h.done:
	}
	return nil
}

func (h *Hub) LockRoomWS(c *Client) error {
	if !c.IsCreator {
		return fmt.Errorf("only the room creator can lock the room")
	}
	ctx := context.Background()
	if err := h.redis.HSet(ctx, "room:"+h.roomID, map[string]interface{}{
		"status":    "locked",
		"locked_at": time.Now().Format(time.RFC3339),
	}).Err(); err != nil {
		return err
	}
	h.sendAll(mustEvent(EventRoomLocked, map[string]string{"room_id": h.roomID}))
	return nil
}

func (h *Hub) ValidPollOption(pollID string, idx int) bool {
	h.pollsMu.RLock()
	defer h.pollsMu.RUnlock()
	p, ok := h.polls[pollID]
	return ok && idx >= 0 && idx < len(p.Options)
}

func (h *Hub) storeMessage(msg MessagePayload) {
	if h.ai == nil || !h.ai.Enabled() {
		return
	}
	ctx := context.Background()
	key := "room:" + h.roomID + ":messages"
	sm := ai.StoredMessage{
		SenderName: msg.SenderName,
		Text:       msg.Text,
		Timestamp:  msg.Timestamp,
	}
	data, _ := json.Marshal(sm)
	h.redis.RPush(ctx, key, data)
	h.redis.Expire(ctx, key, 24*time.Hour)
}
func (h *Hub) trackParticipant(participantID string, add bool) {
	ctx := context.Background()
	key := "room:" + h.roomID + ":participants"
	var err error
	if add {
		err = h.redis.SAdd(ctx, key, participantID).Err()
	} else {
		err = h.redis.SRem(ctx, key, participantID).Err()
	}
	if err != nil {
		log.Printf("trackParticipant error: %v", err)
	}
}

// ─── Poll operations ──────────────────────────────────────────────────────────

func (h *Hub) SavePoll(poll *Poll) error {
	ctx := context.Background()
	key := fmt.Sprintf("poll:%s:%s", h.roomID, poll.ID)
	optionsJSON, _ := json.Marshal(poll.Options)
	h.pollsMu.Lock()
	h.polls[poll.ID] = poll
	h.pollsMu.Unlock()
	return h.redis.HSet(ctx, key, map[string]interface{}{
		"id":           poll.ID,
		"room_id":      poll.RoomID,
		"question":     poll.Question,
		"options":      string(optionsJSON),
		"created_by":   poll.CreatedBy,
		"creator_name": poll.CreatorName,
		"created_at":   poll.CreatedAt.Format(time.RFC3339),
	}).Err()
}

func (h *Hub) RecordVote(pollID, participantID string, optionIndex int) (bool, error) {
	ctx := context.Background()
	key := fmt.Sprintf("poll:%s:%s:votes", h.roomID, pollID)
	return h.redis.HSetNX(ctx, key, participantID, optionIndex).Result()
}

func (h *Hub) GetPollResults(pollID string) (map[string]int, error) {
	ctx := context.Background()
	key := fmt.Sprintf("poll:%s:%s:votes", h.roomID, pollID)
	votes, err := h.redis.HVals(ctx, key).Result()
	if err != nil {
		return nil, err
	}
	results := make(map[string]int)
	for _, v := range votes {
		idx, _ := strconv.Atoi(v)
		results[strconv.Itoa(idx)]++
	}
	return results, nil
}

// ─── Manager ──────────────────────────────────────────────────────────────────

// Manager owns all active hubs across every room.
type Manager struct {
	mu    sync.RWMutex
	hubs  map[string]*Hub
	redis *redis.Client
	ai    *ai.Client
}

func NewManager(redisClient *redis.Client, aiClient *ai.Client) *Manager {
	return &Manager{
		hubs:  make(map[string]*Hub),
		redis: redisClient,
		ai:    aiClient,
	}
}

func (m *Manager) GetOrCreateHub(roomID string) *Hub {
	m.mu.Lock()
	defer m.mu.Unlock()
	if hub, ok := m.hubs[roomID]; ok {
		select {
		case <-hub.done:
			// expired hub still registered; fall through and replace it
		default:
			return hub
		}
	}
	var hub *Hub
	hub = newHub(roomID, m.redis, m.ai, func() {
		m.mu.Lock()
		if m.hubs[roomID] == hub {
			delete(m.hubs, roomID)
		}
		m.mu.Unlock()
	})
	m.hubs[roomID] = hub
	go hub.run()
	go hub.watchExpiry()
	return hub
}

func (m *Manager) NotifyRoom(roomID string, data []byte) {
	m.mu.RLock()
	hub, ok := m.hubs[roomID]
	m.mu.RUnlock()
	if ok {
		hub.Notify(data)
	}
}
