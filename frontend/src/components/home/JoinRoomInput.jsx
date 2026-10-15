import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractRoomId } from '../../lib/api.js'
import { FormError } from '../ui.jsx'

export default function JoinRoomInput() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function handleJoin(e) {
    e.preventDefault()
    const id = extractRoomId(value)
    if (!id) return setError('Paste a room link or code.')
    navigate(`/rooms/${id}`)
  }

  return (
    <form onSubmit={handleJoin} className="space-y-5">
      <div>
        <label className="label" htmlFor="join-id">Room link or code</label>
        <input id="join-id" className="input font-mono text-[14px]" placeholder="aB3xZ9qR or https://…/rooms/aB3xZ9qR"
          value={value} onChange={e => { setValue(e.target.value); setError('') }} autoComplete="off" spellCheck={false} />
        <p className="mt-2 text-[13px] text-fg-3">You’ll pick a display name on the next screen.</p>
      </div>
      <FormError>{error}</FormError>
      <button className="btn btn-primary btn-lg w-full" type="submit">Continue</button>
    </form>
  )
}
