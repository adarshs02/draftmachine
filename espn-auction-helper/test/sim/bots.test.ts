import { describe, expect, it } from 'vitest'
import { botCap, botNominate, botRaise, drawBotValues, marketPrice, maxBid, personalityFactor } from '../../src/sim/bots'
import { mulberry32 } from '../../src/sim/rng'
import type { SimPlayer } from '../../src/sim/types'

const P = (espnId: number, market: number, consensus = market): SimPlayer => ({ espnId, key: `p${espnId}`, name: `P${espnId}`, market, consensus })

describe('bots', () => {
  it('market price falls back to consensus, never below $1', () => {
    expect(marketPrice(P(1, 20, 10))).toBe(20)
    expect(marketPrice(P(1, 0, 10))).toBe(10)
    expect(marketPrice(P(1, 0, 0))).toBe(1)
  })

  it('personalities', () => {
    expect(personalityFactor('stars', true)).toBe(1.15)
    expect(personalityFactor('stars', false)).toBe(0.85)
    expect(personalityFactor('balanced', true)).toBe(1)
    expect(personalityFactor('value', false)).toBe(0.9)
  })

  it('private values average to market x room for a balanced bot (lognormal noise has mean 1)', () => {
    const players = Array.from({ length: 4000 }, (_, i) => P(i + 1, 20))
    const values = drawBotValues(mulberry32(3), 'balanced', players, 1.1)
    const mean = [...values.values()].reduce((s, x) => s + x, 0) / values.size
    expect(mean).toBeGreaterThan(22 * 0.98)
    expect(mean).toBeLessThan(22 * 1.02)
  })

  it('caps follow ESPN max bid and the pacing rule', () => {
    expect(maxBid(100, 5)).toBe(96)
    expect(maxBid(100, 0)).toBe(0)
    expect(botCap(50, 100, 5)).toBe(50)
    expect(botCap(80, 100, 5)).toBe(60) // pacing: 60% of budget while >= 4 open
    expect(botCap(80, 100, 3)).toBe(80)
    expect(botCap(10, 5, 5)).toBe(1)
    expect(botCap(10, 50, 0)).toBe(0)
  })

  it('raises by $1, jumps only when far under value, never past the cap', () => {
    expect(botRaise(() => 0.99, 10, 10, 40)).toBeNull()
    expect(botRaise(() => 0.99, 5, 50, 40)).toBe(6)
    expect(botRaise(() => 0, 5, 50, 40)).toBe(7) // jump: +2 + floor(0 * 4)
    expect(botRaise(() => 0, 9, 10, 40)).toBe(10) // jump capped
    expect(botRaise(() => 0, 30, 50, 40)).toBe(31) // 30 >= 60% of 40: no jump
  })

  it('nominates the top player, or sometimes a cheap throwaway', () => {
    const available = [P(1, 60), P(2, 30), P(3, 2), P(4, 1)]
    expect(botNominate(() => 0.99, available)).toBe(available[0])
    expect(botNominate(() => 0, available)).toBe(available[2]) // cheap list [P3, P4], pick index 0
  })
})
