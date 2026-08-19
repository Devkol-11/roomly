package room

import "time"

type Room struct {
	ID           string     `json:"id"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	ExpiresAt    time.Time  `json:"expires_at"`
	LockedAt     *time.Time `json:"locked_at,omitempty"`
	CreatorID    string     `json:"creator_id"`
	Duration     int        `json:"duration"`
	MessageCount int        `json:"message_count"`
	PollCount    int        `json:"poll_count"`
}
