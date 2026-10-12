import { useState } from 'preact/hooks'
import { html } from '../../ui/html'
import { ROOMS } from '../bots'
import { MODES, SPEEDS, type Mode, type Session, type SessionConfig } from '../session'
import type { BotKind } from '../types'

export const BOT_KINDS: readonly BotKind[] = ['stars', 'balanced', 'value']
export type RoomName = keyof typeof ROOMS
const ROOM_NAMES = Object.keys(ROOMS) as RoomName[]
export const MODE_LABELS: Record<Mode, string> = {
  simulate: 'Simulate vs bots',
  'replay-espn': 'Replay recorded ESPN draft',
  'replay-josh': "Replay Josh Lloyd's mock",
}
const roomName = (room: number): RoomName => ROOM_NAMES.find((n) => ROOMS[n] === room) ?? 'neutral'
const inputValue = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value

export interface RestartForm {
  mode: Mode
  seed: string
  room: RoomName
  /** comma-separated bot kinds, one per bot in draft order */
  bots: string
}

/** The config a Restart would use, or the message to show instead. */
export function configFromForm(base: SessionConfig, form: RestartForm): SessionConfig | string {
  const seed = Number(form.seed)
  if (form.seed.trim() === '' || !Number.isInteger(seed)) return 'Seed must be a whole number'
  const kinds = form.bots.split(',').map((k) => k.trim()).filter(Boolean)
  const bad = kinds.find((k) => !BOT_KINDS.includes(k as BotKind))
  if (bad !== undefined) return `Unknown bot "${bad}": use ${BOT_KINDS.join(', ')}`
  const need = base.options.pickOrder.length - 1
  if (kinds.length !== need) return `Bot mix needs ${need} bots, got ${kinds.length}`
  return { ...base, mode: form.mode, options: { ...base.options, seed, room: ROOMS[form.room], botKinds: kinds as BotKind[] } }
}

export function Controls({ session, onRestart }: { session: Session; onRestart: (config: SessionConfig) => void }) {
  const c = session.config
  const [form, setForm] = useState<RestartForm>({ mode: c.mode, seed: String(c.options.seed), room: roomName(c.options.room), bots: c.options.botKinds.join(',') })
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<RestartForm>) => setForm({ ...form, ...patch })
  const restart = () => {
    const next = configFromForm({ ...c, speed: session.speed, autopilot: session.autopilot }, form)
    if (typeof next === 'string') return setError(next)
    setError(null)
    onRestart(next)
  }
  const simulate = c.mode === 'simulate'
  return html`<div class="controls">
    <div class="row">
      ${SPEEDS.map((s) => html`<button class=${session.speed === s ? 'on' : ''} onClick=${() => session.setSpeed(s)}>${s === 'instant' ? 'Instant' : `${s}×`}</button>`)}
      <button onClick=${() => session.setPaused(!session.paused)}>${session.paused ? 'Play' : 'Pause'}</button>
      <button disabled=${session.done} onClick=${() => session.step()}>Step to next sale</button>
      <button disabled=${session.done} onClick=${() => session.finish()}>Run to end</button>
      <label class=${simulate ? '' : 'muted'}>
        <input type="checkbox" disabled=${!simulate} checked=${session.autopilot} onChange=${(e: Event) => session.setAutopilot((e.currentTarget as HTMLInputElement).checked)} />
        Autopilot
      </label>
    </div>
    <div class="row">
      <select value=${form.mode} onChange=${(e: Event) => set({ mode: inputValue(e) as Mode })}>
        ${MODES.map((m) => html`<option value=${m}>${MODE_LABELS[m]}</option>`)}
      </select>
      <label>Seed <input type="number" value=${form.seed} onInput=${(e: Event) => set({ seed: inputValue(e) })} /></label>
      <label>Room
        <select value=${form.room} onChange=${(e: Event) => set({ room: inputValue(e) as RoomName })}>
          ${ROOM_NAMES.map((n) => html`<option value=${n}>${n}</option>`)}
        </select>
      </label>
      <label>Bots <input class="bots" value=${form.bots} onInput=${(e: Event) => set({ bots: inputValue(e) })} /></label>
      <button onClick=${restart}>Restart</button>
    </div>
    ${error ? html`<div class="error">${error}</div>` : null}
  </div>`
}
