export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
export const WS_BASE = import.meta.env.VITE_WS_URL || API_BASE.replace(/^http/, 'ws')

export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

// Per-room session kept on this device (name, host key, language, QR).
const key = (roomId) => `roomly:${roomId}`

export function loadSession(roomId) {
  try {
    const raw = JSON.parse(localStorage.getItem(key(roomId)) || 'null')
    if (!raw?.displayName) return null
    return {
      displayName: raw.displayName,
      creatorId: raw.creatorId || raw.creator_id || null,
      lang: raw.lang || null,
      qrCode: raw.qrCode || null,
      link: raw.link || null,
    }
  } catch {
    return null
  }
}

export function saveSession(roomId, session) {
  try { localStorage.setItem(key(roomId), JSON.stringify(session)) } catch { /* storage unavailable */ }
}

export function extractRoomId(value) {
  const v = value.trim()
  const match = v.match(/rooms\/([A-Za-z0-9]+)/)
  return match ? match[1] : v.replace(/[^A-Za-z0-9]/g, '')
}

export function formatRemaining(ms) {
  if (ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}
