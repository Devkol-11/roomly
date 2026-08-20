import { useEffect, useRef } from 'react'
import MessageItem from './MessageItem.jsx'
import PollCard    from './PollCard.jsx'
import './MessageList.css'

export default function MessageList({ messages, polls, myId, onVote }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, polls])

  // Merge messages and polls into a single timeline sorted by timestamp
  const pollItems = Object.values(polls).map(p => ({
    _type: 'poll', _key: `poll-${p.id}`, _ts: new Date(p.created_at).getTime(), ...p,
  }))
  const msgItems = messages.map(m => ({
    _type: 'msg', _key: m._key, _ts: new Date(m.timestamp).getTime(), ...m,
  }))
  const timeline = [...msgItems, ...pollItems].sort((a, b) => a._ts - b._ts)

  return (
    <div className="message-list">
      {timeline.length === 0 && (
        <div className="ml-empty">
          <p>No messages yet.</p>
          <p className="ml-empty-sub">Be the first to say something.</p>
        </div>
      )}

      {timeline.map(item =>
        item._type === 'poll' ? (
          <PollCard key={item._key} poll={item} myId={myId} onVote={onVote} />
        ) : (
          <MessageItem key={item._key} msg={item} isOwn={item.sender_id === myId} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  )
}
