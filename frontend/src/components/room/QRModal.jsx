import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function QRModal({ roomId, onClose }) {
  const [qrCode, setQrCode] = useState(null)
  const [link,   setLink]   = useState('')

  useEffect(() => {
    // The QR code is only available in the create response.
    // We re-fetch room info; if QR isn't stored we show the plain link.
    fetch(`${API}/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        setLink(`${window.location.origin}/rooms/${roomId}`)
        // qr_code is not returned by GetRoom — only by CreateRoom.
        // Retrieve from localStorage if the creator is viewing.
        const saved = JSON.parse(localStorage.getItem(`roomly:${roomId}`) || 'null')
        if (saved?.qrCode) setQrCode(saved.qrCode)
      })
      .catch(() => setLink(`${window.location.origin}/rooms/${roomId}`))
  }, [roomId])

  function copyLink() {
    navigator.clipboard.writeText(link)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
        <div className="modal-header">
          <span className="modal-title">Share this room</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {qrCode ? (
          <img src={qrCode} alt="Room QR code" style={{ width: 200, height: 200, display: 'block', margin: '0 auto 16px' }} />
        ) : (
          <div style={{
            width: 200, height: 200, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            QR available to room creator
          </div>
        )}

        <div className="copy-row" style={{ marginBottom: 16 }}>
          <span>{link}</span>
          <button className="btn btn-secondary btn-sm" onClick={copyLink}>Copy</button>
        </div>

        <button className="btn btn-primary btn-full" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
