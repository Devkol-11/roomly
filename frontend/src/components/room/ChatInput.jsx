import { useState, useRef, useCallback } from 'react'
import './ChatInput.css'

const TYPING_DEBOUNCE_MS = 2000

export default function ChatInput({ onSend, onTypingStart, onTypingStop, disabled }) {
  const [text, setText]           = useState('')
  const typingRef                 = useRef(false)
  const typingTimerRef            = useRef(null)

  const stopTyping = useCallback(() => {
    if (typingRef.current) {
      typingRef.current = false
      onTypingStop()
    }
  }, [onTypingStop])

  function handleChange(e) {
    setText(e.target.value)

    if (!typingRef.current) {
      typingRef.current = true
      onTypingStart()
    }

    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(stopTyping, TYPING_DEBOUNCE_MS)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    clearTimeout(typingTimerRef.current)
    stopTyping()
  }

  return (
    <div className="chat-input-bar">
      <textarea
        className="chat-textarea"
        placeholder={disabled ? 'Room is locked or disconnected' : 'Type a message… (Enter to send, Shift+Enter for newline)'}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        maxLength={2000}
      />
      <button
        className="btn btn-primary chat-send"
        onClick={submit}
        disabled={disabled || !text.trim()}
        aria-label="Send"
      >
        Send
      </button>
    </div>
  )
}
