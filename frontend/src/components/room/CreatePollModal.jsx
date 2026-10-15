import { useState } from 'react'
import { Modal, Icon, FormError } from '../ui.jsx'

export default function CreatePollModal({ onClose, onSubmit }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState('')

  const update = (i, val) => setOptions(options.map((o, idx) => (idx === i ? val : o)))

  function handleSubmit(e) {
    e.preventDefault()
    if (!question.trim()) return setError('Add a question.')
    const filled = options.map(o => o.trim()).filter(Boolean)
    if (filled.length < 2) return setError('Add at least two options.')
    if (new Set(filled.map(o => o.toLowerCase())).size !== filled.length) return setError('Options must be different.')
    onSubmit(question.trim(), filled)
  }

  return (
    <Modal title="New poll" description="Everyone in the room can vote once." onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="label" htmlFor="poll-q">Question</label>
          <input id="poll-q" className="input" placeholder="What should we decide?" autoFocus
            value={question} onChange={e => setQuestion(e.target.value)} maxLength={200} />
        </div>
        <div>
          <span className="label">Options</span>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" placeholder={`Option ${i + 1}`} value={opt} onChange={e => update(i, e.target.value)} maxLength={80} />
                {options.length > 2 && (
                  <button type="button" className="btn btn-ghost btn-icon h-11 w-11" aria-label={`Remove option ${i + 1}`}
                    onClick={() => setOptions(options.filter((_, idx) => idx !== i))}>
                    <Icon name="x" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 5 && (
            <button type="button" className="btn btn-ghost btn-sm mt-2 -ml-2" onClick={() => setOptions([...options, ''])}>
              <Icon name="plus" size={14} />Add option
            </button>
          )}
        </div>
        <FormError>{error}</FormError>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Post poll</button>
        </div>
      </form>
    </Modal>
  )
}
