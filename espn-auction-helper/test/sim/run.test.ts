import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { resetTunables, setTunables } from '../../src/engine/constants'
import { formatTable, runDraft, summarize, type DraftResult } from '../../src/sim/run'
import type { ProjectionSource, TeamScore } from '../../src/sim/score'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
/** Synthetic projections, so these tests don't depend on the projections data: better players project proportionally more. */
const STRENGTH = new Map(VALUES.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, Math.max(1, v.consensus)] as const])))
const FAKE: ProjectionSource = (id) => {
  const c = STRENGTH.get(id)
  return c === undefined ? null : { pts: 30 * c, reb: 12 * c, ast: 7 * c, stl: 2 * c, blk: 1.5 * c, tpm: 3 * c, to: 4 * c, fgm: 11 * c, fga: 23 * c, ftm: 5 * c, fta: 6.5 * c }
}
const CONSENSUS = new Map(VALUES.map((v) => [v.espnId, v.consensus]))

afterEach(() => resetTunables())

describe('runDraft', () => {
  it('scores a full autopilot draft when projections exist', () => {
    const r = runDraft({ seed: 3, policy: 'autopilot', values: VALUES, projections: FAKE })
    expect(r.sales).toHaveLength(130)
    expect(r.standings).toHaveLength(10)
    expect(r.mine).toBe(r.standings!.find((t) => t.teamId === 1))
    expect(r.mine!.titlePct).toBeGreaterThanOrEqual(0)
    expect(r.mine!.titlePct).toBeLessThanOrEqual(1)
    expect(r.moneyLeft).toBeGreaterThanOrEqual(0)
    const mine = r.sales.filter((x) => x.teamId === 1)
    expect(r.valueCaptured).toBeCloseTo(mine.reduce((s, x) => s + (CONSENSUS.get(x.espnId) ?? 0) - x.price, 0), 6)
  })

  it('missing projections: no standings, still money left and value captured', () => {
    const r = runDraft({ seed: 3, policy: 'market', values: VALUES, projections: null })
    expect(r).toMatchObject({ standings: null, mine: null, missingProjections: 0 })
    expect(Number.isFinite(r.valueCaptured)).toBe(true)
  })

  it('is deterministic and fast enough for the batch (one draft < 5 s)', () => {
    const t0 = performance.now()
    const a = runDraft({ seed: 5, policy: 'autopilot', values: VALUES, projections: null })
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(runDraft({ seed: 5, policy: 'autopilot', values: VALUES, projections: null }).sales).toEqual(a.sales)
  })

  it('a tunable changes what autopilot buys', () => {
    const base = runDraft({ seed: 6, policy: 'autopilot', values: VALUES, projections: null })
    setTunables({ BID_GAP_FRACTION: 1, BID_UP_MARGIN: 50 })
    const timid = runDraft({ seed: 6, policy: 'autopilot', values: VALUES, projections: null })
    expect(timid.sales.filter((x) => x.teamId === 1)).not.toEqual(base.sales.filter((x) => x.teamId === 1))
  })
})

describe('summarize', () => {
  const season = (title: number): TeamScore => ({
    teamId: 1, categoryWin: {} as TeamScore['categoryWin'], winPct: 0.5 + title / 10, rank: 1, avgSeed: 3 - title, playoffPct: 0.5 + title / 2, titlePct: title, missingProjections: 0,
  })
  const result = (title: number | null, i: number): DraftResult => ({
    policy: 'market', seed: i, sales: [], moneyLeft: 2 * i, valueCaptured: 10 * i, mine: title === null ? null : season(title), missingProjections: 0, standings: null,
  })

  it('averages title odds with a 95% interval, plus playoff odds, seed and weekly record', () => {
    const s = summarize('x', [0.2, 0.6, 0.4, 0.2].map(result))
    expect(s).toMatchObject({ label: 'x', drafts: 4, avgMoneyLeft: 3, avgValueCaptured: 15 })
    expect(s.titlePct).toBeCloseTo(0.35, 9)
    expect(s.playoffPct).toBeCloseTo(0.675, 9)
    expect(s.avgSeed).toBeCloseTo(2.65, 9)
    expect(s.winPct).toBeCloseTo(0.535, 9)
    // sample sd of .2, .6, .4, .2 = sqrt(0.11 / 3)
    expect(s.titleCi).toBeCloseTo((1.96 * Math.sqrt(0.11 / 3)) / 2, 6)
  })

  it('reports no H2H numbers without projections, and the table shows a dash', () => {
    const s = summarize('y', [null, null].map(result))
    expect(s).toMatchObject({ titlePct: null, titleCi: null, playoffPct: null, avgSeed: null, winPct: null, avgValueCaptured: 5 })
    const table = formatTable([s])
    expect(table.split('\n')[0]).toContain('title %')
    expect(table.split('\n')[1]).toContain('—')
  })

  it('shows percentages in the table', () => {
    const row = formatTable([summarize('x', [0.2, 0.6, 0.4, 0.2].map(result))]).split('\n')[1]
    expect(row).toContain('35.0% ±')
    expect(row).toContain('67.5%')
    expect(row).toContain('2.65')
    expect(row).toContain('53.5%')
  })
})
