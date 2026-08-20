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
type Hub struct {
	roomID    string
	creatorID string
	clients   map[string]*Client
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
	kick       chan string
	expireCh   chan struct{}
	expired    bool
	redis      *redis.Client
	ai         *ai.Client

	// Focus mode protected by focusMu because it is read from client
	// goroutines and written via the exported methods below.
	focusMu         sync.RWMutex
	focusMode       bool
	floorHolderID   string
	floorHolderName string
}

func newHub(roomID, creatorID string, redisClient *redis.Client, aiClient *ai.Client) *Hub {
	return &Hub{
		roomID:     roomID,
		creatorID:  creatorID,
		clients:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		kick:       make(chan string),
		expireCh:   make(chan struct{}, 1),
		redis:      redisClient,
		ai:         aiClient,
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client.ID] = client
			h.trackParticipant(client.ID, true)
			h.sendAll(mustEvent(EventUserJoined, UserPayload{
				ParticipantID: client.ID,
				DisplayName:   client.DisplayName,
			}))

		case client := <-h.unregister:
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.send)
				h.trackParticipant(client.ID, false)
				h.sendAll(mustEvent(EventUserLeft, UserPayload{
					ParticipantID: client.ID,
					DisplayName:   client.DisplayName,
				}))
				// Release the floor automatically if the holder disconnects.
				h.focusMu.Lock()
				if h.focusMode && h.floorHolderID == client.ID {
					h.floorHolderID = ""
					h.floorHolderName = ""
					h.focusMu.Unlock()
					h.sendAll(mustEvent(EventFloorReleased, FloorPayload{
						ParticipantID: client.ID,
						DisplayName:   client.DisplayName,
					}))
				} else {
					h.focusMu.Unlock()
				}
			}

		case targetID := <-h.kick:
			if target, ok := h.clients[targetID]; ok {
				select {
				case target.send <- mustEvent(EventKicked, map[string]string{
					"reason": "removed by room creator",
				}):
				default:
				}
				target.conn.Close()
				delete(h.clients, targetID)
				h.trackParticipant(targetID, false)
				h.sendAll(mustEvent(EventUserLeft, UserPayload{
					ParticipantID: targetID,
					DisplayName:   target.DisplayName,
				}))
				log.Printf("participant %s kicked from room %s", targetID, h.roomID)
			}

		case message := <-h.broadcast:
			for _, client := range h.clients {
				select {
				case client.send <- message:
				default:
					delete(h.clients, client.ID)
					close(client.send)
				}
			}

		case <-h.expireCh:
			h.expired = true
			data := mustEvent(EventRoomExpired, map[string]string{"room_id": h.roomID})
			for _, client := range h.clients {
				select {
				case client.send <- data:
				default:
				}
				client.conn.Close()
			}
			log.Printf("room %s expired, disconnected %d clients", h.roomID, len(h.clients))
		}
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
	summary, err := h.ai.Summarize(ctx, stored)
	if err != nil {
		log.Printf("room %s summary error: %v", h.roomID, err)
		return
	}
	data := mustEvent(EventRoomSummary, SummaryPayload{
		TLDR:         summary.TLDR,
		Decisions:    summary.Decisions,
		ActionItems:  summary.ActionItems,
		Sentiment:    summary.Sentiment,
		MessageCount: len(stored),
	})
	select {
	case h.broadcast <- data:
	default:
	}
}

