import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function extractRoomId(value) {
  // Accept bare ID or a full URL like http://…/rooms/ABC123
  const match = value.match(/rooms\/([A-Za-z0-9]+)/)
  return match ? match[1] : value.trim()
}

export default function JoinRoomInput() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  function handleJoin(e) {
    e.preventDefault()
    const id = extractRoomId(value)
    if (!id) return
    navigate(`/rooms/${id}`)
  }

  return (
    <form onSubmit={handleJoin}>
      <div className="field">
        <label className="label" htmlFor="join-id">Room ID or link</label>
        <input
          id="join-id"
          className="input"
          placeholder="aB3xZ9qR or http://…"
          value={value}
          onChange={e => setValue(e.target.value)}
          required
        />
      </div>
      <button className="btn btn-secondary btn-full" type="submit">
        Join room
      </button>
    </form>
  )
}
