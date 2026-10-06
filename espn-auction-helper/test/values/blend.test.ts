import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EspnPlayer } from '../../src/espn/players'
import { basisFactor, blendValues, median, tierRatios } from '../../src/values/blend'
import { parseJoshCsv, type JoshRow } from '../../src/values/josh'

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
  const espn: EspnPlayer[] = [
    { id: 1, name: 'Star One', slots: [0], roto: 60, market: 70 },
    { id: 2, name: 'Mid Two', slots: [1], roto: 20, market: 15 },
    { id: 3, name: 'Cheap Three', slots: [4], roto: 2, market: 1 },
  ]
  const josh = [row('Star One', 50, 50), row('Mid Two', 30, 30), row('Ghost Four', 4, 4)]

  it('averages Josh and ESPN, scales ESPN-only players, keeps Josh-only players', () => {
    const r = blendValues(espn, josh)
    expect(r.basis).toBe(1)
    expect(r.unmatchedJosh).toEqual(['Ghost Four'])
    expect(r.values.map((v) => [v.name, v.b, v.tier])).toEqual([
      ['Star One', 55, 1],
      ['Mid Two', 25, 1],
      ['Ghost Four', 4, 1],
      ['Cheap Three', 2, 1],
    ])
    expect(r.values[0]).toMatchObject({ key: 'star one', espnId: 1, consensus: 60, market: 70, josh: 50, avoid: false })
    expect(r.values[2]).toMatchObject({ espnId: null, slots: [] })
  })

  it('carries the avoid flag', () => {
    const r = blendValues(espn, [row('Mid Two', null, null, 'avoid')])
    expect(r.values.find((v) => v.name === 'Mid Two')).toMatchObject({ avoid: true, josh: null })
  })

  it('on real data: every Josh row matches ESPN and Josh suppresses stars', () => {
    const real = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
    const r = blendValues(real, parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8')))
    expect(r.unmatchedJosh).toEqual([])
    expect(r.ratios[1]).toBeLessThan(1)
    expect(r.values.find((v) => v.name === 'Nikola Jokic')!.b).toBeGreaterThan(60)
    expect(r.values.every((v) => v.b >= 1)).toBe(true)
  })
})
