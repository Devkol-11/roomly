import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import CreateRoomForm from '../components/home/CreateRoomForm.jsx'
import JoinRoomInput from '../components/home/JoinRoomInput.jsx'
import { Avatar, Icon, Logo } from '../components/ui.jsx'
import { saveSession } from '../lib/api.js'

const FEATURES = [
  { icon: 'clock', title: 'Rooms with a timer', body: 'Pick 15 minutes to 2 hours. When time is up the room and its messages are deleted.' },
  { icon: 'poll', title: 'Quick polls', body: 'Ask a question, everyone votes, results update live for the whole room.' },
  { icon: 'mic', title: 'Focus mode', body: 'One person holds the floor at a time. The host can pass it to anyone.' },
  { icon: 'sparkle', title: 'AI recap and translation', body: 'Get decisions and action items before the room closes. Read messages in your own language.' },
]

export default function Home() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('create')

  function handleCreated(data) {
    saveSession(data.room_id, {
      displayName: data.displayName,
      creatorId: data.creator_id,
      qrCode: data.qr_code || null,
      link: data.link,
    })
    navigate(`/rooms/${data.room_id}`, { state: { justCreated: true } })
  }

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#how" className="btn btn-ghost btn-sm hidden sm:inline-flex">How it works</a>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab('join')}>Join a room</button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
          <div>
            <span className="chip mb-6"><span className="h-1.5 w-1.5 rounded-full bg-live" />No sign-up. Nothing kept.</span>
            <h1 className="max-w-xl text-[40px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[52px]">
              Chat rooms that delete themselves when you’re done.
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-7 text-fg-2">
              Open a room, share the link, and talk. When the timer runs out the room and its messages are deleted.
              Good for stand-ups, workshops, and quick group decisions.
            </p>

            <div className="mt-10 hidden max-w-md lg:block">
              <PreviewThread />
            </div>
          </div>

          <div className="card w-full p-2 shadow-pop lg:justify-self-end lg:max-w-[420px]">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
              {[['create', 'New room'], ['join', 'Join room']].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`h-9 rounded-lg text-sm font-medium transition-colors ${
                    tab === id ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-2 hover:text-fg'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-4 pt-5 sm:p-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}>
                  {tab === 'create' ? <CreateRoomForm onCreated={handleCreated} /> : <JoinRoomInput />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                ['Create', 'Enter your name and pick how long the room should stay open.'],
                ['Share', 'Send the link or show the QR code. Guests only need to enter a name.'],
                ['Talk, then it’s gone', 'Chat, run polls, and get an AI recap. When the timer ends the room is deleted.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-xs text-fg-2">{i + 1}</span>
                  <div>
                    <h3 className="font-medium">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-fg-2">{body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(f => (
                <div key={f.title} className="bg-surface p-6">
                  <Icon name={f.icon} size={20} className="text-fg-2" />
                  <h3 className="mt-4 font-medium">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-fg-2">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-[13px] text-fg-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Roomly. Nothing is saved after a room closes.</span>
          <span>Built with Go, Redis and React</span>
        </div>
      </footer>
    </div>
  )
}

// A static sample conversation built from the real message styles.
function PreviewThread() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono text-xs text-fg-2">rooms/k7Qm2xPa</span>
        <span className="chip !bg-ember-soft !text-ember"><Icon name="clock" size={12} />24:18</span>
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div className="flex gap-2.5">
          <Avatar name="Maya" size={28} />
          <div>
            <div className="text-xs text-fg-3"><span className="font-medium text-fg-2">Maya</span> · 10:02</div>
            <div className="mt-1 rounded-2xl rounded-tl-md bg-bubble px-3 py-2">Shall we ship on Friday?</div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-md bg-bubble-own px-3 py-2 text-bubble-own-fg">Friday works. I’ll run a poll.</div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="text-xs font-medium text-fg-3">POLL · 4 votes</div>
          <div className="mt-1.5 font-medium">Ship on Friday?</div>
          <div className="relative mt-2 h-8 overflow-hidden rounded-lg bg-surface-2">
            <div className="absolute inset-y-0 left-0 w-3/4 bg-surface-3" />
            <span className="relative flex h-full items-center justify-between px-3 text-[13px]"><span>Yes</span><span>75%</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
