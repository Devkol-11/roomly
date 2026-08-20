import './MessageItem.css'

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageItem({ msg, isOwn }) {
  return (
    <div className={`msg-row${isOwn ? ' own' : ''}`}>
      {!isOwn && (
        <div className="msg-avatar">{msg.sender_name[0].toUpperCase()}</div>
      )}
      <div className="msg-content">
        {!isOwn && <span className="msg-name">{msg.sender_name}</span>}
        <div className="msg-bubble">
          <span className="msg-text">{msg.text}</span>
          {msg.translated_from && (
            <span className="msg-translated">translated from {msg.translated_from}</span>
          )}
        </div>
        {msg.original_text && (
          <span className="msg-original">Original: {msg.original_text}</span>
        )}
        <span className="msg-time">{formatTime(msg.timestamp)}</span>
      </div>
    </div>
  )
}
