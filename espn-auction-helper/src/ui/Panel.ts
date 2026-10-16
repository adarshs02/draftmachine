import { useState } from 'preact/hooks'
import type { Advice, FeedRow } from '../engine/advise'
import { teamSummary, valueOf } from '../engine/metrics'
import type { DraftEvent, DraftState, Team } from '../engine/types'
import { CATEGORY_LABELS } from '../engine/h2h'
import { valueFlag } from '../engine/profile'
import { FIT_NOTE_MIN, fitText, flagText, injuryTag, injuryText, money, profileText, standingText, teamLabel, verdictText } from './format'
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
  const injury = state.live ? valueOf(state, state.live.playerKey).injury : null
  const injuryBadge = (key: string) => {
    const i = state.values[key]?.injury
    return i && html`<span class=${`inj ${i.label}`} title=${injuryText(i)}>${injuryTag(i)}</span>`
  }
  const fixSale = (f: FeedRow) => {
    const answer = window.prompt(`Fix ${f.name}: price and team # (e.g. "14 3")`, `${f.price} ${f.teamId}`)
    const [priceText = '', ...team] = (answer ?? '').trim().split(/\s+/)
    const price = Number(priceText)
    const teamId = teamFromText(state.settings.teams, team.join(' '))
    if (price > 0 && teamId !== null) p.onEvent({ type: 'editSale', seq: f.seq, teamId, price })
  }
  const turn = advice.turn
  const look = advice.lookFor
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
  const b = advice.budget
  const saleClass = (f: FeedRow) => (f.price < Math.round(f.value) ? 'under' : f.price > Math.round(f.value) ? 'over' : 'even')
  const rivals = advice.teams.filter((t) => t.id !== state.myTeamId).sort((x, y) => y.maxBid - x.maxBid || x.id - y.id)
  return html`
    <div class="panel">
      <header data-drag="1">
        <strong>Josh Mode</strong>
        <span class=${`health ${p.health}`}>${p.health === 'live' ? '● live' : '○ manual'}</span>
        <span class="badges">
          <span class=${`badge ${temp.label.replace(' ', '-')}`} title="room temperature: recent prices vs value">${temp.label}${temp.T !== null ? ` ${temp.T.toFixed(2)}` : ''}</span>
          <span class="badge" title="inflation: money left vs value left">infl ${advice.inflation.toFixed(2)}</span>
        </span>
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
        <section class=${`now ${v ? v.kind : 'idle'}`}>
          ${v
            ? html`
                <div class="call">${verdictText(v)}</div>
                <div class="who"><b>${v.name}</b><span>${money(v.price)} · ${teamName(v.leaderId)}</span></div>
                <div class="stats">
                  <div class="stat"><span class="k"><i class="dot value"></i>value</span> <b>${money(v.adjusted)}</b></div>
                  ${market > 0 && html`<div class="stat"><span class="k"><i class="dot avg"></i>ESPN avg</span> <b>${money(market)}</b></div>`}
                  <div class="stat"><span class="k"><i class="dot max"></i>your max</span> <b>${money(v.ceiling)}</b></div>
                </div>
                <${PriceBar} price=${v.price} max=${v.ceiling} value=${v.adjusted} avg=${market} />
                ${v.saveSlot !== null && html`<div class="note">worth ${money(v.adjusted)} vs your ${money(v.saveSlot)}/slot</div>`}
                ${v.profile && profileText(v.profile) && html`<div class="note profile">${profileText(v.profile)}</div>`}
                ${flagText(valueFlag(v.adjusted, market), market) && html`<div class=${`note flag ${valueFlag(v.adjusted, market)}`}>${flagText(valueFlag(v.adjusted, market), market)}</div>`}
                ${injury && html`<div class=${`note injury ${injury.label}`}>⚠ ${injuryText(injury)}</div>`}
                ${v.fit && Math.abs(v.fit.mult - 1) >= FIT_NOTE_MIN && html`<div class="note">${fitText(v.fit)}</div>`}
                ${v.boost > 1 && html`<div class="note">positional need +10%</div>`}
                ${v.unvalued && html`<div class="note warn">${v.name} has no value</div>`}
                ${v.rivalPerSlotAfter !== null && html`<div class="note">${teamName(v.leaderId)} left with ${money(v.rivalPerSlotAfter)}/slot after this</div>`}
                ${v.warnings.map((w) => html`<div class="note warn">${w}</div>`)}
              `
            : html`<div class="idle-text">${state.live ? 'Pick your team to see the call' : 'Waiting for a nomination'}</div>`}
        </section>
        ${b &&
        html`<section class="budget">
          <div class="stats">
            <div class="stat"><b>${money(b.budgetLeft)}</b> <span class="k">left</span></div>
            <div class="stat"><b>${b.open}</b> <span class="k">spots</span></div>
            <div class="stat"><b>${money(b.perSlot)}</b> <span class="k">per slot</span></div>
            <div class="stat"><b>${money(b.safeMax)}</b> <span class="k">safe max</span></div>
          </div>
        </section>`}
        ${turnLine && html`<section class="turn">${turnLine}</section>`}
        ${advice.nomination &&
        html`<section class="nominate">
          <span class="label">Nominate</span><b>${advice.nomination.name}</b>${injuryBadge(advice.nomination.playerKey)}<span class="pill">${advice.nomination.phase}</span>
          <div class="why">${advice.nomination.reason}</div>
        </section>`}
        ${look &&
        html`<section class="lookfor">
          <h4><span>Look for</span><span class="cols">yours · ESPN</span></h4>
          ${look.rows.length
            ? look.rows.map(
                (r) => html`<div class=${r.flag === 'value' ? 'look value' : 'look'}>
                  <span class="name">${r.flag === 'value' ? '⭐ ' : ''}${r.name}${injuryBadge(r.key)}</span><span class="tags">${r.cats.map((c) => `+${CATEGORY_LABELS[c]}`).join(' ')}</span><span class="price">${money(r.value)}</span><span class="val">${r.market > 0 ? money(r.market) : '—'}</span>
                </div>`,
              )
            : html`<div class="empty">Nobody left you can afford at $5+</div>`}
          ${standingText(look.strong, look.weak) && html`<div class="why">${standingText(look.strong, look.weak)}</div>`}
        </section>`}
        <section class="rivals">
          <h4><span>Rivals</span><span class="cols">$ left · open · max${v ? html` · <span class="over-key">can outbid you</span>` : ''}</span></h4>
          <table>
            ${rivals.map(
              (t) => html`<tr class=${v && t.maxBid > v.ceiling ? 'over' : ''}>
                <td>${teamLabel(t)}</td><td class="num">${money(t.budgetLeft)}</td><td class="num">${t.open}</td><td class="num">${money(t.maxBid)}</td>
              </tr>`,
            )}
          </table>
        </section>
        <section class="sales">
          <h4><span>Sales</span><span class="cols">price · value</span></h4>
          ${advice.feed.length
            ? advice.feed.map(
                (f) => html`<div class=${f.bargain ? 'sale bargain' : 'sale'}>
                  <span class="name">${f.name}</span><span class="team">${f.teamName}</span><span class=${`price ${saleClass(f)}`}>${money(f.price)}</span><span class="val">val ${money(f.value)}</span>
                  <button class="fix" title="fix this sale" onClick=${() => fixSale(f)}>✎</button>
                </div>`,
              )
            : html`<div class="empty">No sales yet</div>`}
        </section>
        <footer>
          <button onClick=${() => p.onEvent({ type: 'undo' })}>Undo last sale</button>
          <button onClick=${p.onDownloadRecording}>Download recording (${p.frameCount} frames)</button>
          ${unknown && html`<span class="muted" title="socket verbs the decoder does not know">unknown: ${unknown}</span>`}
          <button class="danger" onClick=${newDraft}>New draft</button>
        </footer>
      `}
    </div>`
}

/** Price on a track scaled to the largest of price, my max, value and ESPN avg; ticks mark the last three. */
function PriceBar({ price, max, value, avg }: { price: number; max: number; value: number; avg: number }) {
  const scale = Math.max(price, max, value, avg, 1) * 1.1
  const at = (x: number) => `${Math.min(100, (x / scale) * 100).toFixed(1)}%`
  return html`<div class="bar" role="img" aria-label=${`price ${money(price)}, your max ${money(max)}, value ${money(value)}`}>
    <div class=${price > max ? 'fill over' : 'fill'} style=${`width:${at(price)}`}></div>
    <i class="tick value" style=${`left:${at(value)}`}></i>
    ${avg > 0 && html`<i class="tick avg" style=${`left:${at(avg)}`}></i>`}
    <i class="tick max" style=${`left:${at(max)}`}></i>
  </div>`
}
