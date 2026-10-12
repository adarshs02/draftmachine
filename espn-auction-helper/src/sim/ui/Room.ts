import { useState } from 'preact/hooks'
import { teamSummary, valueOf } from '../../engine/metrics'
import { html } from '../../ui/html'
import { marketPrice } from '../bots'
import { CATEGORIES, CATEGORY_LABELS } from '../score'
import type { Session } from '../session'

const NOMINATE_RESULTS = 8
const FEED_ROWS = 12
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
const inputValue = (e: Event) => (e.currentTarget as HTMLInputElement).value
const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`
const positions = (slots: number[]) => slots.filter((s) => s < POSITIONS.length).map((s) => POSITIONS[s]).join('/')

/** The draft room: teams, the block (with my buttons), my nomination, the sales feed and the end-of-draft results. */
export function Room({ session }: { session: Session }) {
  const { state } = session.view
  const [amount, setAmount] = useState('')
  const [query, setQuery] = useState('')
  const [passedOn, setPassedOn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const me = state.myTeamId
  const live = state.live
  const simulate = session.config.mode === 'simulate'
  const teamName = (id: number) => teamSummary(state, id).name
  const nameOf = (key: string) => valueOf(state, key).name

  const strip = html`<div class="strip">
    ${state.settings.teams.map((t) => {
      const s = teamSummary(state, t.id)
      const onClock = !live && !session.done && state.turnTeamId === t.id
      return html`<div class=${['team', t.id === me ? 'mine' : '', onClock ? 'clock' : ''].join(' ').trim()} data-team=${t.id}>
        <b>#${t.id} ${t.name}</b><span>$${s.budgetLeft}</span><span class="muted">${s.open} open</span>
      </div>`
    })}
  </div>`

  const blockView = () => {
    if (!live) return null
    const v = valueOf(state, live.playerKey)
    const block = session.block
    const canBid = simulate && live.leaderId !== me && passedOn !== live.playerKey
    return html`<div class="block">
      <div class="player">${v.name} <span class="muted">${positions(v.slots)}</span></div>
      <div class="muted">projected $${Math.round(v.consensus)} · ESPN avg $${Math.round(v.market)}</div>
      <div class="price">
        $${live.price} <span class="muted">${teamName(live.leaderId)}</span>
        ${block ? html`<span class="countdown">${seconds(block.endsAt - session.time)}</span>` : null}
      </div>
      ${canBid
        ? html`<div class="actions">
            <button onClick=${() => setError(session.myBid(live.price + 1))}>+$1</button>
            <button onClick=${() => setError(session.myBid(live.price + 5))}>+$5</button>
            <input type="number" min="1" placeholder="$" value=${amount} onInput=${(e: Event) => setAmount(inputValue(e))} />
            <button onClick=${() => setError(session.myBid(Number(amount)))}>Bid</button>
            <button onClick=${() => setPassedOn(live.playerKey)}>Pass</button>
          </div>`
        : null}
    </div>`
  }

  const nominateView = () => {
    const q = query.trim().toLowerCase()
    const matches = session.available().filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, NOMINATE_RESULTS)
    const opening = Number(amount || '1')
    return html`<div class="block nominate">
      <div class="player">Your turn to nominate</div>
      <input placeholder="Search players" value=${query} onInput=${(e: Event) => setQuery(inputValue(e))} />
      <input type="number" min="1" placeholder="$1" value=${amount} onInput=${(e: Event) => setAmount(inputValue(e))} />
      <ul>
        ${matches.map(
          (p) => html`<li>
            <button onClick=${() => setError(session.myNominate(p.espnId, opening))}>Nominate</button>
            ${p.name} <span class="muted">market $${Math.round(marketPrice(p))}</span>
          </li>`,
        )}
      </ul>
    </div>`
  }

  const waiting = html`<div class="block muted">
    ${session.done ? 'Draft complete' : state.turnTeamId !== null ? `${teamName(state.turnTeamId)} is nominating…` : 'Waiting for the next nomination…'}
  </div>`

  const feed = html`<div class="feed">
    <h3>Sales (${state.sales.length})</h3>
    ${state.sales
      .slice(-FEED_ROWS)
      .reverse()
      .map((x) => html`<div class=${x.teamId === me ? 'mine' : ''}>${nameOf(x.playerKey)} → ${teamName(x.teamId)} $${x.price}</div>`)}
  </div>`

  const results = () => {
    const standings = session.standings()
    const r = session.myResult()
    const mine = me === null ? [] : state.sales.filter((x) => x.teamId === me)
    return html`<div class="results">
      <h3>Results</h3>
      <div>Value captured <b>$${Math.round(r.valueCaptured)}</b> (projected value − price) · <b>$${r.moneyLeft}</b> left unspent</div>
      ${standings
        ? html`<table class="standings">
            <thead><tr><th>#</th><th>Team</th><th>Pts</th>${CATEGORIES.map((c) => html`<th>${CATEGORY_LABELS[c]}</th>`)}<th>No proj.</th></tr></thead>
            <tbody>
              ${standings.map(
                (t) => html`<tr class=${t.teamId === me ? 'mine' : ''}>
                  <td>${t.rank}</td><td>${teamName(t.teamId)}</td><td>${t.total}</td>
                  ${CATEGORIES.map((c) => html`<td>${t.points[c]}</td>`)}
                  <td>${t.missingProjections}</td>
                </tr>`,
              )}
            </tbody>
          </table>`
        : html`<div class="muted">Projected standings need data/hashtag-projections.csv; restart npm run sim once it exists.</div>`}
      <h3>My roster</h3>
      ${mine.map((x) => html`<div>${nameOf(x.playerKey)} $${x.price}</div>`)}
    </div>`
  }

  return html`<div class="room">
    ${strip}
    ${live ? blockView() : simulate && session.myTurn ? nominateView() : waiting}
    ${error ? html`<div class="error">${error}</div>` : null}
    ${session.done ? results() : feed}
  </div>`
}
