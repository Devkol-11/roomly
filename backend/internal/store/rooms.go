package store

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"roomly/internal/models"

	"github.com/redis/go-redis/v9"
)

var (
	ErrRoomNotFound  = errors.New("room not found")
	ErrNotCreator    = errors.New("not the room creator")
	ErrAlreadyLocked = errors.New("room already locked")
)

func SaveRoom(ctx context.Context, client *redis.Client, r *models.Room) error {
	key := "room:" + r.ID
	err := client.HSet(ctx, key, map[string]interface{}{
		"id":            r.ID,
		"status":        r.Status,
		"created_at":    r.CreatedAt.Format(time.RFC3339),
		"expires_at":    r.ExpiresAt.Format(time.RFC3339),
		"creator_id":    r.CreatorID,
		"duration":      r.Duration,
		"message_count": r.MessageCount,
		"poll_count":    r.PollCount,
	}).Err()
	if err != nil {
		return fmt.Errorf("SaveRoom: %w", err)
	}
	ttl := time.Until(r.ExpiresAt)
	return client.Expire(ctx, key, ttl).Err()
}

func GetRoom(ctx context.Context, client *redis.Client, roomID string) (*models.Room, error) {
	key := "room:" + roomID
	data, err := client.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("GetRoom: %w", err)
	}
	if len(data) == 0 {
		return nil, nil
	}
	createdAt, _ := time.Parse(time.RFC3339, data["created_at"])
	expiresAt, _ := time.Parse(time.RFC3339, data["expires_at"])
	duration, _      := strconv.Atoi(data["duration"])
	messageCount, _  := strconv.Atoi(data["message_count"])
	pollCount, _     := strconv.Atoi(data["poll_count"])

	return &models.Room{
		ID:           data["id"],
		Status:       data["status"],
		CreatorID:    data["creator_id"],
		CreatedAt:    createdAt,
		ExpiresAt:    expiresAt,
		Duration:     duration,
		MessageCount: messageCount,
		PollCount:    pollCount,
	}, nil
}

func LockRoom(ctx context.Context, client *redis.Client, roomID, creatorID string) error {
	data, err := client.HGetAll(ctx, "room:"+roomID).Result()
	if err != nil {
		return fmt.Errorf("LockRoom: %w", err)
	}
	if len(data) == 0 {
		return ErrRoomNotFound
	}
	if data["creator_id"] != creatorID {
		return ErrNotCreator
	}
	if data["status"] == "locked" {
		return ErrAlreadyLocked
	}
	return client.HSet(ctx, "room:"+roomID, map[string]interface{}{
		"status":    "locked",
		"locked_at": time.Now().Format(time.RFC3339),
	}).Err()
}
