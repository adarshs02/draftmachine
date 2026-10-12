import { useState } from 'preact/hooks'
import type { Advice, FeedRow } from '../engine/advise'
import { teamSummary, valueOf } from '../engine/metrics'
import type { DraftEvent, DraftState, Team } from '../engine/types'
import { money, teamLabel, verdictText } from './format'
import { html } from './html'

export type Health = 'live' | 'manual'

export interface PanelProps {
  advice: Advice
  state: DraftState
  health: Health
  banner: string | null
  alert: string | null
  unknownVerbs: Record<string, number>
  frameCount: number
  /** true when the event changed the draft, false when it was ignored */
  onEvent: (ev: DraftEvent) => boolean | void
  onDownloadRecording: () => void
  onReset: () => void
  onDismissAlert: () => void
}

/** "3", "#3" or a unique, case-insensitive team-name prefix ("bub") -> team id. */
function teamFromText(teams: Team[], text: string): number | null {
  const t = text.trim().replace(/^#/, '')
  if (!t) return null
  const byId = teams.find((x) => x.id === Number(t))
  if (byId) return byId.id
  const byName = teams.filter((x) => x.name.toLowerCase().startsWith(t.toLowerCase()))
  return byName.length === 1 ? byName[0].id : null
}


export function Panel(p: PanelProps) {
  const { advice, state } = p
  const mine = state.myTeamId
  const v = advice.verdict
  const teamName = (id: number) => teamSummary(state, id).name
  const temp = advice.temperature
  /** ESPN's average price paid for the player on the block (0 when unknown) */
  const market = state.live ? valueOf(state, state.live.playerKey).market : 0
  const fixSale = (f: FeedRow) => {
    const answer = window.prompt(`Fix ${f.name}: price and team # (e.g. "14 3")`, `${f.price} ${f.teamId}`)
    const [priceText = '', ...team] = (answer ?? '').trim().split(/\s+/)
    const price = Number(priceText)
    const teamId = teamFromText(state.settings.teams, team.join(' '))
    if (price > 0 && teamId !== null) p.onEvent({ type: 'editSale', seq: f.seq, teamId, price })
  }
  const turn = advice.turn
  const turns = (n: number | null, next: boolean) =>
    n === null ? '' : n === 0 ? (next ? ' · you nominate next' : '') : ` · you nominate in ${n} ${n === 1 ? 'turn' : 'turns'}`
  const teamTag = (id: number) => teamLabel(state.settings.teams.find((t) => t.id === id) ?? { id, name: teamName(id) })
  const turnLine =
    turn.onClock !== null && turn.onClock === mine
      ? html`<span class="call BID">Your turn to nominate</span>`
      : turn.onClock !== null
        ? `Nominating now: ${teamTag(turn.onClock)}${turns(turn.turnsUntilMe, false)}`
        : turn.upNext !== null
          ? `Up next: ${teamTag(turn.upNext)}${turns(turn.turnsUntilMe, true)}`
          : null
  const unknown = Object.entries(p.unknownVerbs).map(([verb, n]) => `${verb}×${n}`).join(', ')
  const [collapsed, setCollapsed] = useState(false)
  const newDraft = () => {
    if (window.confirm('Start a new draft? This clears all recorded sales.')) p.onReset()
  }
  return html`
    <div class="panel">
      <header data-drag="1">
        <strong>Josh Mode</strong>
        <span class=${`health ${p.health}`}>${p.health === 'live' ? '● live' : '○ manual'}</span>
        <span class="temp">${temp.label}${temp.T !== null ? ` ${temp.T.toFixed(2)}` : ''} · infl ${advice.inflation.toFixed(2)}</span>
        <button class="collapse" title=${collapsed ? 'expand' : 'collapse'} onClick=${() => setCollapsed(!collapsed)}>${collapsed ? '+' : '–'}</button>
      </header>
      ${!collapsed && html`
        ${p.banner && html`<div class="banner">${p.banner}</div>`}
        ${p.alert && html`<div class="alert"><span>${p.alert}</span><button title="dismiss" onClick=${p.onDismissAlert}>×</button></div>`}
        <label class=${mine === null ? 'picker' : 'picker compact'}>${mine === null ? 'Which team is yours?' : 'My team'}
          <select value=${mine === null ? '' : String(mine)} onChange=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value
            if (value !== '') p.onEvent({ type: 'setMyTeam', teamId: Number(value) })
          }}>
            ${mine === null && html`<option value="">choose…</option>`}
            ${state.settings.teams.map((t) => html`<option value=${t.id}>${teamLabel(t)}</option>`)}
          </select>
        </label>
        <section class="now">
          ${v
            ? html`
                <div class=${`call ${v.kind}`}>${verdictText(v)}</div>
                <div>${v.name} · ${money(v.price)} by ${teamName(v.leaderId)}</div>
                <div class="muted">value ${money(v.adjusted)}${market > 0 ? ` · ESPN avg ${money(market)}` : ''} · ceiling ${money(v.ceiling)}${v.boost > 1 ? ' · positional need +10%' : ''}</div>
                ${v.unvalued && html`<div class="warn">${v.name} has no value</div>`}
                ${v.rivalPerSlotAfter !== null && html`<div class="muted">${teamName(v.leaderId)} left with ${money(v.rivalPerSlotAfter)}/slot after this</div>`}
                ${v.warnings.map((w) => html`<div class="warn">${w}</div>`)}
              `
            : html`<div class="muted">${state.live ? 'Pick your team to see the call' : 'Waiting for a nomination'}</div>`}
        </section>
        ${advice.budget &&
        html`<section class="budget">
          ${money(advice.budget.budgetLeft)} left · ${advice.budget.open} spots · ${money(advice.budget.perSlot)}/slot · safe max ${money(advice.budget.safeMax)}
        </section>`}
        ${turnLine && html`<section class="turn">${turnLine}</section>`}
        ${advice.nomination &&
        html`<section class="nominate">
          <b>Nominate:</b> ${advice.nomination.name} <span class="muted">(${advice.nomination.phase})</span>
          <div class="muted">${advice.nomination.reason}</div>
        </section>`}
        <section>
          <h4>Rivals</h4>
          <table>
            ${advice.teams
              .filter((t) => t.id !== state.myTeamId)
              .map((t) => html`<tr><td>${teamLabel(t)}</td><td>${money(t.budgetLeft)}</td><td>${t.open} open</td><td>max ${money(t.maxBid)}</td></tr>`)}
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
        <footer class="row">
          <button onClick=${() => p.onEvent({ type: 'undo' })}>Undo last sale</button>
          <button onClick=${p.onDownloadRecording}>Download recording (${p.frameCount} frames)</button>
          ${unknown && html`<span class="muted" title="socket verbs the decoder does not know">unknown: ${unknown}</span>`}
          <button onClick=${newDraft}>New draft</button>
        </footer>
      `}
    </div>`
}
