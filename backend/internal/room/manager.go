package room

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// Hub manages all live WebSocket clients inside one room.
type Hub struct {
	roomID    string
	creatorID string
	clients   map[string]*Client
	register  chan *Client
	unregister chan *Client
	broadcast  chan []byte
	kick       chan string
	expireCh   chan struct{}
	expired    bool
	redis      *goredis.Client
}

func newHub(roomID, creatorID string, redis *goredis.Client) *Hub {
	return &Hub{
		roomID:     roomID,
		creatorID:  creatorID,
		clients:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		kick:       make(chan string),
		expireCh:   make(chan struct{}, 1),
		redis:      redis,
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
			}

		case targetID := <-h.kick:
			if target, ok := h.clients[targetID]; ok {
				// Tell the kicked client before closing
				select {
				case target.send <- mustEvent(EventKicked, map[string]string{
					"reason": "removed by room creator",
				}):
				default:
				}
				target.conn.Close()
				delete(h.clients, targetID)
				h.trackParticipant(targetID, false)
				// Notify remaining clients
				h.sendAll(mustEvent(EventUserLeft, UserPayload{
					ParticipantID: targetID,
					DisplayName:   target.DisplayName,
				}))
				log.Printf("participant %s was kicked from room %s", targetID, h.roomID)
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
	h.expireCh <- struct{}{}
}

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

func (h *Hub) Register(c *Client) {
	h.register <- c
}

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

// LockRoomWS locks the room from inside a WebSocket session.
// Updates Redis and broadcasts room_locked to all clients.
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

func (h *Hub) ParticipantCount() int {
	return len(h.clients)
}

func (h *Hub) IsCreator(participantID string) bool {
	return participantID == h.creatorID
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

// Poll operations live on the hub to avoid import cycles with internal/redis.

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

// RecordVote returns true if the vote was recorded, false if already voted.
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

// Manager owns all active hubs across all rooms.
type Manager struct {
	mu    sync.RWMutex
	hubs  map[string]*Hub
	redis *goredis.Client
}

func NewManager(redis *goredis.Client) *Manager {
	return &Manager{
		hubs:  make(map[string]*Hub),
		redis: redis,
	}
}

func (m *Manager) GetOrCreateHub(roomID, creatorID string) *Hub {
	m.mu.Lock()
	defer m.mu.Unlock()

	if hub, ok := m.hubs[roomID]; ok {
		return hub
	}

	hub := newHub(roomID, creatorID, m.redis)
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
