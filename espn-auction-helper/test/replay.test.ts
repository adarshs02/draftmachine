import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { saleFlags, temperature } from '../src/engine/metrics'
import { rivalsAbove } from '../src/engine/nominate'
import { initialState, reduce } from '../src/engine/reducer'
import type { DraftState, Settings } from '../src/engine/types'
import { ceilingFor, verdict } from '../src/engine/verdict'
import type { EspnPlayer } from '../src/espn/players'
import { ESPN_DEFAULT_COUNTS } from '../src/espn/slots'
import { joshMid, parseJoshCsv } from '../src/values/josh'
import { normalizeName } from '../src/values/names'
import { assignTiers } from '../src/values/tiers'
import type { PlayerValue } from '../src/values/types'

interface Fixture { teams: string[]; settings: { teams: number; budget: number; rosterSize: number }; sales: Array<{ player: string; team: string; price: number }> }
const fixture = JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as Fixture
const espn = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
const josh = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))

/** Josh's own numbers (12-team dollars); ESPN ROTO for players he never priced; $1 for caption-garbled names. */
function replayValues(): PlayerValue[] {
  const byKey = new Map<string, PlayerValue>()
  const blank = (key: string, name: string): PlayerValue => ({ key, espnId: null, name, slots: [11], b: 1, consensus: 0, market: 0, josh: null, avoid: false, rank: null, tier: 0, line: null, injury: null, note: null })
  for (const p of espn) {
    const key = normalizeName(p.name)
    byKey.set(key, { ...blank(key, p.name), espnId: p.id, slots: p.slots, b: Math.max(1, p.roto), consensus: p.roto, market: p.market })
  }
  for (const r of josh) {
    const key = normalizeName(r.player)
    const mid = joshMid(r)
    const base = byKey.get(key) ?? blank(key, r.player)
    byKey.set(key, { ...base, b: mid !== null ? Math.max(1, mid) : base.b, josh: mid, avoid: r.kind === 'avoid' })
  }
  for (const sale of fixture.sales) {
    const key = normalizeName(sale.player)
    if (!byKey.has(key)) byKey.set(key, blank(key, sale.player))
  }
  return assignTiers([...byKey.values()])
}

const values = replayValues()
const teamId = (name: string) => fixture.teams.indexOf(name) + 1
const JOSH = teamId('Josh')
const RIVAL = teamId('Irish Turk')
const settings: Settings = {
  teams: fixture.teams.map((name, i) => ({ id: i + 1, name })),
  budget: fixture.settings.budget,
  rosterSize: fixture.settings.rosterSize,
  lineupSlotCounts: ESPN_DEFAULT_COUNTS,
  flyerReserve: 2,
}
const idx = (player: string) => {
  const i = fixture.sales.findIndex((x) => x.player === player)
  if (i < 0) throw new Error(`not in fixture: ${player}`)
  return i
}
function before(n: number, me = JOSH): DraftState {
  return fixture.sales.slice(0, n).reduce(
    (s, x) => reduce(s, { type: 'sold', playerKey: normalizeName(x.player), teamId: teamId(x.team), price: x.price }),
    initialState(settings, values, me),
  )
}
/** The call just before the winning bid: player on the block at (price - 1), a rival leading. */
function callAt(player: string, price: number, me = JOSH) {
  const s = reduce(before(idx(player), me), { type: 'nominated', playerKey: normalizeName(player), teamId: RIVAL, amount: price })
  return verdict(s)!
}

describe('Josh Lloyd replay (12 teams, $200, 13 spots)', () => {
  it('fixture is complete: 156 sales, 13 per team', () => {
    expect(fixture.sales).toHaveLength(156)
    for (const t of fixture.teams) expect(fixture.sales.filter((x) => x.team === t)).toHaveLength(13)
  })

  it('1. the room reads Hot after SGA ($68) and after Cade ($48)', () => {
    expect(temperature(before(idx('Shai Gilgeous-Alexander') + 1)).label).toBe('Hot')
    expect(temperature(before(idx('Cade Cunningham') + 1)).label).toBe('Hot')
  })

  it('2. Luka at $61 is flagged a bargain', () => {
    const s = before(fixture.sales.length)
    const luka = s.sales.find((x) => x.playerKey === normalizeName('Luka Doncic'))!
    expect(saleFlags(s).get(luka.seq)?.bargain).toBe(true)
  })

  it('3. the Wemby $80 + Jokic $80 team gets the concentration warning', () => {
    const v = callAt('Nikola Jokic', 79, teamId('NY Strangers'))
    expect(v.warnings.some((w) => w.startsWith('Two players'))).toBe(true)
  })

  it.each([
    ['Nickeil Alexander-Walker', 13],
    ['Derrick White', 13],
    ['Dyson Daniels', 16],
    ['Norman Powell', 2],
  ])('4/8/9. %s at $%i is a BID', (player, price) => {
    expect(callAt(player, price).kind).toBe('BID')
  })

  it.each([
    ['Zach Edey', 21],
    ['Walker Kessler', 26],
  ])('5/10. %s at $%i is LET THEM', (player, price) => {
    expect(callAt(player, price).kind).toBe('LET_THEM')
  })

  it('6. on Keegan Murray the $8 rival can outbid Josh', () => {
    const s = before(idx('Keegan Murray'))
    const names = rivalsAbove(s, ceilingFor(s, normalizeName('Keegan Murray'))).map((t) => t.name)
    expect(names).toContain('Hast Tatum')
  })

  it("7. at least 11 of Josh's 13 buys are within the engine's ceiling + $2", () => {
    const buys = fixture.sales.filter((x) => x.team === 'Josh')
    expect(buys).toHaveLength(13)
    const within = buys.filter((x) => x.price <= callAt(x.player, x.price - 1).ceiling + 2)
    expect(within.length).toBeGreaterThanOrEqual(11)
  })
})
