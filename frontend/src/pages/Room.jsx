import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useRoom } from '../hooks/useRoom.js'
import { api, loadSession, saveSession, formatRemaining } from '../lib/api.js'
import { CenterCard, FormError, Icon } from '../components/ui.jsx'

import RoomHeader from '../components/room/RoomHeader.jsx'
import ParticipantList from '../components/room/ParticipantList.jsx'
import FocusModeBar from '../components/room/FocusModeBar.jsx'
import MessageList from '../components/room/MessageList.jsx'
import TypingIndicator from '../components/room/TypingIndicator.jsx'
import ChatInput from '../components/room/ChatInput.jsx'
import CreatePollModal from '../components/room/CreatePollModal.jsx'
import SummaryModal from '../components/room/SummaryModal.jsx'
import QRModal from '../components/room/QRModal.jsx'

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Arabic', 'Hindi', 'Chinese', 'Japanese', 'Korean', 'Yoruba', 'Igbo', 'Hausa', 'Swahili']

function useRoomInfo(roomId) {
  const [info, setInfo] = useState({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    api(`/api/rooms/${roomId}`)
      .then(data => !cancelled && setInfo({ status: 'ok', ...data }))
      .catch(err => !cancelled && setInfo({ status: err.status === 404 ? 'missing' : 'error' }))
    return () => { cancelled = true }
  }, [roomId])
  return info
}

function useRemaining(expiresAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now) : null
}

export default function Room() {
  const { id: roomId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const info = useRoomInfo(roomId)
  const remaining = useRemaining(info.expires_at)
  const [session, setSession] = useState(() => loadSession(roomId))

  if (info.status === 'loading') {
    return <div className="grid min-h-[100dvh] place-items-center text-sm text-fg-3">Opening room…</div>
  }
  if (info.status === 'missing') {
    return (
      <CenterCard icon="hourglass" title="This room doesn’t exist" actions={<a href="/" className="btn btn-primary">Start a new room</a>}>
        The link may be wrong, or the room already closed and was deleted.
      </CenterCard>
    )
  }
  if (info.status === 'error') {
    return (
      <CenterCard icon="wifiOff" tone="danger" title="Can’t reach Roomly"
        actions={<button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>}>
        The server didn’t respond. Check your connection and try again.
      </CenterCard>
    )
  }

  if (!session) {
    return (
      <Lobby
        roomId={roomId} info={info} remaining={remaining}
        onJoin={(s) => { saveSession(roomId, s); setSession(s) }}
      />
    )
  }

  return (
    <LiveRoom
      roomId={roomId} session={session} remaining={remaining}
      justCreated={!!location.state?.justCreated}
      onLeave={() => navigate('/')}
      onRejoin={() => setSession(null)}
    />
  )
}

/* ─── Pre-join screen ─────────────────────────────────────────────────────── */

function Lobby({ roomId, info, remaining, onJoin }) {
  const [name, setName] = useState('')
  const [lang, setLang] = useState('')
  const [hostKey, setHostKey] = useState('')
  const [more, setMore] = useState(info.locked)
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Your name needs at least 2 characters.')
    if (info.locked && !hostKey.trim()) return setError('This room is locked. Only the host can enter with their host key.')
    onJoin({ displayName: name.trim(), creatorId: hostKey.trim() || null, lang: lang || null })
  }

  return (
    <CenterCard title="Join the room">
      <div className="mb-6 flex flex-wrap items-center justify-center gap-1.5">
        <span className="chip font-mono">{roomId}</span>
        {info.locked
          ? <span className="chip !bg-warn-soft !text-warn"><Icon name="lock" size={12} />Locked</span>
          : <span className="chip !bg-live-soft !text-live"><span className="h-1.5 w-1.5 rounded-full bg-live" />{info.participant_count > 0 ? `${info.participant_count} here now` : 'Live'}</span>}
        {remaining != null && <span className="chip !bg-ember-soft !text-ember"><Icon name="clock" size={12} />{formatRemaining(remaining)} left</span>}
      </div>

      <form onSubmit={submit} className="space-y-4 text-left">
        <div>
          <label className="label" htmlFor="j-name">Your name</label>
          <input id="j-name" className="input" placeholder="How others will see you" autoFocus autoComplete="nickname"
            value={name} onChange={e => { setName(e.target.value); setError('') }} maxLength={20} />
        </div>

        <button type="button" className="flex items-center gap-1 text-[13px] font-medium text-fg-2 hover:text-fg" onClick={() => setMore(m => !m)} aria-expanded={more}>
          <Icon name="chevron" size={14} className={`transition-transform ${more ? '' : '-rotate-90'}`} />More options
        </button>

        {more && (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="j-lang">Translate messages into</label>
              <select id="j-lang" className="input" value={lang} onChange={e => setLang(e.target.value)}>
                <option value="">Don’t translate</option>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="j-key">Host key <span className="font-normal text-fg-3">(only if you created this room)</span></label>
              <input id="j-key" className="input font-mono text-sm" placeholder="Paste your host key" autoComplete="off"
                value={hostKey} onChange={e => setHostKey(e.target.value)} />
            </div>
          </div>
        )}

        <FormError>{error}</FormError>
        <button className="btn btn-primary btn-lg w-full" type="submit">Join room</button>
      </form>
    </CenterCard>
  )
}

