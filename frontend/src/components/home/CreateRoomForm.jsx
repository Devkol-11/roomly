import { useState } from 'react'
import { api } from '../../lib/api.js'
import { FormError } from '../ui.jsx'

const DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
]

export default function CreateRoomForm({ onCreated }) {
  const [displayName, setDisplayName] = useState('')
  const [duration, setDuration] = useState(60)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const name = displayName.trim()
    if (name.length < 2) return setError('Your name needs at least 2 characters.')
    setError('')
    setLoading(true)
    try {
      const data = await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ display_name: name, duration_minutes: duration }),
      })
      onCreated({ ...data, displayName: name })
    } catch (err) {
      setError(err.status ? err.message : 'Could not reach the Roomly server. Is the backend running?')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="label" htmlFor="cr-name">Your name</label>
        <input id="cr-name" className="input" placeholder="e.g. Ada" autoComplete="nickname"
          value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={20} autoFocus />
      </div>

      <fieldset>
        <legend className="label">Room closes after</legend>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
          {DURATIONS.map(d => (
            <label key={d.value}
              className={`flex h-9 cursor-pointer items-center justify-center rounded-lg text-[13px] font-medium transition-colors ${
                duration === d.value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-2 hover:text-fg'
              }`}>
              <input type="radio" name="duration" value={d.value} checked={duration === d.value}
                onChange={() => setDuration(d.value)} className="sr-only" />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      <FormError>{error}</FormError>

      <button className="btn btn-primary btn-lg w-full" type="submit" disabled={loading}>
        {loading ? 'Creating room…' : 'Create room'}
      </button>
    </form>
  )
}
