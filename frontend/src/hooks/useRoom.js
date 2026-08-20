import { useEffect, useReducer, useRef, useCallback } from 'react'

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'

const initial = {
  connected: false,
  messages:     [],
  participants: {},
  polls:        {},
  typing:       [],
  focus:        { active: false, holderID: '', holderName: '' },
  summary:      null,
  roomStatus:   'active',  // 'active' | 'locked' | 'expired' | 'kicked'
  serverError:  null,
}

function reducer(state, action) {
  const { type, payload } = action
  switch (type) {
    case 'CONNECTED':    return { ...state, connected: true, serverError: null }
    case 'DISCONNECTED': return { ...state, connected: false }

    case 'user_joined':
      return {
        ...state,
        participants: {
          ...state.participants,
          [payload.participant_id]: { displayName: payload.display_name },
        },
      }
    case 'user_left': {
      const p = { ...state.participants }
      delete p[payload.participant_id]
      return {
        ...state,
        participants: p,
        typing: state.typing.filter(t => t.id !== payload.participant_id),
      }
    }

    case 'message':
      return {
        ...state,
        messages: [...state.messages, { ...payload, _key: `${payload.id}-${Date.now()}` }],
      }

    case 'typing_started':
      if (state.typing.find(t => t.id === payload.participant_id)) return state
      return {
        ...state,
        typing: [...state.typing, { id: payload.participant_id, name: payload.display_name }],
      }
    case 'typing_stopped':
      return { ...state, typing: state.typing.filter(t => t.id !== payload.participant_id) }

    case 'poll_created':
      return { ...state, polls: { ...state.polls, [payload.id]: payload } }
    case 'poll_updated': {
      const poll = state.polls[payload.poll_id]
      if (!poll) return state
      return {
        ...state,
        polls: { ...state.polls, [payload.poll_id]: { ...poll, votes: payload.votes } },
      }
    }

    case 'room_locked':  return { ...state, roomStatus: 'locked' }
    case 'room_expired': return { ...state, roomStatus: 'expired' }
    case 'kicked':       return { ...state, roomStatus: 'kicked' }

    case 'focus_mode_enabled':
      return {
        ...state,
        focus: {
          active: true,
          holderID:   payload.floor_holder_id   || '',
          holderName: payload.floor_holder_name || '',
        },
      }
    case 'focus_mode_disabled':
      return { ...state, focus: { active: false, holderID: '', holderName: '' } }
    case 'floor_granted':
      return { ...state, focus: { ...state.focus, holderID: payload.participant_id, holderName: payload.display_name } }
    case 'floor_released':
      return { ...state, focus: { ...state.focus, holderID: '', holderName: '' } }

    case 'room_summary':
      return { ...state, summary: payload }

    case 'error':
      return { ...state, serverError: payload.message }
    case 'CLEAR_ERROR':
      return { ...state, serverError: null }

    default:
      return state
  }
}

export function useRoom(roomId, displayName, participantId, lang) {
  const [state, dispatch] = useReducer(reducer, initial)
  const wsRef = useRef(null)

  const send = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }))
    }
  }, [])

  useEffect(() => {
    if (!roomId || !displayName) return

    const params = new URLSearchParams({ display_name: displayName })
    if (participantId) params.set('participant_id', participantId)
    if (lang) params.set('lang', lang)

    const ws = new WebSocket(`${WS_BASE}/ws/rooms/${roomId}?${params}`)
    wsRef.current = ws

    ws.onopen    = () => dispatch({ type: 'CONNECTED' })
    ws.onclose   = () => dispatch({ type: 'DISCONNECTED' })
    ws.onerror   = () => dispatch({ type: 'error', payload: { message: 'Connection lost' } })
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        dispatch({ type: event.type, payload: event.payload })
      } catch { /* malformed frame — ignore */ }
    }

    return () => ws.close()
  }, [roomId, displayName, participantId, lang])

  return { state, send }
}
