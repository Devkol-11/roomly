import { useState, useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useRoom } from '../hooks/useRoom.js'

import RoomHeader      from '../components/room/RoomHeader.jsx'
import ParticipantList from '../components/room/ParticipantList.jsx'
import FocusModeBar    from '../components/room/FocusModeBar.jsx'
import MessageList     from '../components/room/MessageList.jsx'
import TypingIndicator from '../components/room/TypingIndicator.jsx'
import ChatInput       from '../components/room/ChatInput.jsx'
import CreatePollModal from '../components/room/CreatePollModal.jsx'
import SummaryModal    from '../components/room/SummaryModal.jsx'
import QRModal         from '../components/room/QRModal.jsx'

import './Room.css'

export default function Room() {
  const { id: roomId } = useParams()
  const location        = useLocation()

  // ── Session resolution ──
  // Priority: router state (from Create flow) > localStorage > null (show join form)
  const saved = JSON.parse(localStorage.getItem(`roomly:${roomId}`) || 'null')
  const nav   = location.state || {}

  const [session, setSession] = useState(() => {
    const displayName = nav.displayName || saved?.displayName || null
    const creatorId   = nav.creatorId   || saved?.creatorId   || null
    return displayName ? { displayName, creatorId } : null
  })

  // Join form state (when no session yet)
  const [joinName,      setJoinName]      = useState('')
  const [joinCreatorId, setJoinCreatorId] = useState('')
  const [joinLang,      setJoinLang]      = useState('')
  const [joinError,     setJoinError]     = useState('')

  // Modals
  const [showPoll,    setShowPoll]    = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showQR,      setShowQR]      = useState(false)

  // ── WebSocket hook (only when session is set) ──
  const { state, send } = useRoom(
    roomId,
    session?.displayName,
    session?.creatorId,
    session?.lang
  )

  const isCreator = !!session?.creatorId

  // Auto-open summary when it arrives
  useEffect(() => {
    if (state.summary) setShowSummary(true)
  }, [state.summary])

  // ── Join form submit ──
  function handleJoin(e) {
    e.preventDefault()
    if (joinName.trim().length < 2) {
      setJoinError('Name must be at least 2 characters.')
      return
    }
    const s = {
      displayName: joinName.trim(),
      creatorId:   joinCreatorId.trim() || null,
      lang:        joinLang.trim() || null,
    }
    localStorage.setItem(`roomly:${roomId}`, JSON.stringify(s))
    setSession(s)
  }

  // ── Status overlays ──
  if (state.roomStatus === 'expired') {
    return (
      <div className="status-overlay">
        <div className="status-card">
          <div className="status-icon">💨</div>
          <h2>This room has expired</h2>
          <p>Ephemeral by design — it self-destructed on schedule.</p>
          <a href="/" className="btn btn-primary">Back to home</a>
        </div>
      </div>
    )
  }

  if (state.roomStatus === 'kicked') {
    return (
      <div className="status-overlay">
        <div className="status-card">
          <div className="status-icon">🚪</div>
          <h2>You were removed</h2>
          <p>The room creator removed you from this room.</p>
          <a href="/" className="btn btn-primary">Back to home</a>
        </div>
      </div>
    )
  }

  // ── Join overlay ──
  if (!session) {
    return (
      <div className="status-overlay">
        <div className="join-card card">
          <h2 className="join-title">Join room</h2>
          <p className="join-sub">Room <code>{roomId}</code></p>
          <hr className="divider" />
          <form onSubmit={handleJoin}>
            <div className="field">
              <label className="label" htmlFor="j-name">Your name</label>
              <input
                id="j-name"
                className="input"
                placeholder="e.g. Bob"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                maxLength={20}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="j-creator">Creator ID (optional — paste if you created this room)</label>
              <input
                id="j-creator"
                className="input"
                placeholder="Paste creator ID to unlock controls"
                value={joinCreatorId}
                onChange={e => setJoinCreatorId(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="j-lang">Preferred language for AI translation (optional)</label>
              <input
                id="j-lang"
                className="input"
                placeholder='e.g. French, es, de'
                value={joinLang}
                onChange={e => setJoinLang(e.target.value)}
              />
            </div>
            {joinError && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{joinError}</p>}
            <button className="btn btn-primary btn-full" type="submit">Join room</button>
          </form>
        </div>
      </div>
    )
  }

  // ── Main room UI ──
  return (
    <div className="room-page">
      <RoomHeader
        roomId={roomId}
        status={state.roomStatus}
        connected={state.connected}
        isCreator={isCreator}
        onLock={() => send('lock_room')}
        onFocusOn={() => send('focus_mode_on')}
        onFocusOff={() => send('focus_mode_off')}
        focusActive={state.focus.active}
        onShowQR={() => setShowQR(true)}
        onRequestSummary={() => send('request_summary')}
        onShowPoll={() => setShowPoll(true)}
      />

      <div className="room-body">
        <aside className="room-sidebar">
          <ParticipantList
            participants={state.participants}
            myId={session.creatorId || ''}
            creatorId={session.creatorId || ''}
            floorHolderID={state.focus.holderID}
            isCreator={isCreator}
            onKick={(id) => send('kick_member', { participant_id: id })}
            onGrantFloor={(id) => send('grant_floor', { participant_id: id })}
            focusActive={state.focus.active}
          />
        </aside>

        <div className="room-main">
          {state.focus.active && (
            <FocusModeBar
              focus={state.focus}
              myId={session.creatorId || ''}
              onRequestFloor={() => send('floor_request')}
              onReleaseFloor={() => send('floor_release')}
            />
          )}

          {state.serverError && (
            <div className="server-error-toast">
              ⚠ {state.serverError}
              <button onClick={() => send('CLEAR_ERROR')} className="toast-close">×</button>
            </div>
          )}

          <MessageList
            messages={state.messages}
            polls={state.polls}
            myId={session.creatorId || session.displayName}
            onVote={(pollId, idx) => send('poll_voted', { poll_id: pollId, option_index: idx })}
          />

          <TypingIndicator typing={state.typing} />

          <ChatInput
            disabled={state.roomStatus === 'locked' || !state.connected}
            onSend={(text) => send('message', { text })}
            onTypingStart={() => send('typing_started')}
            onTypingStop={() => send('typing_stopped')}
          />
        </div>
      </div>

      {showPoll && (
        <CreatePollModal
          onClose={() => setShowPoll(false)}
          onSubmit={(q, opts) => {
            send('poll_created', { question: q, options: opts })
            setShowPoll(false)
          }}
        />
      )}

      {showSummary && state.summary && (
        <SummaryModal
          summary={state.summary}
          onClose={() => setShowSummary(false)}
        />
      )}

      {showQR && (
        <QRModal
          roomId={roomId}
          onClose={() => setShowQR(false)}
        />
      )}
    </div>
  )
}
