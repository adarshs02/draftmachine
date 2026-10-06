import { describe, expect, it } from 'vitest'
import { maxMatching, needBoost, startingSlots } from '../../src/engine/need'
import { build, pv, settings, sold } from '../helpers'

describe('startingSlots', () => {
  it('expands counts and drops bench and IR', () => {
    expect(startingSlots({ 11: 3, 0: 1, 4: 2, 12: 3, 13: 1 })).toEqual([0, 4, 4, 11, 11, 11])
  })
})

describe('maxMatching', () => {
  it('re-routes earlier players to fill more slots', () => {
    expect(maxMatching([[0, 11], [0]], [0, 11])).toEqual({ size: 2, unfilled: [] })
  })

  it('reports unfilled slots', () => {
    expect(maxMatching([[0]], [0, 4])).toEqual({ size: 1, unfilled: [4] })
  })
})

describe('needBoost', () => {
  const S = settings(2, { lineupSlotCounts: { 4: 1, 11: 1, 12: 1 }, rosterSize: 3 })
  const C = (n: string, b: number) => pv(n, b, { slots: [4, 11] })
  const G = (n: string) => pv(n, 10, { slots: [0, 11] })
  const guards = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map(G)

  it('boosts a player who fills my open slot when that position is thin', () => {
    expect(needBoost(build(S, [C('C1', 20), C('C2', 10), ...guards], []), 'c1')).toBe(1.1)
  })

  it('no boost when the position is deep', () => {
    const centers = ['C2', 'C3', 'C4', 'C5', 'C6'].map((n) => C(n, 10))
    expect(needBoost(build(S, [C('C1', 20), ...centers, ...guards], []), 'c1')).toBe(1)
  })

  it('no boost when my starting slots are already full', () => {
    const s = build(S, [C('C1', 20), C('C2', 10), ...guards], [sold('C2', 1, 5), sold('G1', 1, 5)])
    expect(needBoost(s, 'c1')).toBe(1)
  })

  it('no boost without my team', () => {
    expect(needBoost(build(S, [C('C1', 20)], [], null), 'c1')).toBe(1)
  })

  it('boosts a player who fills a thin hole by moving a flexible rostered player', () => {
    const S2 = settings(2, { lineupSlotCounts: { 1: 1, 4: 1, 12: 1 }, rosterSize: 3 })
    const guards = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((n) => pv(n, 10, { slots: [1] }))
    const values = [pv('X', 10, { slots: [1, 4] }), pv('S1', 20, { slots: [1] }), pv('C2', 10, { slots: [4] }), ...guards]
    expect(needBoost(build(S2, values, [sold('X', 1, 5)]), 's1')).toBe(1.1)
  })
})
