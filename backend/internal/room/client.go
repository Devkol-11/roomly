package room

import (
	"crypto/rand"
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 10 * 1024
)

type Client struct {
	ID          string
	DisplayName string
	RoomID      string
	Language    string // BCP-47 tag or plain name, e.g. "en", "French". Empty = no translation.
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
}

// NewClient creates a Client. participantID is optional — pass the creator_id to
// keep creator privileges across reconnects. language is the preferred language
// for AI translation (empty disables translation for this client).
func NewClient(displayName, roomID, participantID, language string, hub *Hub, conn *websocket.Conn) (*Client, error) {
	id := participantID
	if id == "" {
		var err error
		id, err = generateClientID()
		if err != nil {
			return nil, err
		}
	}
	return &Client{
		ID:          id,
		DisplayName: displayName,
		RoomID:      roomID,
		Language:    language,
		hub:         hub,
		conn:        conn,
		send:        make(chan []byte, 256),
	}, nil
}

func generateClientID() (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = charset[b[i]%62]
	}
	return string(b), nil
}

func (c *Client) ReadLoop() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("client %s disconnect: %v", c.ID, err)
			}
			break
		}
		c.handleMessage(raw)
	}
}

func (c *Client) WriteLoop() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(raw []byte) {
	var event Event
	if err := json.Unmarshal(raw, &event); err != nil {
		c.sendError("invalid message format")
		return
	}

	switch event.Type {
	case EventMessage:
		c.handleChat(event.Payload)
	case EventTypingStart:
		c.hub.broadcastExcept(c, mustEvent(EventTypingStart, TypingPayload{
			ParticipantID: c.ID,
			DisplayName:   c.DisplayName,
		}))
	case EventTypingStop:
		c.hub.broadcastExcept(c, mustEvent(EventTypingStop, TypingPayload{
			ParticipantID: c.ID,
			DisplayName:   c.DisplayName,
		}))
	case EventPollCreate:
		c.handlePollCreate(event.Payload)
	case "poll_voted":
		c.handlePollVote(event.Payload)
	case "lock_room":
		c.handleLockRoom()
	case "kick_member":
		c.handleKickMember(event.Payload)
	// Focus mode
	case "focus_mode_on":
		c.handleFocusModeOn()
	case "focus_mode_off":
		c.handleFocusModeOff()
	case "floor_request":
		c.handleFloorRequest()
	case "floor_release":
		c.handleFloorRelease()
	case "grant_floor":
		c.handleGrantFloor(event.Payload)
	// AI summary
	case "request_summary":
		c.handleSummaryRequest()
	default:
		c.sendError("unknown event type: " + event.Type)
	}
}

func (c *Client) handleChat(payload json.RawMessage) {
	var body struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(payload, &body); err != nil || body.Text == "" {
		c.sendError("invalid message payload")
		return
	}
	if len(body.Text) > 2000 {
		c.sendError("message too long (max 2000 characters)")
		return
	}

	// Enforce focus mode: only the floor holder may speak.
	if c.hub.IsFocusActive() && !c.hub.IsFloorHolder(c.ID) {
		c.sendError("focus mode is active — request the floor first")
		return
	}

	msgID, _ := generateClientID()
	msg := MessagePayload{
		ID:         msgID[:8],
		SenderID:   c.ID,
		SenderName: c.DisplayName,
		Text:       body.Text,
		Timestamp:  time.Now(),
	}

	// broadcastMessage handles per-language translation and message storage.
	c.hub.broadcastMessage(c, msg)
}

func (c *Client) handlePollCreate(payload json.RawMessage) {
	var body struct {
		Question string   `json:"question"`
		Options  []string `json:"options"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		c.sendError("invalid poll payload")
		return
	}
	if body.Question == "" || len(body.Question) > 200 {
		c.sendError("question must be 1-200 characters")
		return
	}
	if len(body.Options) < 2 || len(body.Options) > 5 {
		c.sendError("polls must have 2-5 options")
		return
	}

	pollID, _ := generateClientID()
	poll := &Poll{
		ID:          pollID[:8],
		RoomID:      c.RoomID,
		Question:    body.Question,
		Options:     body.Options,
		CreatedBy:   c.ID,
		CreatorName: c.DisplayName,
		CreatedAt:   time.Now(),
		Votes:       make(map[string]int),
	}

	if err := c.hub.SavePoll(poll); err != nil {
		c.sendError("could not create poll")
		return
	}

	c.hub.broadcast <- mustEvent(EventPollCreate, poll)
}

func (c *Client) handlePollVote(payload json.RawMessage) {
	var body PollVotePayload
	if err := json.Unmarshal(payload, &body); err != nil || body.PollID == "" {
		c.sendError("invalid vote payload")
		return
	}

	voted, err := c.hub.RecordVote(body.PollID, c.ID, body.OptionIndex)
	if err != nil {
		c.sendError("could not record vote")
		return
	}
	if !voted {
		c.sendError("you have already voted on this poll")
		return
	}

	results, err := c.hub.GetPollResults(body.PollID)
	if err != nil {
		c.sendError("could not get poll results")
		return
	}

	c.hub.broadcast <- mustEvent(EventPollUpdate, PollUpdatePayload{
		PollID: body.PollID,
		Votes:  results,
	})
}

func (c *Client) handleLockRoom() {
	if err := c.hub.LockRoomWS(c.ID); err != nil {
		c.sendError(err.Error())
	}
}

func (c *Client) handleKickMember(payload json.RawMessage) {
	var body struct {
		ParticipantID string `json:"participant_id"`
	}
	if err := json.Unmarshal(payload, &body); err != nil || body.ParticipantID == "" {
		c.sendError("participant_id is required")
		return
	}
	if err := c.hub.KickClient(c.ID, body.ParticipantID); err != nil {
		c.sendError(err.Error())
	}
}

// ─── Focus mode handlers ──────────────────────────────────────────────────────

func (c *Client) handleFocusModeOn() {
	if err := c.hub.EnableFocusMode(c.ID, c.DisplayName); err != nil {
		c.sendError(err.Error())
	}
}

func (c *Client) handleFocusModeOff() {
	if err := c.hub.DisableFocusMode(c.ID); err != nil {
		c.sendError(err.Error())
	}
}

func (c *Client) handleFloorRequest() {
	if err := c.hub.RequestFloor(c); err != nil {
		c.sendError(err.Error())
	}
}

func (c *Client) handleFloorRelease() {
	if err := c.hub.ReleaseFloor(c.ID, c.DisplayName); err != nil {
		c.sendError(err.Error())
	}
}

func (c *Client) handleGrantFloor(payload json.RawMessage) {
	var body struct {
		ParticipantID string `json:"participant_id"`
	}
	if err := json.Unmarshal(payload, &body); err != nil || body.ParticipantID == "" {
		c.sendError("participant_id is required")
		return
	}
	if err := c.hub.GrantFloor(c.ID, body.ParticipantID); err != nil {
		c.sendError(err.Error())
	}
}

// ─── AI summary handler ───────────────────────────────────────────────────────

func (c *Client) handleSummaryRequest() {
	if err := c.hub.RequestSummary(c.ID); err != nil {
		c.sendError(err.Error())
	}
}

func (c *Client) sendError(message string) {
	data, _ := NewEvent(EventError, ErrorPayload{Message: message})
	select {
	case c.send <- data:
	default:
	}
}