/* ─── Live room ───────────────────────────────────────────────────────────── */

function LiveRoom({ roomId, session, remaining, justCreated, onLeave, onRejoin }) {
  const { state, send, reconnect, clearError } = useRoom(roomId, session)
  const [modal, setModal] = useState(justCreated ? 'share' : null)
  const [showPeople, setShowPeople] = useState(false)

  // A new recap pops open automatically until it has been dismissed once.
  const [seenSummary, setSeenSummary] = useState(null)
  const summaryOpen = !!state.summary && (modal === 'summary' || state.summary !== seenSummary)
  const closeSummary = () => { setSeenSummary(state.summary); setModal(null) }

  useEffect(() => {
    if (!state.serverError) return
    const t = setTimeout(clearError, 5000)
    return () => clearTimeout(t)
  }, [state.serverError, clearError])

  // Drop the "just created" flag so a refresh doesn't reopen the dialog.
  const navigate = useNavigate()
  useEffect(() => {
    if (justCreated) navigate(`/rooms/${roomId}`, { replace: true, state: null })
  }, [justCreated, navigate, roomId])

  if (state.roomStatus === 'expired') {
    return (
      <CenterCard icon="hourglass" tone="ember" title="Time’s up"
        actions={<>
          {state.summary && <button className="btn btn-secondary" onClick={() => setModal('summary')}>View recap</button>}
          <a href="/" className="btn btn-primary">Start a new room</a>
        </>}>
        This room closed and its messages were deleted.
        <AnimatePresence>
          {summaryOpen && <SummaryModal summary={state.summary} onClose={closeSummary} />}
        </AnimatePresence>
      </CenterCard>
    )
  }
  if (state.roomStatus === 'kicked') {
    return (
      <CenterCard icon="ban" tone="danger" title="You were removed" actions={<a href="/" className="btn btn-primary">Back to home</a>}>
        The host removed you from this room.
      </CenterCard>
    )
  }
  if (state.connection === 'rejected') {
    return (
      <CenterCard icon="lock" tone="warn" title="Couldn’t join this room"
        actions={<>
          <button className="btn btn-primary" onClick={reconnect}>Try again</button>
          <button className="btn btn-secondary" onClick={onRejoin}>Change name or host key</button>
        </>}>
        The room may be locked, full, or already closed.
      </CenterCard>
    )
  }

  const { focus } = state
  const focusBlocks = focus.active && focus.holderID !== state.selfId
  const canChat = state.connection === 'open' && !focusBlocks
  const placeholder =
    state.connection !== 'open' ? 'Connecting…' :
    focusBlocks ? (focus.holderID ? `${focus.holderName} has the floor` : 'Take the floor to speak') :
    'Write a message'

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <RoomHeader
        roomId={roomId} remaining={remaining} status={state.roomStatus}
        isCreator={state.isCreator} aiEnabled={state.aiEnabled} focusActive={focus.active}
        participantCount={Object.keys(state.participants).length}
        onToggleParticipants={() => setShowPeople(v => !v)}
        onShare={() => setModal('share')}
        onPoll={() => setModal('poll')}
        onFocus={() => send(focus.active ? 'focus_mode_off' : 'focus_mode_on')}
        onSummary={() => send('request_summary')}
        onLock={() => window.confirm('Lock the room? People who aren’t here yet won’t be able to join.') && send('lock_room')}
        onLeave={onLeave}
      />

      {state.connection === 'closed' && (
        <div className="flex items-center justify-center gap-3 bg-warn-soft px-4 py-2 text-sm text-warn">
          <Icon name="wifiOff" size={15} />Connection lost.
          <button className="font-medium underline underline-offset-2" onClick={reconnect}>Reconnect</button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <AnimatePresence>
            {focus.active && (
              <FocusModeBar key="focus" focus={focus} selfId={state.selfId}
                onRequestFloor={() => send('floor_request')} onReleaseFloor={() => send('floor_release')} />
            )}
          </AnimatePresence>

          <MessageList
            timeline={state.timeline} polls={state.polls} myVotes={state.myVotes} selfId={state.selfId}
            onVote={(pollId, idx) => send('poll_voted', { poll_id: pollId, option_index: idx })}
            emptyHint={state.isCreator ? 'Invite people with the link, then say hello.' : 'Say hello to the room.'}
          />

          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <TypingIndicator typing={state.typing} />
            <ChatInput
              disabled={!canChat}
              placeholder={placeholder}
              onSend={(text) => send('message', { text })}
              onTypingStart={() => send('typing_started')}
              onTypingStop={() => send('typing_stopped')}
            />
            <p className="mt-2 hidden text-center text-[11px] text-fg-3 sm:block">
              <span className="kbd">Enter</span> to send · <span className="kbd">Shift</span> + <span className="kbd">Enter</span> for a new line · Messages are deleted when the room closes
            </p>
          </div>

          <AnimatePresence>
            {state.serverError && (
              <motion.div role="alert"
                className="absolute left-1/2 top-3 z-30 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm shadow-pop"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
                <span className="first-letter:uppercase">{state.serverError}</span>
                <button className="text-fg-3 hover:text-fg" onClick={clearError} aria-label="Dismiss"><Icon name="x" size={14} /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* People: fixed panel on desktop, slide-over on small screens */}
        <aside className="hidden w-64 shrink-0 border-l border-line bg-surface lg:block">
          <People state={state} send={send} />
        </aside>
        <AnimatePresence>
          {showPeople && (
            <motion.div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setShowPeople(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.aside className="absolute inset-y-0 right-0 w-72 max-w-[85%] border-l border-line bg-surface shadow-pop"
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
                <People state={state} send={send} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {modal === 'poll' && (
          <CreatePollModal key="poll" onClose={() => setModal(null)}
            onSubmit={(q, opts) => { send('poll_created', { question: q, options: opts }); setModal(null) }} />
        )}
        {summaryOpen && <SummaryModal key="summary" summary={state.summary} onClose={closeSummary} />}
        {modal === 'share' && <QRModal key="share" roomId={roomId} session={session} isCreator={state.isCreator || !!session.creatorId} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  )
}

function People({ state, send }) {
  return (
    <ParticipantList
      participants={state.participants} selfId={state.selfId}
      floorHolderID={state.focus.holderID} focusActive={state.focus.active} isCreator={state.isCreator}
      onKick={(id) => send('kick_member', { participant_id: id })}
      onGrantFloor={(id) => send('grant_floor', { participant_id: id })}
    />
  )
}
