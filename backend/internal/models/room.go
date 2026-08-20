package models

import "time"

// Room is the core domain type. It is intentionally kept free of any
// infrastructure imports so every layer (store, realtime, api) can use it
// without creating import cycles.
type Room struct {
	ID           string     `json:"id"`
	Status       string     `json:"status"`
	CreatorID    string     `json:"creator_id"`
	CreatedAt    time.Time  `json:"created_at"`
	ExpiresAt    time.Time  `json:"expires_at"`
	LockedAt     *time.Time `json:"locked_at,omitempty"`
	Duration     int        `json:"duration"`
	MessageCount int        `json:"message_count"`
	PollCount    int        `json:"poll_count"`
}
