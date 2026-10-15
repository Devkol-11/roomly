export default function TypingIndicator({ typing }) {
  const names = typing.map(t => t.name)
  const label =
    names.length === 0 ? '' :
    names.length === 1 ? `${names[0]} is typing` :
    names.length === 2 ? `${names[0]} and ${names[1]} are typing` :
    'Several people are typing'

  return (
    <div className="flex h-6 items-center gap-2 px-1 text-xs text-fg-3" aria-live="polite">
      {label && (
        <>
          <span className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="h-1 w-1 animate-bounce rounded-full bg-fg-3" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </span>
          {label}
        </>
      )}
    </div>
  )
}
