package websocket

import (
	"context"
	"log"
	"net/http"

	rdb "roomly/internal/redis"
	"roomly/internal/room"

	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"
	goredis "github.com/redis/go-redis/v9"
)

var upgrader = gorillaws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Handler struct {
	redis   *goredis.Client
	manager *room.Manager
}

func NewHandler(redis *goredis.Client, manager *room.Manager) *Handler {
	return &Handler{redis: redis, manager: manager}
}

func (h *Handler) ServeWS(c *gin.Context) {
	roomID := c.Param("id")
	displayName := c.Query("display_name")
	participantID := c.Query("participant_id") // pass creator_id to get creator privileges
	language := c.Query("lang")                // BCP-47 tag or plain name, e.g. "en", "French"

	if len(displayName) < 2 || len(displayName) > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "display_name must be 2-20 characters"})
		return
	}

	ctx := context.Background()

	r, err := rdb.GetRoom(ctx, h.redis, roomID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch room"})
		return
	}
	if r == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "room not found or has expired"})
		return
	}
	if r.Status == "locked" {
		if participantID != r.CreatorID {
			c.JSON(http.StatusForbidden, gin.H{"error": "room is locked"})
			return
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	hub := h.manager.GetOrCreateHub(roomID, r.CreatorID)

	client, err := room.NewClient(displayName, roomID, participantID, language, hub, conn)
	if err != nil {
		conn.Close()
		return
	}

	hub.Register(client)

	go client.ReadLoop()
	go client.WriteLoop()
}
