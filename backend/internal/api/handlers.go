package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"

	"roomly/internal/models"
	"roomly/internal/realtime"
	"roomly/internal/store"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	qrcode "github.com/skip2/go-qrcode"
)

type Handler struct {
	redis       *redis.Client
	manager     *realtime.Manager
	frontendURL string
}

func NewHandler(client *redis.Client, manager *realtime.Manager, frontendURL string) *Handler {
	return &Handler{redis: client, manager: manager, frontendURL: frontendURL}
}

const idCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func generateID(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = idCharset[b[i]%62]
	}
	return string(b), nil
}

var validDurations = map[int]bool{15: true, 30: true, 60: true, 120: true}

func (h *Handler) CreateRoom(c *gin.Context) {
	var body struct {
		DurationMinutes int    `json:"duration_minutes"`
		DisplayName     string `json:"display_name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.DurationMinutes == 0 {
		body.DurationMinutes = 60
	}
	if !validDurations[body.DurationMinutes] {
		respondError(c, http.StatusBadRequest, "duration must be 15, 30, 60, or 120 minutes")
		return
	}
	if len(body.DisplayName) < 2 || len(body.DisplayName) > 20 {
		respondError(c, http.StatusBadRequest, "display_name must be 2-20 characters")
		return
	}

	roomID, err := generateID(8)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "could not generate room ID")
		return
	}
	creatorID, err := generateID(16)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "could not generate participant ID")
		return
	}

	now := time.Now()
	r := &models.Room{
		ID:        roomID,
		Status:    "active",
		CreatedAt: now,
		ExpiresAt: now.Add(time.Duration(body.DurationMinutes) * time.Minute),
		CreatorID: creatorID,
		Duration:  body.DurationMinutes,
	}

	if err := store.SaveRoom(context.Background(), h.redis, r); err != nil {
		respondError(c, http.StatusInternalServerError, "could not save room")
		return
	}

	joinURL := fmt.Sprintf("%s/rooms/%s", h.frontendURL, roomID)
	var qrBase64 string
	if png, err := qrcode.Encode(joinURL, qrcode.Medium, 256); err == nil {
		qrBase64 = "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	}

	respondCreated(c, gin.H{
		"room_id":    roomID,
		"creator_id": creatorID,
		"link":       joinURL,
		"expires_at": r.ExpiresAt.Format(time.RFC3339),
		"qr_code":    qrBase64,
	})
}

func (h *Handler) GetRoom(c *gin.Context) {
	roomID := c.Param("id")
	r, err := store.GetRoom(context.Background(), h.redis, roomID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "could not fetch room")
		return
	}
	if r == nil {
		respondError(c, http.StatusNotFound, "room not found or has expired")
		return
	}
	respondOK(c, gin.H{
		"id":                r.ID,
		"status":            r.Status,
		"created_at":        r.CreatedAt.Format(time.RFC3339),
		"expires_at":        r.ExpiresAt.Format(time.RFC3339),
		"locked":            r.Status == "locked",
		"participant_count": 0,
	})
}

func (h *Handler) LockRoom(c *gin.Context) {
	roomID := c.Param("id")
	var body struct {
		CreatorID string `json:"creator_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.CreatorID == "" {
		respondError(c, http.StatusBadRequest, "creator_id is required")
		return
	}
	err := store.LockRoom(context.Background(), h.redis, roomID, body.CreatorID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrRoomNotFound):
			respondError(c, http.StatusNotFound, "room not found")
		case errors.Is(err, store.ErrNotCreator):
			respondError(c, http.StatusUnauthorized, "only the room creator can lock the room")
		case errors.Is(err, store.ErrAlreadyLocked):
			respondError(c, http.StatusConflict, "room is already locked")
		default:
			respondError(c, http.StatusInternalServerError, "could not lock room")
		}
		return
	}
	data, _ := realtime.NewEvent(realtime.EventRoomLocked, map[string]string{"room_id": roomID})
	h.manager.NotifyRoom(roomID, data)
	respondOK(c, gin.H{
		"status":    "locked",
		"locked_at": time.Now().Format(time.RFC3339),
	})
}
