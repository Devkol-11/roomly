package store

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

// NewClient opens a Redis connection and fatally exits if Redis is unreachable.
func NewClient(addr string) *redis.Client {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: "",
		DB:       0,
	})
	if err := client.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Redis connection failed: %v", err)
	}
	log.Println("Redis connected successfully")
	return client
}
