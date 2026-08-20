import { useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const DURATIONS = [15, 30, 60, 120]

export default function CreateRoomForm({ onCreated }) {
  const [displayName, setDisplayName] = useState('')
  const [duration, setDuration]       = useState(60)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (displayName.trim().length < 2) {
      setError('Name must be at least 2 characters.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/rooms`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ display_name: displayName.trim(), duration_minutes: duration }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create room')
      onCreated({ ...data, displayName: displayName.trim() })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label className="label" htmlFor="cr-name">Your name</label>
        <input
          id="cr-name"
          className="input"
          placeholder="e.g. Alice"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          maxLength={20}
          required
        />
      </div>

      <div className="field">
        <span className="label">Room duration</span>
        <div className="duration-grid">
          {DURATIONS.map(d => (
            <label key={d} className={`duration-opt${duration === d ? ' active' : ''}`}>
              <input
                type="radio"
                name="duration"
                value={d}
                checked={duration === d}
                onChange={() => setDuration(d)}
              />
              {d < 60 ? `${d} min` : `${d / 60}h`}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
        {loading ? 'Creating…' : 'Create room'}
      </button>

      <style>{`
        .duration-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .duration-opt {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 7px 4px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-muted);
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .duration-opt input { display: none; }
        .duration-opt.active {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-light);
        }
        .form-error {
          font-size: 13px;
          color: var(--red);
          margin-bottom: 12px;
        }
      `}</style>
    </form>
  )
}
