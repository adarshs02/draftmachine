import { useState } from 'preact/hooks'
import type { DraftEvent, DraftState } from '../engine/types'
import { normalizeName } from '../values/names'
import { teamLabel } from './format'
import { html } from './html'
import { resolvePlayer } from './resolve'

type Action = 'nominate' | 'bid' | 'sold' | 'value'

function read(form: HTMLFormElement) {
  const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value
  return { player: field('player'), teamId: Number(field('team')), amount: Number(field('amount')) }
}

/** Fallback when the socket isn't decoding: type what happens in the room. */
export function ManualEntry({ state, onEvent }: { state: DraftState; onEvent: (ev: DraftEvent) => void }) {
  const [error, setError] = useState<string | null>(null)
  const act = (action: Action) => (e: Event) => {
    const form = (e.currentTarget as HTMLButtonElement).form!
    const f = read(form)
    // A dispatched event consumes the typed amount; player and team stay for the next call.
    const emit = (ev: DraftEvent) => {
      onEvent(ev)
      ;(form.elements.namedItem('amount') as HTMLInputElement).value = ''
    }
    const typed = normalizeName(f.player) !== ''
    setError(null)
    // A typed name must be a real player: a partial name would otherwise become a phantom one.
    const resolve = (): string | null => {
      const r = resolvePlayer(state, f.player)
      if ('key' in r) return r.key
      setError(r.error)
      return null
    }
    if (action === 'nominate' && typed && f.amount > 0) {
      const playerKey = resolve()
      if (playerKey) emit({ type: 'nominated', playerKey, teamId: f.teamId, amount: f.amount })
    }
    if (action === 'bid' && f.amount > 0) emit({ type: 'bid', teamId: f.teamId, amount: f.amount })
    if (action === 'sold') {
      // On the block: a typed amount (and its team) wins over what we last saw in the room.
      if (state.live && f.amount > 0) emit({ type: 'sold', playerKey: state.live.playerKey, teamId: f.teamId, price: f.amount })
      else if (state.live) emit({ type: 'sold', playerKey: state.live.playerKey, teamId: state.live.leaderId, price: state.live.price })
      else if (typed && f.amount > 0) {
        const playerKey = resolve()
        if (playerKey) emit({ type: 'sold', playerKey, teamId: f.teamId, price: f.amount })
      }
    }
    if (action === 'value' && typed && f.amount > 0) {
      const r = resolvePlayer(state, f.player)
      // No match at all: a call-up missing from the values gets an entry under the typed name.
      if ('key' in r) emit({ type: 'setValue', playerKey: r.key, b: f.amount })
      else if (r.matches === 0) emit({ type: 'setValue', playerKey: normalizeName(f.player), b: f.amount })
      else setError(r.error)
    }
  }
  const suggestions = Object.values(state.values).sort((a, b) => b.b - a.b)
  return html`
    <form class="manual" onSubmit=${(e: Event) => e.preventDefault()}>
      <h4>Manual entry</h4>
      <input name="player" list="eah-players" placeholder="player" autocomplete="off" />
      <datalist id="eah-players">${suggestions.map((v) => html`<option value=${v.name} />`)}</datalist>
      <select name="team">${state.settings.teams.map((t) => html`<option value=${t.id}>${teamLabel(t)}</option>`)}</select>
      <input name="amount" type="number" min="1" placeholder="$" />
      <div class="row">
        <button type="button" onClick=${act('nominate')}>Nominated</button>
        <button type="button" onClick=${act('bid')}>Bid</button>
        <button type="button" onClick=${act('sold')}>Sold</button>
        <button type="button" onClick=${act('value')}>Set value</button>
        <button type="button" disabled=${!state.live} onClick=${() => onEvent({ type: 'clearLive' })}>Clear block</button>
      </div>
      ${error && html`<div class="warn">${error}</div>`}
    </form>`
}
