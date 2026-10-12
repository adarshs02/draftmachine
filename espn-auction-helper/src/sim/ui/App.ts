import { html } from '../../ui/html'
import type { Session, SessionConfig } from '../session'
import { Controls, MODE_LABELS } from './Controls'
import { Room } from './Room'
import { TunablesDrawer } from './TunablesDrawer'

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function App({ session, onRestart }: { session: Session; onRestart: (config: SessionConfig) => void }) {
  return html`<div class="sim">
    <header>
      <b>Draft simulator</b>
      <span class="muted"> · ${MODE_LABELS[session.config.mode]} · seed ${session.config.options.seed} · ${clock(session.time)}${session.paused ? ' · paused' : ''}</span>
    </header>
    <${Controls} session=${session} onRestart=${onRestart} />
    <${TunablesDrawer} onChange=${() => session.refresh()} />
    <${Room} session=${session} />
  </div>`
}
