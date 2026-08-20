package realtime

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

	// Focus mode — talking-stick feature
	EventFocusModeEnabled  = "focus_mode_enabled"
	EventFocusModeDisabled = "focus_mode_disabled"
	EventFloorGranted      = "floor_granted"
	EventFloorReleased     = "floor_released"

	// AI summary
	EventRoomSummary = "room_summary"
)

type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// MessagePayload carries a single chat message.
// OriginalText and TranslatedFrom are only set when live translation is active.
type MessagePayload struct {
	ID             string    `json:"id"`
	SenderID       string    `json:"sender_id"`
	SenderName     string    `json:"sender_name"`
	Text           string    `json:"text"`
	OriginalText   string    `json:"original_text,omitempty"`
	TranslatedFrom string    `json:"translated_from,omitempty"`
	Timestamp      time.Time `json:"timestamp"`
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

type FocusModePayload struct {
	Enabled         bool   `json:"enabled"`
	FloorHolderID   string `json:"floor_holder_id,omitempty"`
	FloorHolderName string `json:"floor_holder_name,omitempty"`
}

type FloorPayload struct {
	ParticipantID string `json:"participant_id"`
	DisplayName   string `json:"display_name"`
}

type SummaryPayload struct {
	TLDR         string   `json:"tldr"`
	Decisions    []string `json:"decisions"`
	ActionItems  []string `json:"action_items"`
	Sentiment    string   `json:"sentiment"`
	MessageCount int      `json:"message_count"`
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
