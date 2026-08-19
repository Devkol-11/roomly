package room

import (
	"encoding/json"
	"time"
)

const (
	EventMessage     = "message"
	EventUserJoined  = "user_joined"
	EventUserLeft    = "user_left"
	EventTypingStart = "typing_started"
	EventTypingStop  = "typing_stopped"
	EventRoomLocked  = "room_locked"
	EventRoomExpired = "room_expired"
	EventPollCreate  = "poll_created"
	EventPollUpdate  = "poll_updated"
	EventKicked      = "kicked"
	EventError       = "error"
)

type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type MessagePayload struct {
	ID         string    `json:"id"`
	SenderID   string    `json:"sender_id"`
	SenderName string    `json:"sender_name"`
	Text       string    `json:"text"`
	Timestamp  time.Time `json:"timestamp"`
}

type UserPayload struct {
	ParticipantID string `json:"participant_id"`
	DisplayName   string `json:"display_name"`
}

type TypingPayload struct {
	ParticipantID string `json:"participant_id"`
	DisplayName   string `json:"display_name"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}

type Poll struct {
	ID          string         `json:"id"`
	RoomID      string         `json:"room_id"`
	Question    string         `json:"question"`
	Options     []string       `json:"options"`
	CreatedBy   string         `json:"created_by"`
	CreatorName string         `json:"creator_name"`
	CreatedAt   time.Time      `json:"created_at"`
	Votes       map[string]int `json:"votes"`
}

type PollVotePayload struct {
	PollID      string `json:"poll_id"`
	OptionIndex int    `json:"option_index"`
}

type PollUpdatePayload struct {
	PollID string         `json:"poll_id"`
	Votes  map[string]int `json:"votes"`
}

func NewEvent(eventType string, payload any) ([]byte, error) {
	p, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Event{Type: eventType, Payload: p})
}

func mustEvent(eventType string, payload any) []byte {
	data, _ := NewEvent(eventType, payload)
	return data
}
