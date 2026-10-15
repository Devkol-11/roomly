import { useState, useRef, useCallback, useEffect } from 'react'
import { Icon } from '../ui.jsx'

const TYPING_DEBOUNCE_MS = 2000
const MAX = 2000

export default function ChatInput({ onSend, onTypingStart, onTypingStop, disabled, placeholder }) {
  const [text, setText] = useState('')
  const typingRef = useRef(false)
  const timerRef = useRef(null)
  const areaRef = useRef(null)

  const stopTyping = useCallback(() => {
    if (typingRef.current) { typingRef.current = false; onTypingStop() }
  }, [onTypingStop])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  function handleChange(e) {
    setText(e.target.value)
    if (!typingRef.current) { typingRef.current = true; onTypingStart() }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(stopTyping, TYPING_DEBOUNCE_MS)
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    if (onSend(trimmed) === false) return
    setText('')
    clearTimeout(timerRef.current)
    stopTyping()
    areaRef.current?.focus()
  }

  return (
    <div className={`flex items-end gap-2 rounded-2xl border bg-surface p-1.5 pl-4 transition-colors ${disabled ? 'border-line opacity-70' : 'border-line-strong focus-within:border-fg-3'}`}>
      <textarea
        ref={areaRef}
        className="scroll-thin max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent py-2 text-[15px] leading-5 outline-none placeholder:text-fg-3 disabled:cursor-not-allowed"
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
        disabled={disabled}
        rows={1}
        maxLength={MAX}
        aria-label="Message"
      />
      {text.length > MAX - 200 && <span className="self-center text-xs tabular-nums text-fg-3">{MAX - text.length}</span>}
      <button className="btn btn-primary btn-icon !rounded-xl" onClick={submit} disabled={disabled || !text.trim()} aria-label="Send message">
        <Icon name="send" size={16} strokeWidth={2} />
      </button>
    </div>
  )
}
