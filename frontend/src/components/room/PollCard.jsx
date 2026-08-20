import { useState } from 'react'
import './PollCard.css'

export default function PollCard({ poll, myId, onVote }) {
  const [voted, setVoted] = useState(false)

  const totalVotes = Object.values(poll.votes || {}).reduce((s, v) => s + v, 0)

  function handleVote(idx) {
    if (voted) return
    setVoted(true)
    onVote(poll.id, idx)
  }

  return (
    <div className="poll-card">
      <div className="poll-header">
        <span className="poll-label">Poll</span>
        <span className="poll-creator">by {poll.creator_name}</span>
      </div>
      <p className="poll-question">{poll.question}</p>
      <div className="poll-options">
        {poll.options.map((opt, idx) => {
          const count = poll.votes?.[String(idx)] || 0
          const pct   = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0

          return (
            <button
              key={idx}
              className={`poll-option${voted ? ' results' : ''}`}
              onClick={() => handleVote(idx)}
              disabled={voted}
            >
              <div className="po-bar" style={{ width: voted ? `${pct}%` : '0%' }} />
              <span className="po-text">{opt}</span>
              {voted && <span className="po-pct">{pct}%</span>}
            </button>
          )
        })}
      </div>
      <p className="poll-footer">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  )
}
