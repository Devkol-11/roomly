import './SummaryModal.css'

const SENTIMENT_BADGE = {
  positive: 'badge-green',
  neutral:  'badge-slate',
  mixed:    'badge-amber',
  tense:    'badge-red',
}

export default function SummaryModal({ summary, onClose }) {
  const badgeClass = SENTIMENT_BADGE[summary.sentiment] || 'badge-slate'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal summary-modal">
        <div className="modal-header">
          <span className="modal-title">✦ AI Room Summary</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="summary-meta">
          <span className={`badge ${badgeClass}`}>{summary.sentiment}</span>
          <span className="summary-count">{summary.message_count} messages</span>
        </div>

        <div className="summary-section">
          <p className="summary-tldr">{summary.tldr}</p>
        </div>

        {summary.decisions?.length > 0 && (
          <div className="summary-section">
            <h4 className="summary-heading">Decisions</h4>
            <ul className="summary-list">
              {summary.decisions.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}

        {summary.action_items?.length > 0 && (
          <div className="summary-section">
            <h4 className="summary-heading">Action items</h4>
            <ul className="summary-list action">
              {summary.action_items.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
