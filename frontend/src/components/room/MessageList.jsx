import { useEffect, useRef } from 'react'
import MessageItem from './MessageItem.jsx'
import PollCard from './PollCard.jsx'
import { Icon } from '../ui.jsx'

const GROUP_WINDOW_MS = 5 * 60 * 1000

export default function MessageList({ timeline, polls, myVotes, selfId, onVote, emptyHint }) {
  const scrollRef = useRef(null)
  const stickRef = useRef(true)

  // Only auto-scroll when the reader is already near the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [timeline, polls])

  function onScroll() {
    const el = scrollRef.current
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  const hasContent = timeline.some(i => i.kind !== 'system')

  return (
    <div ref={scrollRef} onScroll={onScroll} className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end px-4 py-4">
        {!hasContent && (
          <div className="my-auto py-10 text-center">
            <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-fg-2">
              <Icon name="send" size={18} />
            </span>
            <p className="font-medium">No messages yet</p>
            <p className="mt-1 text-sm text-fg-2">{emptyHint}</p>
          </div>
        )}
        {timeline.map((item, i) => {
          if (item.kind === 'system') {
            return <p key={item.key} className="my-3 text-center text-xs text-fg-3">{item.text}</p>
          }
          if (item.kind === 'poll') {
            const poll = polls[item.pollId]
            return poll ? <PollCard key={item.key} poll={poll} myVote={myVotes[poll.id]} onVote={onVote} /> : null
          }
          const prev = timeline[i - 1]
          const first = !(prev && prev.kind === 'msg' && prev.sender_id === item.sender_id && item.ts - prev.ts < GROUP_WINDOW_MS)
          return <MessageItem key={item.key} msg={item} isOwn={item.sender_id === selfId} first={first} />
        })}
      </div>
    </div>
  )
}
