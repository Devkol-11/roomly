import { useEffect, useRef, useState } from 'react'
import { Icon, Logo, CopyButton } from '../ui.jsx'
import { formatRemaining } from '../../lib/api.js'

export default function RoomHeader({
  roomId, remaining, status, isCreator, aiEnabled, focusActive, participantCount,
  onToggleParticipants, onShare, onPoll, onFocus, onSummary, onLock, onLeave,
}) {
  const urgent = remaining != null && remaining < 5 * 60 * 1000

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
      <Logo compact />
      <div className="ml-1 flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-[13px] text-fg-2">{roomId}</span>
        <CopyButton text={`${window.location.origin}/rooms/${roomId}`} label="" className="btn btn-ghost btn-icon !h-7 !w-7" />
        {status === 'locked'
          ? <span className="chip !bg-warn-soft !text-warn"><Icon name="lock" size={12} />Locked</span>
          : <span className="chip !bg-live-soft !text-live hidden sm:inline-flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />Live</span>}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {remaining != null && (
          <span
            className={`chip tabular-nums ${urgent ? '!bg-ember !text-white' : '!bg-ember-soft !text-ember'}`}
            title="Time until this room is deleted"
          >
            <Icon name="clock" size={12} />{formatRemaining(remaining)}
          </span>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onToggleParticipants} aria-label="Show participants">
          <Icon name="users" size={15} /><span className="tabular-nums">{participantCount}</span>
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onShare}>
          <Icon name="share" size={14} /><span className="hidden sm:inline">Invite</span>
        </button>
        {isCreator && (
          <HostMenu
            aiEnabled={aiEnabled} focusActive={focusActive} locked={status === 'locked'}
            onPoll={onPoll} onFocus={onFocus} onSummary={onSummary} onLock={onLock}
          />
        )}
        <button className="btn btn-ghost btn-icon" onClick={onLeave} aria-label="Leave room" title="Leave room">
          <Icon name="logout" size={16} />
        </button>
      </div>
    </header>
  )
}

function HostMenu({ aiEnabled, focusActive, locked, onPoll, onFocus, onSummary, onLock }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const items = [
    { icon: 'poll', label: 'New poll', hint: 'Ask the room a question', onClick: onPoll },
    { icon: 'mic', label: focusActive ? 'Turn off focus mode' : 'Turn on focus mode', hint: 'One speaker at a time', onClick: onFocus },
    aiEnabled && { icon: 'sparkle', label: 'AI recap', hint: 'Summarise decisions and to-dos', onClick: onSummary },
    !locked && { icon: 'lock', label: 'Lock room', hint: 'Stop new people joining', onClick: onLock, danger: true },
  ].filter(Boolean)

  return (
    <div className="relative" ref={ref}>
      <button className={`btn btn-sm ${open ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu">
        Host<Icon name="chevron" size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {items.map(item => (
            <button key={item.label} role="menuitem"
              className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 ${item.danger ? 'text-danger' : ''}`}
              onClick={() => { setOpen(false); item.onClick() }}>
              <Icon name={item.icon} size={16} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-fg-3">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
