package ws

import (
	"context"
	"log"
	"net/http"

	"roomly/internal/realtime"
	"roomly/internal/store"

	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var upgrader = gorillaws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Handler struct {
	redis   *redis.Client
	manager *realtime.Manager
}

func NewHandler(redisClient *redis.Client, manager *realtime.Manager) *Handler {
	return &Handler{redis: redisClient, manager: manager}
}

func (h *Handler) ServeWS(c *gin.Context) {
	roomID        := c.Param("id")
	displayName   := c.Query("display_name")
	participantID := c.Query("participant_id")
	language      := c.Query("lang")

	if len(displayName) < 2 || len(displayName) > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "display_name must be 2-20 characters"})
		return
	}

	ctx := context.Background()
	r, err := store.GetRoom(ctx, h.redis, roomID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch room"})
		return
	}
	if r == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "room not found or has expired"})
		return
	}
	if r.Status == "locked" && participantID != r.CreatorID {
		c.JSON(http.StatusForbidden, gin.H{"error": "room is locked"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	hub := h.manager.GetOrCreateHub(roomID, r.CreatorID)
	client, err := realtime.NewClient(displayName, roomID, participantID, language, hub, conn)
	if err != nil {
		conn.Close()
		return
	}

	hub.Register(client)
	go client.ReadLoop()
	go client.WriteLoop()
}
