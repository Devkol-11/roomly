import { motion } from 'motion/react'
import { Icon } from '../ui.jsx'

export default function FocusModeBar({ focus, selfId, onRequestFloor, onReleaseFloor }) {
  const iHold = focus.holderID && focus.holderID === selfId
  return (
    <motion.div
      className="flex items-center gap-3 border-b border-line bg-ember-soft px-4 py-2 text-sm"
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
    >
      <Icon name="mic" size={15} className="shrink-0 text-ember" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">Focus mode.</span>{' '}
        <span className="text-fg-2">
          {iHold ? 'You have the floor.' : focus.holderID ? `${focus.holderName} is speaking.` : 'The floor is open.'}
        </span>
      </span>
      {iHold
        ? <button className="btn btn-secondary btn-sm" onClick={onReleaseFloor}>Pass the floor</button>
        : !focus.holderID && <button className="btn btn-primary btn-sm" onClick={onRequestFloor}>Take the floor</button>}
    </motion.div>
  )
}
