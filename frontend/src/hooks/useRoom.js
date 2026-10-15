import { useEffect, useReducer, useRef, useCallback, useState } from 'react'
import { WS_BASE } from '../lib/api.js'

const initial = {
  connection: 'connecting', // 'connecting' | 'open' | 'closed' | 'rejected'
  selfId: '',
  isCreator: false,
  aiEnabled: false,
  timeline: [],       // { kind: 'msg' | 'poll' | 'system', key, ts, ... }
  participants: {},   // id -> { displayName, isCreator }
  polls: {},          // id -> poll
  myVotes: {},        // pollId -> option index
  typing: [],
  focus: { active: false, holderID: '', holderName: '' },
  summary: null,
  roomStatus: 'active', // 'active' | 'locked' | 'expired' | 'kicked'
  serverError: null,
}

let seq = 0
const sys = (text) => ({ kind: 'system', key: `sys-${++seq}`, ts: Date.now(), text })

function reducer(state, { type, payload }) {
  switch (type) {
    case 'RESET':
      return { ...initial, myVotes: state.myVotes }
    case 'OPEN':
      return { ...state, connection: 'open', serverError: null }
    case 'CLOSED':
      // Closed before ever opening => the server refused the handshake.
      return { ...state, connection: state.connection === 'connecting' ? 'rejected' : 'closed' }

    case 'room_state': {
      const participants = {}
      for (const p of payload.participants || []) {
        participants[p.participant_id] = { displayName: p.display_name, isCreator: p.is_creator }
      }
      const polls = {}
      const pollItems = []
      for (const p of payload.polls || []) {
        polls[p.id] = p
        pollItems.push({ kind: 'poll', key: `poll-${p.id}`, ts: new Date(p.created_at).getTime(), pollId: p.id })
      }
      const f = payload.focus || {}
      return {
        ...state,
        selfId: payload.self_id,
        isCreator: payload.is_creator,
        aiEnabled: payload.ai_enabled,
        participants,
        polls,
        timeline: [...pollItems.sort((a, b) => a.ts - b.ts), ...state.timeline],
        focus: { active: !!f.enabled, holderID: f.floor_holder_id || '', holderName: f.floor_holder_name || '' },
      }
    }

    case 'user_joined': {
      const known = state.participants[payload.participant_id]
      return {
        ...state,
        participants: {
          ...state.participants,
          [payload.participant_id]: { displayName: payload.display_name, isCreator: payload.is_creator },
        },
        timeline: known || payload.participant_id === state.selfId
          ? state.timeline
          : [...state.timeline, sys(`${payload.display_name} joined`)],
      }
    }
    case 'user_left': {
      const p = { ...state.participants }
      delete p[payload.participant_id]
      return {
        ...state,
        participants: p,
        typing: state.typing.filter(t => t.id !== payload.participant_id),
        timeline: [...state.timeline, sys(`${payload.display_name} left`)],
      }
    }

    case 'message':
      return {
        ...state,
        typing: state.typing.filter(t => t.id !== payload.sender_id),
        timeline: [...state.timeline, {
          kind: 'msg', key: `m-${payload.id}-${++seq}`, ts: new Date(payload.timestamp).getTime(), ...payload,
        }],
      }

    case 'typing_started':
      if (state.typing.some(t => t.id === payload.participant_id)) return state
      return { ...state, typing: [...state.typing, { id: payload.participant_id, name: payload.display_name }] }
    case 'typing_stopped':
      return { ...state, typing: state.typing.filter(t => t.id !== payload.participant_id) }

    case 'poll_created':
      return {
        ...state,
        polls: { ...state.polls, [payload.id]: payload },
        timeline: [...state.timeline, { kind: 'poll', key: `poll-${payload.id}`, ts: Date.now(), pollId: payload.id }],
      }
    case 'poll_updated': {
      const poll = state.polls[payload.poll_id]
      if (!poll) return state
      return { ...state, polls: { ...state.polls, [payload.poll_id]: { ...poll, votes: payload.votes } } }
    }
    case 'VOTE':
      return { ...state, myVotes: { ...state.myVotes, [payload.pollId]: payload.index } }

    case 'room_locked':
      return { ...state, roomStatus: 'locked', timeline: [...state.timeline, sys('The host locked the room. No one new can join.')] }
    case 'room_expired': return { ...state, roomStatus: 'expired' }
    case 'kicked':       return { ...state, roomStatus: 'kicked' }

    case 'focus_mode_enabled':
      return {
        ...state,
        focus: { active: true, holderID: payload.floor_holder_id || '', holderName: payload.floor_holder_name || '' },
        timeline: [...state.timeline, sys('Focus mode is on. One person speaks at a time.')],
      }
    case 'focus_mode_disabled':
      return {
        ...state,
        focus: { active: false, holderID: '', holderName: '' },
        timeline: [...state.timeline, sys('Focus mode is off. Everyone can talk.')],
      }
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

export function useRoom(roomId, session) {
  const [state, dispatch] = useReducer(reducer, initial)
  const [attempt, setAttempt] = useState(0)
  const wsRef = useRef(null)

  const displayName = session?.displayName
  const creatorId = session?.creatorId
  const lang = session?.lang

  const send = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false
    wsRef.current.send(JSON.stringify({ type, payload }))
    if (type === 'poll_voted') dispatch({ type: 'VOTE', payload: { pollId: payload.poll_id, index: payload.option_index } })
    return true
  }, [])

  const reconnect = useCallback(() => setAttempt(a => a + 1), [])
  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), [])

  useEffect(() => {
    if (!roomId || !displayName) return
    dispatch({ type: 'RESET' })

    const params = new URLSearchParams({ display_name: displayName })
    if (creatorId) params.set('participant_id', creatorId)
    if (lang) params.set('lang', lang)

    const ws = new WebSocket(`${WS_BASE}/ws/rooms/${roomId}?${params}`)
    wsRef.current = ws
    let alive = true

    ws.onopen = () => alive && dispatch({ type: 'OPEN' })
    ws.onclose = () => alive && dispatch({ type: 'CLOSED' })
    ws.onmessage = (e) => {
      if (!alive) return
      try {
        const event = JSON.parse(e.data)
        dispatch({ type: event.type, payload: event.payload || {} })
      } catch { /* malformed frame */ }
    }

    return () => {
      alive = false
      ws.close()
    }
  }, [roomId, displayName, creatorId, lang, attempt])

  return { state, send, reconnect, clearError }
}
