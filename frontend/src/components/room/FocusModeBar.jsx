import './FocusModeBar.css'

export default function FocusModeBar({ focus, myId, onRequestFloor, onReleaseFloor }) {
  const iHolder = focus.holderID === myId

  return (
    <div className="focus-bar">
      <span className="focus-icon">🎤</span>
      <span className="focus-text">
        {focus.holderID
          ? <><strong>{iHolder ? 'You have' : `${focus.holderName} has`}</strong> the floor</>
          : 'Focus mode — floor is free'}
      </span>
      <div className="focus-actions">
        {iHolder ? (
          <button className="btn btn-sm btn-secondary" onClick={onReleaseFloor}>
            Release floor
          </button>
        ) : !focus.holderID ? (
          <button className="btn btn-sm btn-primary" onClick={onRequestFloor}>
            Request floor
          </button>
        ) : null}
      </div>
    </div>
  )
}
