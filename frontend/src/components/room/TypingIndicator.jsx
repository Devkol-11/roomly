import './TypingIndicator.css'

export default function TypingIndicator({ typing }) {
  if (typing.length === 0) return null

  const names = typing.map(t => t.name)
  const label =
    names.length === 1 ? `${names[0]} is typing` :
    names.length === 2 ? `${names[0]} and ${names[1]} are typing` :
    'Several people are typing'

  return (
    <div className="typing-indicator">
      <span className="typing-dots">
        <span /><span /><span />
      </span>
      <span className="typing-label">{label}…</span>
    </div>
  )
}
