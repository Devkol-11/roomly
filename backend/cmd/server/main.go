package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"roomly/internal/ai"
	"roomly/internal/api"
	rdb "roomly/internal/redis"
	"roomly/internal/room"

	"github.com/gin-gonic/gin"
)

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	port := ":" + getEnv("PORT", "8080")
	redisAddr := getEnv("REDIS_URL", "localhost:6379")
	frontendURL := getEnv("FRONTEND_URL", "http://localhost:5173")
	mistralKey := getEnv("MISTRAL_API_KEY", "")

	redisClient := rdb.NewClient(redisAddr)

	aiClient := ai.NewClient(mistralKey)
	if aiClient.Enabled() {
		log.Println("Mistral AI enabled")
	} else {
		log.Println("Mistral AI disabled (set MISTRAL_API_KEY to enable)")
	}

	manager := room.NewManager(redisClient, aiClient)

	router := gin.Default()
	api.RegisterRoutes(router, redisClient, manager, frontendURL)

	srv := &http.Server{
		Addr:    port,
		Handler: router,
	}

	go func() {
		log.Printf("Roomly running on %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	log.Println("Server stopped")
}