func (h *Hub) RequestSummary(requesterID string) error {
	if requesterID != h.creatorID {
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

func (h *Hub) EnableFocusMode(requesterID, requesterName string) error {
	if requesterID != h.creatorID {
		return fmt.Errorf("only the room creator can enable focus mode")
	}
	h.focusMu.Lock()
	h.focusMode = true
	h.floorHolderID = requesterID
	h.floorHolderName = requesterName
	h.focusMu.Unlock()
	h.sendAll(mustEvent(EventFocusModeEnabled, FocusModePayload{
		Enabled:         true,
		FloorHolderID:   requesterID,
		FloorHolderName: requesterName,
	}))
	return nil
}

func (h *Hub) DisableFocusMode(requesterID string) error {
	if requesterID != h.creatorID {
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
	defer h.focusMu.Unlock()
	if !h.focusMode {
		return fmt.Errorf("focus mode is not active")
	}
	if h.floorHolderID != "" {
		return fmt.Errorf("floor is currently held by %s", h.floorHolderName)
	}
	h.floorHolderID = c.ID
	h.floorHolderName = c.DisplayName
	h.sendAll(mustEvent(EventFloorGranted, FloorPayload{
		ParticipantID: c.ID,
		DisplayName:   c.DisplayName,
	}))
	return nil
}

func (h *Hub) ReleaseFloor(clientID, clientName string) error {
	h.focusMu.Lock()
	defer h.focusMu.Unlock()
	if !h.focusMode {
		return fmt.Errorf("focus mode is not active")
	}
	if h.floorHolderID != clientID {
		return fmt.Errorf("you do not hold the floor")
	}
	h.floorHolderID = ""
	h.floorHolderName = ""
	h.sendAll(mustEvent(EventFloorReleased, FloorPayload{
		ParticipantID: clientID,
		DisplayName:   clientName,
	}))
	return nil
}

func (h *Hub) GrantFloor(requesterID, targetID string) error {
	if requesterID != h.creatorID {
		return fmt.Errorf("only the room creator can grant the floor")
	}
	h.focusMu.Lock()
	if !h.focusMode {
		h.focusMu.Unlock()
		return fmt.Errorf("focus mode is not active")
	}
	target, ok := h.clients[targetID]
	if !ok {
		h.focusMu.Unlock()
		return fmt.Errorf("participant not found")
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
		h.broadcast <- original
		return
	}

	langTargets := make(map[string][]*Client)
	for _, c := range h.clients {
		if c.Language == "" || c.Language == sender.Language {
			select {
			case c.send <- original:
			default:
			}
		} else {
			langTargets[c.Language] = append(langTargets[c.Language], c)
		}
	}

	for lang, targets := range langTargets {
		go func(targetLang string, recipients []*Client) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			translated, err := h.ai.Translate(ctx, msg.Text, targetLang)
			if err != nil {
				log.Printf("translate to %s: %v", targetLang, err)
				for _, r := range recipients {
					select {
					case r.send <- original:
					default:
					}
				}
				return
			}
			translatedMsg := msg
			translatedMsg.OriginalText = msg.Text
			translatedMsg.Text = translated
			translatedMsg.TranslatedFrom = sender.Language
			data := mustEvent(EventMessage, translatedMsg)
			for _, r := range recipients {
				select {
				case r.send <- data:
				default:
				}
			}
		}(lang, targets)
	}
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (h *Hub) sendAll(data []byte) {
	for _, client := range h.clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (h *Hub) broadcastExcept(sender *Client, data []byte) {
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

func (h *Hub) Register(c *Client) { h.register <- c }

func (h *Hub) Notify(data []byte) {
	select {
	case h.broadcast <- data:
	default:
	}
}

func (h *Hub) KickClient(requesterID, targetID string) error {
	if requesterID != h.creatorID {
		return fmt.Errorf("only the room creator can kick members")
	}
	if requesterID == targetID {
		return fmt.Errorf("you cannot kick yourself")
	}
	h.kick <- targetID
	return nil
}

func (h *Hub) LockRoomWS(requesterID string) error {
	if requesterID != h.creatorID {
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

func (m *Manager) GetOrCreateHub(roomID, creatorID string) *Hub {
	m.mu.Lock()
	defer m.mu.Unlock()
	if hub, ok := m.hubs[roomID]; ok {
		return hub
	}
	hub := newHub(roomID, creatorID, m.redis, m.ai)
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
