import { useState, useEffect } from 'react'
import './RoomHeader.css'

function useCountdown(roomId) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
    fetch(`${API}/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.expires_at) return
        const expires = new Date(data.expires_at).getTime()

        const tick = () => {
          const diff = expires - Date.now()
          if (diff <= 0) { setLabel('Expired'); return }
          const m = Math.floor(diff / 60000)
          const s = Math.floor((diff % 60000) / 1000)
          setLabel(`${m}:${String(s).padStart(2, '0')}`)
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
      })
      .catch(() => {})
  }, [roomId])

  return label
}

export default function RoomHeader({
  roomId, status, connected, isCreator,
  onLock, focusActive, onFocusOn, onFocusOff,
  onShowQR, onRequestSummary, onShowPoll,
}) {
  const countdown = useCountdown(roomId)

  const statusBadge = {
    active: <span className="badge badge-green">● live</span>,
    locked: <span className="badge badge-amber">🔒 locked</span>,
    expired: <span className="badge badge-slate">expired</span>,
  }[status] || null

  return (
    <header className="room-header">
      <div className="rh-left">
        <a href="/" className="rh-logo">Roomly</a>
        <span className="rh-sep">/</span>
        <code className="rh-id">{roomId}</code>
        {statusBadge}
        {!connected && <span className="badge badge-red">disconnected</span>}
      </div>

      <div className="rh-center">
        {countdown && (
          <span className="rh-timer" title="Time remaining">⏱ {countdown}</span>
        )}
      </div>

      <div className="rh-right">
        <button className="btn btn-ghost btn-sm" onClick={onShowQR} title="Show QR code">
          QR
        </button>
        {isCreator && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={onShowPoll} title="Create poll">
              + Poll
            </button>
            <button
              className={`btn btn-sm ${focusActive ? 'btn-primary' : 'btn-ghost'}`}
              onClick={focusActive ? onFocusOff : onFocusOn}
              title={focusActive ? 'Disable focus mode' : 'Enable focus mode (talking stick)'}
            >
              🎤 Focus
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onRequestSummary} title="AI summary">
              ✦ Summary
            </button>
            {status === 'active' && (
              <button className="btn btn-secondary btn-sm" onClick={onLock} title="Lock room">
                Lock
              </button>
            )}
          </>
        )}
      </div>
    </header>
  )
}
