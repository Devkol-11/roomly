package api

import (
	"net/http"

	"roomly/internal/room"
	ws "roomly/internal/websocket"

	"github.com/gin-gonic/gin"
	goredis "github.com/redis/go-redis/v9"
)

func RegisterRoutes(r *gin.Engine, client *goredis.Client, manager *room.Manager) {
	h := NewHandler(client, manager)
	wsHandler := ws.NewHandler(client, manager)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	rooms := r.Group("/api/rooms")
	{
		rooms.POST("", h.CreateRoom)
		rooms.GET("/:id", h.GetRoom)
		rooms.POST("/:id/lock", h.LockRoom)
	}

	r.GET("/ws/rooms/:id", wsHandler.ServeWS)
}
