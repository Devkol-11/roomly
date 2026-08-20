package api

import (
	"net/http"

	"roomly/internal/realtime"
	"roomly/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func RegisterRoutes(r *gin.Engine, client *redis.Client, manager *realtime.Manager, frontendURL string) {
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", frontendURL)
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	h := NewHandler(client, manager, frontendURL)
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
