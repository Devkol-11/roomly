# Roomly — Request Flows

Each diagram follows a request from the browser to Redis and back. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system map and [REALTIME.md](./REALTIME.md) for socket internals.

---

## 1. Create a room

```mermaid
sequenceDiagram
    autonumber
    actor Host
    participant UI as Home.jsx / CreateRoomForm
    participant API as Go: Handler.CreateRoom
    participant R as Redis

    Host->>UI: name "Ada", duration 60 min, Create room
    UI->>API: POST /api/rooms {display_name, duration_minutes}
    API->>API: validate duration ∈ {15,30,60,120}, name 2–20 chars
    API->>API: room_id = rand(8), creator_id = rand(16)
    API->>R: HSET room:{id} {...}  +  EXPIRE ttl = 60 min
    API->>API: QR PNG of FRONTEND_URL/rooms/{id} (base64)
    API-->>UI: 201 {room_id, creator_id, link, expires_at, qr_code}
    UI->>UI: localStorage["roomly:{id}"] = {displayName, creatorId, qrCode, link}
    UI->>Host: navigate /rooms/{id} (state: justCreated)
    Note over UI: Room page connects the socket and<br/>auto-opens the Invite dialog (link · code · QR · host key)
```

---

## 2. Join a room (guest)

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant RP as Room.jsx
    participant API as Go REST
    participant WS as Go WebSocket
    participant H as Hub

    Guest->>RP: opens /rooms/aB3xZ9qR (shared link)
    RP->>API: GET /api/rooms/aB3xZ9qR
    API-->>RP: {expires_at, locked, participant_count}
    RP->>Guest: Lobby — code, "3 here now", "42:10 left", name field,<br/>More options: translation language, host key
    Guest->>RP: name "Tunde", lang French → Join
    RP->>RP: saveSession(roomId, {displayName, lang})
    RP->>WS: new WebSocket(/ws/rooms/:id?display_name=Tunde&lang=French)
    WS->>H: Register(client)
    H-->>RP: room_state (self_id, participants, focus, polls)
    H-->>RP: user_joined (to everyone, incl. Tunde)
    RP->>Guest: LiveRoom
```

Error branches: **404** → "This room doesn't exist"; **locked** without host key → lobby insists on the host key; socket refused → "Couldn't join this room".

---

## 3. Send a chat message

```mermaid
sequenceDiagram
    autonumber
    participant A as Ada's ChatInput
    participant RL as Ada's ReadLoop
    participant H as Hub
    participant R as Redis
    participant WL as Every WriteLoop
    participant B as Everyone's useRoom

    A->>A: keystroke → send(typing_started) once, debounce 2 s → typing_stopped
    A->>RL: {"type":"message","payload":{"text":"Ship on Friday?"}}
    RL->>RL: validate (non-empty, ≤2000)
    alt focus mode on and Ada isn't floor holder
        RL-->>A: error "focus mode is active — request the floor first"
    end
    RL->>H: broadcastMessage(msg{id, sender_id, sender_name, text, timestamp})
    opt AI enabled
        H->>R: RPUSH room:{id}:messages
    end
    H->>WL: push frame into each client's send chan
    WL-->>B: message event
    B->>B: reducer: append to timeline, clear sender from typing list
    Note over B: MessageList groups consecutive messages from<br/>the same sender within 5 min, own messages right-aligned (sender_id matches self_id)
```

---

## 4. Polls

```mermaid
sequenceDiagram
    autonumber
    actor Host
    actor Guest
    participant H as Hub
    participant R as Redis

    Host->>H: poll_created {question, options[]}
    H->>H: validate 1–200 chars, 2–5 options
    H->>R: HSET poll:{room}:{poll}
    H->>H: polls[pollId] = poll (memory, for snapshots)
    H-->>Host: poll_created
    H-->>Guest: poll_created
    Guest->>H: poll_voted {poll_id, option_index: 0}
    H->>H: ValidPollOption?
    H->>R: HSETNX poll:{room}:{poll}:votes {participantId} 0
    alt already voted (HSETNX = 0)
        H-->>Guest: error "you have already voted on this poll"
    else first vote
        H->>R: HVALS → tally
        H-->>Host: poll_updated {votes}
        H-->>Guest: poll_updated {votes}
    end
```

---

## 5. Focus mode (talking stick)

```mermaid
stateDiagram-v2
    [*] --> Off
    Off --> HostHolds: host focus_mode_on
    HostHolds --> Free: holder floor_release
    Free --> MemberHolds: anyone floor_request
    MemberHolds --> Free: holder floor_release / holder leaves
    HostHolds --> MemberHolds: host grant_floor(id)
    MemberHolds --> MemberHolds: host grant_floor(other)
    Free --> MemberHolds: host grant_floor(id)
    HostHolds --> Off: host focus_mode_off
    Free --> Off: host focus_mode_off
    MemberHolds --> Off: host focus_mode_off
```

While focus mode is on, `handleChat` rejects messages from anyone who isn't the floor holder; the composer is disabled client-side with "X has the floor".

---

## 6. AI recap

```mermaid
sequenceDiagram
    autonumber
    actor Host
    participant H as Hub
    participant R as Redis
    participant AI as Mistral (large)
    participant All as All clients

    Host->>H: request_summary
    H->>H: IsCreator? AI enabled?
    H-->>Host: (returns immediately, work continues async)
    par goroutine
        H->>R: LRANGE room:{id}:messages 0 -1
        H->>AI: Summarize(messages) → JSON
        AI-->>H: {tldr, decisions[], action_items[], sentiment}
        H->>All: room_summary (via broadcast channel)
    end
    All->>All: SummaryModal opens automatically (until dismissed)
```

The same summary is generated automatically just before expiry, so the recap is the last thing people see.

---

## 7. Lock & kick

```mermaid
sequenceDiagram
    autonumber
    actor Host
    participant H as Hub
    participant R as Redis
    actor Target
    actor Others

    Host->>H: lock_room
    H->>R: HSET room:{id} status=locked locked_at=…
    H-->>Others: room_locked
    H-->>Target: room_locked
    Note over R: future upgrades without the host key → 403

    Host->>H: kick_member {participant_id: Target}
    H->>H: run(): sendTo(Target, kicked) → close(Target.send)
    H-->>Target: kicked (flushed) → CloseMessage
    H->>R: SREM participants
    H-->>Others: user_left
```

---

## 8. Expiry (self-destruct)

```mermaid
sequenceDiagram
    autonumber
    participant T as Hub.watchExpiry
    participant R as Redis
    participant H as Hub.run
    participant M as Manager
    participant All as Clients

    T->>R: TTL room:{id}
    T->>T: sleep(ttl)
    opt AI enabled
        T->>All: room_summary
    end
    T->>H: expireCh <- {}
    H->>All: room_expired, then close(send) for each
    H->>H: close(done) and return
    H->>M: onClose() → delete hubs[roomID]
    Note over R: room:{id} key already gone (TTL).<br/>GET /api/rooms/{id} now → 404
    All->>All: "Time's up" screen (with "View recap")
```

Client-side, the header countdown is computed from `expires_at` (fetched once) so it keeps ticking even if the socket drops; under 5 minutes it turns solid orange.
