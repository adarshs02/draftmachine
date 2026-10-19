import { useState } from 'preact/hooks'
import type { Advice, FeedRow } from '../engine/advise'
import type { LookForRow } from '../engine/lookFor'
import { teamSummary, valueOf } from '../engine/metrics'
import type { DraftEvent, DraftState } from '../engine/types'
import { CATEGORY_LABELS } from '../engine/h2h'
import { valueFlag } from '../engine/profile'
import { FIT_NOTE_MIN, fitText, flagText, injuryTag, injuryText, money, profileText, standingText, teamLabel, verdictText } from './format'
import { html } from './html'

export type Health = 'live' | 'waiting'
type Tab = 'look' | 'similar'

export interface PanelProps {
  advice: Advice
  state: DraftState
  health: Health
  banner: string | null
  alert: string | null
  /** true when the event changed the draft, false when it was ignored */
  onEvent: (ev: DraftEvent) => boolean | void
  onReset: () => void
  onDismissAlert: () => void
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
  const note = state.live ? valueOf(state, state.live.playerKey).note : null
  const injuryBadge = (key: string) => {
    const i = state.values[key]?.injury
    return i && html`<span class=${`inj ${i.label}`} title=${injuryText(i)}>${injuryTag(i)}</span>`
  }
  const memo = (key: string) => {
    const n = state.values[key]?.note
    return n && html`<span class="memo" title=${n}>📝</span>`
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
  const [collapsed, setCollapsed] = useState(false)
  // Similar opens with each nomination and Look for comes back after the sale; a click holds until the block changes.
  const like = advice.similar
  const liveKey = state.live?.playerKey ?? null
  const [picked, setPicked] = useState<{ tab: Tab; live: string | null } | null>(null)
  let tab: Tab = picked && picked.live === liveKey ? picked.tab : like ? 'similar' : 'look'
  if (tab === 'look' && !look) tab = 'similar'
  const pick = (t: Tab) => setPicked({ tab: t, live: liveKey })
  const tabButton = (t: Tab, label: string, enabled: boolean) =>
    html`<button role="tab" aria-selected=${tab === t ? 'true' : 'false'} disabled=${!enabled} onClick=${() => pick(t)}>${label}</button>`
  const row = (r: LookForRow) => html`<div class=${r.flag === 'value' ? 'look value' : 'look'}>
    <span class="name">${r.flag === 'value' ? '⭐ ' : ''}${r.name}${injuryBadge(r.key)}${memo(r.key)}</span><span class="tags">${r.cats.map((c) => `+${CATEGORY_LABELS[c]}`).join(' ')}</span><span class="price">${money(r.value)}</span><span class="val">${r.market > 0 ? money(r.market) : '—'}</span>
  </div>`
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
        <span class=${`health ${p.health}`}>${p.health === 'live' ? '● live' : '○ waiting'}</span>
        <span class="badges">
          <span class=${`badge ${temp.label.replace(' ', '-')}`} title="room temperature: recent prices vs value">${temp.label}${temp.T !== null ? ` ${temp.T.toFixed(2)}` : ''}</span>
          <span class="badge" title="inflation: money left vs value left">infl ${advice.inflation.toFixed(2)}</span>
        </span>
        <button class="reset" title="New draft" onClick=${newDraft}>↺</button>
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
                ${note && html`<div class="note mine">📝 ${note}</div>`}
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
          <span class="label">Nominate</span><b>${advice.nomination.name}</b>${injuryBadge(advice.nomination.playerKey)}${memo(advice.nomination.playerKey)}<span class="pill">${advice.nomination.phase}</span>
          <div class="why">${advice.nomination.reason}</div>
        </section>`}
        ${(look || like) &&
        html`<section class="lookfor">
          <h4><span class="tabs" role="tablist">${tabButton('look', 'Look for', !!look)}${tabButton('similar', like && liveKey ? `Similar to ${valueOf(state, liveKey).name}` : 'Similar', !!like)}</span><span class="cols">yours · ESPN</span></h4>
          ${tab === 'similar' && like
            ? like.rows.length
              ? like.rows.map(row)
              : html`<div class="empty">Nobody like him left near his value</div>`
            : look &&
              html`${look.rows.length ? look.rows.map(row) : html`<div class="empty">Nobody left you can afford at $5+</div>`}
                ${standingText(look.strong, look.weak) && html`<div class="why">${standingText(look.strong, look.weak)}</div>`}`}
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
                </div>`,
              )
            : html`<div class="empty">No sales yet</div>`}
        </section>
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
