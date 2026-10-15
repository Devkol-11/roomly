import { Avatar } from '../ui.jsx'

const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// `first` = first message in a run from the same sender (shows name/avatar).
export default function MessageItem({ msg, isOwn, first }) {
  if (isOwn) {
    return (
      <div className={`flex justify-end ${first ? 'mt-3' : 'mt-0.5'}`}>
        <div className="group flex max-w-[80%] items-end gap-2">
          <span className="mb-1 hidden text-[11px] text-fg-3 group-hover:inline">{time(msg.ts)}</span>
          <div className={`whitespace-pre-wrap break-words rounded-2xl bg-bubble-own px-3.5 py-2 text-[15px] leading-[1.45] text-bubble-own-fg ${first ? 'rounded-tr-md' : ''}`}>
            {msg.text}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex gap-2.5 ${first ? 'mt-3' : 'mt-0.5'}`}>
      <div className="w-8 shrink-0">{first && <Avatar name={msg.sender_name} size={32} />}</div>
      <div className="group min-w-0 max-w-[80%]">
        {first && (
          <div className="mb-1 text-xs text-fg-3">
            <span className="font-medium text-fg-2">{msg.sender_name}</span> · {time(msg.ts)}
          </div>
        )}
        <div className={`whitespace-pre-wrap break-words rounded-2xl bg-bubble px-3.5 py-2 text-[15px] leading-[1.45] ${first ? 'rounded-tl-md' : ''}`}>
          {msg.text}
        </div>
        {msg.original_text && (
          <details className="mt-1 text-xs text-fg-3">
            <summary className="cursor-pointer select-none list-none hover:text-fg-2">Translated · show original</summary>
            <p className="mt-1 whitespace-pre-wrap border-l-2 border-line pl-2">{msg.original_text}</p>
          </details>
        )}
      </div>
    </div>
  )
}
