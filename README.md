# Roomly

Ephemeral real-time rooms — no accounts, no persistence. Create a room, share the link, collaborate, it self-destructs.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Go, Gin, Gorilla WebSocket, go-redis |
| State | Redis (TTL-based, no SQL) |
| Frontend | React (Vite) |
| Infra | Docker Compose |

## Monorepo Structure

```
roomly/
├── backend/     # Go server
└── frontend/    # React app (coming soon)
```

## Quick Start

```bash
# Start Redis
cd backend && docker-compose up -d

# Run backend
go run cmd/server/main.go

# Run frontend (once scaffolded)
cd frontend && npm run dev
```

## Backend API

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/rooms | Create a room |
| GET | /api/rooms/:id | Get room info |
| POST | /api/rooms/:id/lock | Lock the room |
| GET | /ws/rooms/:id | WebSocket connection |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `message` | both | Chat message |
| `user_joined` | server→client | Participant joined |
| `user_left` | server→client | Participant left |
| `typing_started` | both | Typing indicator on |
| `typing_stopped` | both | Typing indicator off |
| `poll_created` | both | New poll |
| `poll_voted` | client→server | Cast a vote |
| `poll_updated` | server→client | Live vote results |
| `lock_room` | client→server | Creator locks room |
| `kick_member` | client→server | Creator kicks participant |
| `kicked` | server→client | You were removed |
| `room_locked` | server→client | Room is now locked |
| `room_expired` | server→client | Room has self-destructed |
