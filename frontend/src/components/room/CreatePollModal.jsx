import { useState } from 'react'

export default function CreatePollModal({ onClose, onSubmit }) {
  const [question, setQuestion] = useState('')
  const [options,  setOptions]  = useState(['', ''])
  const [error,    setError]    = useState('')

  function addOption() {
    if (options.length < 5) setOptions([...options, ''])
  }

  function removeOption(i) {
    if (options.length <= 2) return
    setOptions(options.filter((_, idx) => idx !== i))
  }

  function updateOption(i, val) {
    const next = [...options]
    next[i] = val
    setOptions(next)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!question.trim()) { setError('Question is required.'); return }
    const filled = options.map(o => o.trim()).filter(Boolean)
    if (filled.length < 2) { setError('At least 2 options required.'); return }
    onSubmit(question.trim(), filled)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Create a poll</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="poll-q">Question</label>
            <input
              id="poll-q"
              className="input"
              placeholder="What should we decide?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div className="field">
            <span className="label">Options</span>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  className="input"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={e => updateOption(i, e.target.value)}
                  maxLength={80}
                />
                {options.length > 2 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeOption(i)}>×</button>
                )}
              </div>
            ))}
            {options.length < 5 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={addOption}>
                + Add option
              </button>
            )}
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Launch poll</button>
          </div>
        </form>
      </div>
    </div>
  )
}
