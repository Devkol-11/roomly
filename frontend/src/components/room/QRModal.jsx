import { Modal, CopyButton, Icon } from '../ui.jsx'

// Invite dialog: link, room code, QR (host device only) and the host key.
export default function QRModal({ roomId, session, isCreator, onClose }) {
  const link = session?.link || `${window.location.origin}/rooms/${roomId}`
  return (
    <Modal title="Invite people" description="Anyone with the link can join until the room closes or is locked." onClose={onClose}>
      <div className="space-y-5">
        <div>
          <span className="label">Room link</span>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 py-1.5 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{link}</span>
            <CopyButton text={link} />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {session?.qrCode ? (
            <img src={session.qrCode} alt="QR code for the room link" className="h-32 w-32 rounded-xl border border-line bg-white p-1.5" />
          ) : (
            <div className="grid h-32 w-32 shrink-0 place-items-center rounded-xl border border-dashed border-line-strong p-3 text-center text-xs text-fg-3">
              QR code is shown on the host’s device
            </div>
          )}
          <div className="text-sm text-fg-2">
            <p>Or join with the code</p>
            <p className="mt-1 font-mono text-xl tracking-wider text-fg">{roomId}</p>
          </div>
        </div>

        {isCreator && session?.creatorId && (
          <div className="rounded-xl bg-warn-soft p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium text-warn"><Icon name="key" size={15} />Your host key</div>
            <p className="mt-1 text-[13px] leading-5 text-fg-2">Keep this private. Paste it under “More options” to get host controls on another device.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-1.5 font-mono text-[13px]">{session.creatorId}</code>
              <CopyButton text={session.creatorId} />
            </div>
          </div>
        )}

        <button className="btn btn-primary w-full" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}
