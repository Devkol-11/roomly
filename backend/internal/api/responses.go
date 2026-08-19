package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func respondOK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

func respondCreated(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, data)
}

func respondError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
}
