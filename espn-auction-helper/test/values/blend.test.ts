import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EspnPlayer } from '../../src/espn/players'
import { basisFactor, blendValues, median, RATIO_MAX, RATIO_MIN, tierRatios } from '../../src/values/blend'
import { parseJoshCsv, type JoshRow } from '../../src/values/josh'
import { parseProjectionsCsv, type ProjectionRow } from '../../src/values/projections'

const row = (player: string, low: number | null, high: number | null, kind: JoshRow['kind'] = 'value'): JoshRow =>
  ({ player, low, high, kind, sold: null, winner: '', take: '', confidence: 'high' })

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('basisFactor', () => {
  it('is sum(consensus)/sum(josh) over pairs where both are >= $5', () => {
    expect(basisFactor([{ josh: 50, consensus: 60 }, { josh: 30, consensus: 20 }, { josh: 2, consensus: 10 }])).toBe(1)
    expect(basisFactor([{ josh: 10, consensus: 20 }])).toBe(2)
    expect(basisFactor([])).toBe(1)
  })
})

describe('tierRatios', () => {
  it('clamps medians and lets thin tiers inherit the nearest tier (lower first)', () => {
    const r = tierRatios(new Map([[1, [0.5, 0.6, 0.7]], [3, [2, 2, 2, 2]]]))
    expect(r).toEqual({ 1: 0.6, 2: 0.6, 3: 1.5, 4: 1.5, 5: 1.5 })
  })

  it('falls back to 1 with no data', () => {
    expect(tierRatios(new Map())).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 })
  })
})

describe('blendValues', () => {
  // ESPN's own roto values are ignored: the projections' dollar value is the consensus.
  const espn: EspnPlayer[] = [
    { id: 1, name: 'Star One', slots: [0], roto: 99, market: 70 },
    { id: 2, name: 'Mid Two', slots: [1], roto: 99, market: 15 },
    { id: 3, name: 'Cheap Three', slots: [4], roto: 99, market: 1 },
    { id: 5, name: 'Bench Five', slots: [4], roto: 99, market: 0 },
    { id: 6, name: 'Bench Six', slots: [4], roto: 99, market: 0 },
    { id: 7, name: 'Not Projected', slots: [4], roto: 99, market: 0 },
  ]
  const proj = (rank: number, name: string, value: number): ProjectionRow => ({ rank, name, pos: 'C', team: 'X', gp: 70, mpg: 30, z: 0, value })
  const projections: ProjectionRow[] = [
    proj(1, 'Star One', 60),
    proj(2, 'Mid Two', 20),
    proj(3, 'Cheap Three', 2),
    proj(4, 'Bench Six', 0),
    proj(5, 'Bench Five', 0),
    proj(6, 'Ghost Four', 0),
    proj(7, 'Projection Only', 3),
  ]
  const josh = [row('Star One', 50, 50), row('Mid Two', 30, 30), row('Ghost Four', 4, 4)]

  it('averages Josh and the projections, scales projection-only players, keeps Josh-only players, orders ties by projection rank', () => {
    const r = blendValues(espn, josh, projections)
    expect(r.basis).toBe(1)
    expect(r.unmatchedJosh).toEqual(['Ghost Four'])
    expect(r.unmatchedProjections).toEqual(['Projection Only'])
    expect(r.values.map((v) => [v.name, v.b, v.rank])).toEqual([
      ['Star One', 55, 1],
      ['Mid Two', 25, 2],
      ['Ghost Four', 4, 6],
      ['Cheap Three', 2, 3],
      ['Bench Six', 1, 4],
      ['Bench Five', 1, 5],
      ['Not Projected', 1, null],
    ])
    expect(r.values[0]).toMatchObject({ key: 'star one', espnId: 1, consensus: 60, market: 70, josh: 50, avoid: false, tier: 1 })
    expect(r.values[2]).toMatchObject({ espnId: null, slots: [], consensus: 0 })
    expect(r.values[6]).toMatchObject({ consensus: 0, market: 0 })
  })

  it('carries the avoid flag', () => {
    const r = blendValues(espn, [row('Mid Two', null, null, 'avoid')], projections)
    expect(r.values.find((v) => v.name === 'Mid Two')).toMatchObject({ avoid: true, josh: null })
  })

  it('on real data: every Josh row and every priced projection matches ESPN, tier ratios stay inside the clamp', () => {
    const real = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
    const realProjections = parseProjectionsCsv(readFileSync('data/auction-values.csv', 'utf8'))
    const r = blendValues(real, parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8')), realProjections)
    expect(r.unmatchedJosh).toEqual([])
    expect(r.unmatchedProjections).toEqual([])
    for (const ratio of Object.values(r.ratios)) {
      expect(ratio).toBeGreaterThanOrEqual(RATIO_MIN)
      expect(ratio).toBeLessThanOrEqual(RATIO_MAX)
    }
    expect(r.values.find((v) => v.name === 'Nikola Jokic')!.b).toBeGreaterThan(60)
    expect(r.values.every((v) => v.b >= 1)).toBe(true)
    const dollar = r.values.filter((v) => v.b === 1 && v.rank !== null).map((v) => v.rank!)
    expect(dollar.length).toBeGreaterThan(30)
    expect(dollar).toEqual([...dollar].sort((a, b) => a - b))
  })
})
