import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

const ICONS = {
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  send: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  share: <><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="m16 6-4-4-4 4M12 2v13" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  poll: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" /></>,
  sparkle: <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  wifiOff: <><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.5-1.8M12 20h.01" /></>,
  hourglass: <><path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
}

export function Icon({ name, size = 16, className = '', strokeWidth = 1.75 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

export function Logo({ compact = false }) {
  return (
    <a href="/" className="inline-flex items-center gap-2 text-fg" aria-label="Roomly home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--ink)" />
        <path d="M9 10.5A2.5 2.5 0 0 1 11.5 8h9A2.5 2.5 0 0 1 23 10.5v7a2.5 2.5 0 0 1-2.5 2.5H15l-4.2 3.4c-.5.4-1.3 0-1.3-.6V20.6A2.5 2.5 0 0 1 9 18.5z" fill="var(--ink-text)" />
        <circle cx="22.5" cy="9.5" r="3.5" fill="var(--ember)" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Roomly</span>}
    </a>
  )
}

// Stable, readable avatar colour from a name.
const HUES = [12, 35, 145, 175, 200, 225, 260, 290, 330]
export function Avatar({ name = '?', size = 32, className = '' }) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = HUES[h % HUES.length]
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold select-none ${className}`}
      style={{
        width: size, height: size, fontSize: size * 0.42,
        background: `oklch(0.9 0.05 ${hue})`, color: `oklch(0.38 0.09 ${hue})`,
      }}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase() || '?'}
    </span>
  )
}

export function CopyButton({ text, label = 'Copy', className = 'btn btn-secondary btn-sm' }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <button
      type="button"
      className={className}
      onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {})}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {label && <span>{copied ? 'Copied' : label}</span>}
    </button>
  )
}

export function Modal({ title, description, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        className={`w-full ${width} max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-pop sm:rounded-2xl sm:p-6`}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
          </div>
          <button className="btn btn-ghost btn-icon -mr-2 -mt-1" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

export function FormError({ children }) {
  if (!children) return null
  return <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{children}</p>
}

export function CenterCard({ icon, tone = 'neutral', title, children, actions }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-2',
    ember: 'bg-ember-soft text-ember',
    danger: 'bg-danger-soft text-danger',
    warn: 'bg-warn-soft text-warn',
  }
  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg">
      <header className="px-5 py-4"><Logo /></header>
      <main className="grid flex-1 place-items-center px-4 pb-16">
        <motion.div
          className="card w-full max-w-sm p-7 text-center"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          {icon && (
            <span className={`mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full ${tones[tone]}`}>
              <Icon name={icon} size={20} />
            </span>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-2 text-sm leading-6 text-fg-2">{children}</div>
          {actions && <div className="mt-6 flex flex-col gap-2">{actions}</div>}
        </motion.div>
      </main>
    </div>
  )
}
