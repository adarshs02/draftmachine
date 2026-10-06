import type { Advice, FeedRow } from '../engine/advise'
import { teamSummary } from '../engine/metrics'
import type { DraftEvent, DraftState } from '../engine/types'
import { money, verdictText } from './format'
import { html } from './html'
import { ManualEntry } from './ManualEntry'

export type Health = 'live' | 'manual'

export interface PanelProps {
  advice: Advice
  state: DraftState
  health: Health
  banner: string | null
  frameCount: number
  onEvent: (ev: DraftEvent) => void
  onDownloadRecording: () => void
}

export function Panel(p: PanelProps) {
  const { advice, state } = p
  const v = advice.verdict
  const teamName = (id: number) => teamSummary(state, id).name
  const temp = advice.temperature
  const fixSale = (f: FeedRow) => {
    const answer = window.prompt(`Fix ${f.name}: price and team number`, `${f.price} ${f.teamId}`)
    const [price, teamId] = (answer ?? '').trim().split(/\s+/).map(Number)
    if (price > 0 && state.settings.teams.some((t) => t.id === teamId)) p.onEvent({ type: 'editSale', seq: f.seq, teamId, price })
  }
  return html`
    <div class="panel">
      <header data-drag="1">
        <strong>Josh Mode</strong>
        <span class=${`health ${p.health}`}>${p.health === 'live' ? '● live' : '○ manual'}</span>
        <span class="temp">${temp.label}${temp.T !== null ? ` ${temp.T.toFixed(2)}` : ''} · infl ${advice.inflation.toFixed(2)}</span>
      </header>
      ${p.banner && html`<div class="banner">${p.banner}</div>`}
      ${state.myTeamId === null &&
      html`<label class="picker">Which team is yours?
        <select onChange=${(e: Event) => p.onEvent({ type: 'setMyTeam', teamId: Number((e.target as HTMLSelectElement).value) })}>
          <option value="">choose…</option>
          ${state.settings.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}
        </select>
      </label>`}
      <section class="now">
        ${v
          ? html`
              <div class=${`call ${v.kind}`}>${verdictText(v)}</div>
              <div>${v.name} · ${money(v.price)} by ${teamName(v.leaderId)}</div>
              <div class="muted">value ${money(v.adjusted)} · ceiling ${money(v.ceiling)}${v.boost > 1 ? ' · positional need +10%' : ''}</div>
              ${v.unvalued && html`<div class="warn">${v.name} has no value: set one below</div>`}
              ${v.rivalPerSlotAfter !== null && html`<div class="muted">${teamName(v.leaderId)} left with ${money(v.rivalPerSlotAfter)}/slot after this</div>`}
              ${v.warnings.map((w) => html`<div class="warn">${w}</div>`)}
            `
          : html`<div class="muted">Waiting for a nomination</div>`}
      </section>
      ${advice.budget &&
      html`<section class="budget">
        ${money(advice.budget.budgetLeft)} left · ${advice.budget.open} spots · ${money(advice.budget.perSlot)}/slot · safe max ${money(advice.budget.safeMax)}
      </section>`}
      ${advice.nomination &&
      html`<section class="nominate">
        <b>Nominate:</b> ${advice.nomination.name} <span class="muted">(${advice.nomination.phase})</span>
        <div class="muted">${advice.nomination.reason}</div>
      </section>`}
      <section>
        <h4>Targets</h4>
        <table>
          ${advice.targets.map(
            (t) => html`<tr>
              <td><button class="pin" title="pin target" onClick=${() => p.onEvent({ type: 'toggleTarget', playerKey: t.playerKey })}>${t.pinned ? '★' : '☆'}</button></td>
              <td>${t.name}</td>
              <td>${money(t.adjusted)}</td>
              <td>≤${money(t.ceiling)}</td>
              <td class="muted">${t.outbidBy.length ? `outbid: ${t.outbidBy.join(', ')}` : ''}</td>
            </tr>`,
          )}
        </table>
      </section>
      <section>
        <h4>Rivals</h4>
        <table>
          ${advice.teams
            .filter((t) => t.id !== state.myTeamId)
            .map((t) => html`<tr><td>${t.name}</td><td>${money(t.budgetLeft)}</td><td>${t.open} open</td><td>max ${money(t.maxBid)}</td></tr>`)}
        </table>
      </section>
      <section>
        <h4>Sales</h4>
        ${advice.feed.map(
          (f) => html`<div>
            ${f.bargain ? '⭐ ' : ''}${f.name} → ${f.teamName} ${money(f.price)}
            <button class="fix" title="fix this sale" onClick=${() => fixSale(f)}>✎</button>
          </div>`,
        )}
      </section>
      <${ManualEntry} state=${state} onEvent=${p.onEvent} />
      <footer class="row">
        <button onClick=${() => p.onEvent({ type: 'undo' })}>Undo last sale</button>
        <button onClick=${p.onDownloadRecording}>Download recording (${p.frameCount} frames)</button>
      </footer>
    </div>`
}
