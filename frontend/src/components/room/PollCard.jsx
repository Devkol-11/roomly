import { Icon } from '../ui.jsx'

export default function PollCard({ poll, myVote, onVote }) {
  const total = Object.values(poll.votes || {}).reduce((s, v) => s + v, 0)
  const voted = myVote !== undefined

  return (
    <div className="my-4 rounded-2xl border border-line bg-surface p-4 sm:max-w-md">
      <div className="flex items-center gap-1.5 text-xs text-fg-3">
        <Icon name="poll" size={13} />
        <span className="font-medium uppercase tracking-wide">Poll</span>
        <span>· {poll.creator_name}</span>
      </div>
      <p className="mt-1.5 font-medium">{poll.question}</p>
      <div className="mt-3 space-y-1.5">
        {poll.options.map((opt, idx) => {
          const count = poll.votes?.[String(idx)] || 0
          const pct = total ? Math.round((count / total) * 100) : 0
          const mine = myVote === idx
          return (
            <button key={idx} onClick={() => !voted && onVote(poll.id, idx)} disabled={voted}
              className={`relative flex h-10 w-full items-center overflow-hidden rounded-lg border text-left text-sm transition-colors ${
                mine ? 'border-fg-2' : 'border-line'} ${voted ? 'cursor-default' : 'hover:border-line-strong hover:bg-surface-2'}`}>
              {voted && (
                <span className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${mine ? 'bg-surface-3' : 'bg-surface-2'}`} style={{ width: `${pct}%` }} />
              )}
              <span className="relative flex w-full items-center justify-between gap-2 px-3">
                <span className="flex items-center gap-2 truncate">
                  {mine && <Icon name="check" size={14} strokeWidth={2.25} />}{opt}
                </span>
                {voted && <span className="tabular-nums text-fg-2">{pct}%</span>}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-xs text-fg-3">
        {total} vote{total === 1 ? '' : 's'}{!voted && ' · vote to see results'}
      </p>
    </div>
  )
}
