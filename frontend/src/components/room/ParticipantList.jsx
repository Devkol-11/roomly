import './ParticipantList.css'

export default function ParticipantList({
  participants, myId, creatorId, floorHolderID,
  isCreator, onKick, onGrantFloor, focusActive,
}) {
  const entries = Object.entries(participants)

  return (
    <div className="participant-list">
      <div className="pl-heading">
        Participants <span className="pl-count">{entries.length}</span>
      </div>

      {entries.length === 0 && (
        <p className="pl-empty">No one else yet</p>
      )}

      {entries.map(([id, { displayName }]) => {
        const isMe      = id === myId
        const isCreatorP = id === creatorId
        const hasFloor  = id === floorHolderID

        return (
          <div key={id} className="pl-item">
            <div className="pl-avatar">{displayName[0].toUpperCase()}</div>
            <div className="pl-info">
              <span className="pl-name">
                {displayName}
                {isMe       && <span className="pl-tag">you</span>}
                {isCreatorP && <span className="pl-tag creator">creator</span>}
              </span>
              {hasFloor && focusActive && (
                <span className="pl-floor">🎤 has floor</span>
              )}
            </div>
            {isCreator && !isMe && (
              <div className="pl-actions">
                {focusActive && (
                  <button
                    className="pl-action"
                    onClick={() => onGrantFloor(id)}
                    title="Grant floor"
                  >🎤</button>
                )}
                <button
                  className="pl-action danger"
                  onClick={() => onKick(id)}
                  title="Kick"
                >✕</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
