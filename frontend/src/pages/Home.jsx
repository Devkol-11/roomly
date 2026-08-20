import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CreateRoomForm from '../components/home/CreateRoomForm.jsx'
import JoinRoomInput  from '../components/home/JoinRoomInput.jsx'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const [created, setCreated] = useState(null) // { roomId, creatorId, link, qrCode, expiresAt }

  function handleCreated(data) {
    // Persist the creator session so the room page auto-connects with privileges.
    localStorage.setItem(`roomly:${data.room_id}`, JSON.stringify({
      displayName: data.displayName,
      creatorId:   data.creator_id,
      qrCode:      data.qr_code || null,
    }))
    setCreated(data)
  }

  function enterRoom() {
    navigate(`/rooms/${created.room_id}`, {
      state: { displayName: created.displayName, creatorId: created.creator_id },
    })
  }

  return (
    <div className="home-page">
      <header className="home-hero">
        <h1 className="home-logo">Roomly</h1>
        <p className="home-tagline">Ephemeral rooms that self-destruct — no accounts, no history.</p>
      </header>

      <main className="home-main">
        {/* ── Create side ── */}
        <div className="card">
          <h2 className="card-heading">Create a room</h2>
          <p className="card-sub">You get a link, a QR code, and creator privileges.</p>
          <hr className="divider" />

          {!created ? (
            <CreateRoomForm onCreated={handleCreated} />
          ) : (
            <CreatedPanel data={created} onEnter={enterRoom} />
          )}
        </div>

        {/* ── Join side ── */}
        <div className="card">
          <h2 className="card-heading">Join a room</h2>
          <p className="card-sub">Paste the room ID or a full link.</p>
          <hr className="divider" />
          <JoinRoomInput />
        </div>
      </main>
    </div>
  )
}

function CreatedPanel({ data, onEnter }) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedId,   setCopiedId]   = useState(false)

  function copy(text, setCopied) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="created-panel">
      <div className="created-check">✓ Room created!</div>

      <div className="field">
        <span className="label">Join link</span>
        <div className="copy-row">
          <span>{data.link}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => copy(data.link, setCopiedLink)}>
            {copiedLink ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">Creator ID — save this to keep your privileges</span>
        <div className="copy-row">
          <span>{data.creator_id}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => copy(data.creator_id, setCopiedId)}>
            {copiedId ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {data.qr_code && (
        <div className="field">
          <span className="label">QR code</span>
          <div className="qr-wrapper">
            <img src={data.qr_code} alt="Room QR code" className="qr-img" />
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-full" onClick={onEnter}>
        Enter room →
      </button>
    </div>
  )
}
