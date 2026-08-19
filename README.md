# Roomly

Ephemeral real-time rooms — no accounts, no persistence. Create a room, share the link, collaborate, it self-destructs.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Go, Gin, Gorilla WebSocket, go-redis |
| State | Redis (TTL-based, no SQL) |
| AI | Mistral AI (summarization + live translation) |
| Frontend | React (Vite) |
| Infra | Docker Compose |

## Monorepo Structure

```
roomly/
├── backend/
│   ├── cmd/server/         # Entry point
│   ├── internal/
│   │   ├── ai/             # Mistral AI client (summarize + translate)
│   │   ├── api/            # HTTP handlers and routes
│   │   ├── redis/          # Redis client and room persistence
│   │   ├── room/           # Hub, Client, events, focus mode
│   │   └── websocket/      # WebSocket upgrade handler
│   ├── .env.example
│   └── docker-compose.yml
└── frontend/               # React app (coming soon)
```

## Quick Start

```bash
# Start Redis
cd backend && docker-compose up -d

# Copy and configure environment
cp .env.example .env
# Add MISTRAL_API_KEY to enable AI features (optional)

# Run backend
go run cmd/server/main.go

# Run frontend (once scaffolded)
cd frontend && npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `REDIS_URL` | `localhost:6379` | Redis address |
| `FRONTEND_URL` | `http://localhost:5173` | Used in join links and QR codes |
| `MISTRAL_API_KEY` | _(empty)_ | Mistral API key — leave blank to disable AI |
| `DEFAULT_ROOM_DURATION` | `60` | Default room TTL in minutes |
| `MAX_ROOM_DURATION` | `120` | Maximum allowed TTL |

## Backend API

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /api/rooms | Create a room |
| GET | /api/rooms/:id | Get room info |
| POST | /api/rooms/:id/lock | Lock the room (HTTP fallback) |
| GET | /ws/rooms/:id | WebSocket connection |

### POST /api/rooms

**Request**
```json
{ "duration_minutes": 60, "display_name": "Alice" }
```

**Response** — includes a ready-to-embed QR code and the creator's privileged ID.
```json
{
  "room_id": "aB3xZ9qR",
  "creator_id": "kJ7mNpLwQvYtRsUo",
  "link": "http://localhost:5173/rooms/aB3xZ9qR",
  "expires_at": "2026-08-20T15:00:00Z",
  "qr_code": "data:image/png;base64,..."
}
```

### WebSocket connection

```
ws://localhost:8080/ws/rooms/:id
  ?display_name=Alice
  &participant_id=<creator_id>   # optional — grants creator privileges
  &lang=French                   # optional — preferred language for live translation
```

`lang` accepts BCP-47 tags (`en`, `es`, `fr`) or plain names (`French`, `Spanish`).

## WebSocket Events

### Core

| Event | Direction | Description |
|-------|-----------|-------------|
| `message` | both | Chat message |
| `user_joined` | server→client | Participant joined |
| `user_left` | server→client | Participant left |
| `typing_started` | both | Typing indicator on |
| `typing_stopped` | both | Typing indicator off |
| `error` | server→client | Operation rejected with a reason |

### Room control (creator only)

| Event | Direction | Description |
|-------|-----------|-------------|
| `lock_room` | client→server | Lock the room |
| `room_locked` | server→client | Room is now locked |
| `kick_member` + `participant_id` | client→server | Remove a participant |
| `kicked` | server→client | You were removed |
| `room_expired` | server→client | Room has self-destructed |

### Polls

| Event | Direction | Description |
|-------|-----------|-------------|
| `poll_created` | both | New poll broadcast |
| `poll_voted` + `poll_id`, `option_index` | client→server | Cast a vote |
| `poll_updated` | server→client | Live vote tally |

### Focus mode — talking stick

| Event | Direction | Description |
|-------|-----------|-------------|
| `focus_mode_on` | client→server | Creator enables focus mode (gets the floor) |
| `focus_mode_off` | client→server | Creator disables focus mode |
| `focus_mode_enabled` | server→client | Focus mode is now active; includes current floor holder |
| `focus_mode_disabled` | server→client | Focus mode turned off |
| `floor_request` | client→server | Claim the floor (when it is free) |
| `floor_release` | client→server | Give up the floor |
| `grant_floor` + `participant_id` | client→server | Creator hands floor to a specific person |
| `floor_granted` | server→client | A participant now has the floor |
| `floor_released` | server→client | Floor is free |

Only the floor holder can send `message` events while focus mode is active. All others receive an `error` event if they try.

### AI features

> Requires `MISTRAL_API_KEY` to be set. All AI features are silently skipped when the key is absent.

| Event | Direction | Description |
|-------|-----------|-------------|
| `request_summary` | client→server | Creator requests an on-demand summary |
| `room_summary` | server→client | AI-generated summary (also auto-sent before `room_expired`) |

**`room_summary` payload**
```json
{
  "tldr": "The team agreed on the launch date and assigned tasks.",
  "decisions": ["Launch on Friday", "Alice owns the backend deploy"],
  "action_items": ["Bob to update the changelog", "Carol to review the PR"],
  "sentiment": "positive",
  "message_count": 42
}
```

**Live translation** — when a client connects with `?lang=French`, every message sent by participants with a different language is translated by Mistral before delivery. The `message` payload includes two extra fields when translation is applied:

```json
{
  "id": "a1b2c3d4",
  "sender_id": "...",
  "sender_name": "Alice",
  "text": "Bonjour tout le monde",
  "original_text": "Hello everyone",
  "translated_from": "en",
  "timestamp": "2026-08-20T12:00:00Z"
}
```
