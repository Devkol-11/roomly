import { Avatar, Icon } from '../ui.jsx'

export default function ParticipantList({ participants, selfId, floorHolderID, focusActive, isCreator, onKick, onGrantFloor }) {
  const entries = Object.entries(participants).sort(([aId, a], [bId, b]) =>
    (bId === selfId) - (aId === selfId) || (b.isCreator - a.isCreator) || a.displayName.localeCompare(b.displayName))

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center justify-between px-4">
        <h2 className="text-sm font-semibold">People</h2>
        <span className="text-xs tabular-nums text-fg-3">{entries.length} here</span>
      </div>
      <ul className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {entries.map(([id, p]) => {
          const isMe = id === selfId
          const hasFloor = focusActive && id === floorHolderID
          return (
            <li key={id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <span className="relative">
                <Avatar name={p.displayName} size={28} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-live" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {p.displayName}{isMe && <span className="text-fg-3"> (you)</span>}
                </span>
                {(p.isCreator || hasFloor) && (
                  <span className="flex gap-1.5 text-[11px] text-fg-3">
                    {p.isCreator && <span>Host</span>}
                    {hasFloor && <span className="text-ember">● Speaking</span>}
                  </span>
                )}
              </span>
              {isCreator && !isMe && (
                <span className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  {focusActive && !hasFloor && (
                    <button className="btn btn-ghost btn-icon !h-7 !w-7" title={`Give ${p.displayName} the floor`} onClick={() => onGrantFloor(id)}>
                      <Icon name="mic" size={14} />
                    </button>
                  )}
                  <button className="btn btn-ghost btn-icon !h-7 !w-7 hover:!text-danger" title={`Remove ${p.displayName}`}
                    onClick={() => window.confirm(`Remove ${p.displayName} from the room?`) && onKick(id)}>
                    <Icon name="ban" size={14} />
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
