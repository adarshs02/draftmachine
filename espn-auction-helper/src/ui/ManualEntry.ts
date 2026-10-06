import { available } from '../engine/metrics'
import type { DraftEvent, DraftState } from '../engine/types'
import { normalizeName } from '../values/names'
import { html } from './html'

type Action = 'nominate' | 'bid' | 'sold' | 'value'

function read(form: HTMLFormElement) {
  const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value
  return { playerKey: normalizeName(field('player')), teamId: Number(field('team')), amount: Number(field('amount')) }
}

/** Fallback when the socket isn't decoding: type what happens in the room. */
export function ManualEntry({ state, onEvent }: { state: DraftState; onEvent: (ev: DraftEvent) => void }) {
  const act = (action: Action) => (e: Event) => {
    const f = read((e.currentTarget as HTMLButtonElement).form!)
    if (action === 'nominate' && f.playerKey && f.amount > 0) onEvent({ type: 'nominated', playerKey: f.playerKey, teamId: f.teamId, amount: f.amount })
    if (action === 'bid' && f.amount > 0) onEvent({ type: 'bid', teamId: f.teamId, amount: f.amount })
    if (action === 'sold') {
      if (state.live) onEvent({ type: 'sold', playerKey: state.live.playerKey, teamId: state.live.leaderId, price: state.live.price })
      else if (f.playerKey && f.amount > 0) onEvent({ type: 'sold', playerKey: f.playerKey, teamId: f.teamId, price: f.amount })
    }
    if (action === 'value' && f.playerKey && f.amount > 0) onEvent({ type: 'setValue', playerKey: f.playerKey, b: f.amount })
  }
  return html`
    <form class="manual" onSubmit=${(e: Event) => e.preventDefault()}>
      <h4>Manual entry</h4>
      <input name="player" list="eah-players" placeholder="player" autocomplete="off" />
      <datalist id="eah-players">${available(state).slice(0, 300).map((v) => html`<option value=${v.name} />`)}</datalist>
      <select name="team">${state.settings.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select>
      <input name="amount" type="number" min="1" placeholder="$" />
      <div class="row">
        <button type="button" onClick=${act('nominate')}>Nominated</button>
        <button type="button" onClick=${act('bid')}>Bid</button>
        <button type="button" onClick=${act('sold')}>Sold</button>
        <button type="button" onClick=${act('value')}>Set value</button>
      </div>
    </form>`
}
