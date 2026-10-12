import { describe, expect, it } from 'vitest'
import { botCap, botInflation, botNominate, botRaise, drawBotValues, marketPrice, maxBid, personalityFactor, roomInflation, VALUE_CENTER } from '../../src/sim/bots'
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

  it('private values average to market x room x VALUE_CENTER for a balanced bot (lognormal noise has mean 1)', () => {
    const players = Array.from({ length: 4000 }, (_, i) => P(i + 1, 20))
    const values = drawBotValues(mulberry32(3), 'balanced', players, 1.1)
    const mean = [...values.values()].reduce((s, x) => s + x, 0) / values.size
    const expected = 20 * 1.1 * VALUE_CENTER
    expect(mean).toBeGreaterThan(expected * 0.98)
    expect(mean).toBeLessThan(expected * 1.02)
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

  it('room inflation: money above $1 per slot over market above $1 of the players left', () => {
    expect(roomInflation(2000, 130, Array.from({ length: 130 }, () => 2000 / 130))).toBeCloseTo(1, 9)
    expect(roomInflation(1000, 50, [20, 20, 11])).toBe(2) // capped
    expect(roomInflation(98, 50, [20, 20, 11])).toBe(1) // $48 spare for $48 above $1
    expect(roomInflation(10, 5, [1, 1])).toBe(1) // nothing above $1 left
  })

  it("bot inflation: the room's, scaled by the bot's spare money per slot vs the room's", () => {
    expect(botInflation(1, 200, 13, (200 - 13) / 13)).toBeCloseTo(1, 9)
    expect(botInflation(1, 56, 4, 4)).toBe(2.5) // rich bot pays up, capped
    expect(botInflation(1.2, 30, 10, 4)).toBeCloseTo(0.6, 9) // $2 spare per slot vs $4
    expect(botInflation(1, 5, 5, 4)).toBe(0.5) // broke: floor
    expect(botInflation(0.9, 50, 5, 0)).toBe(0.9) // room has no spare money: room inflation only
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

  it('throwaways come from the 10 most-bought cheap players: ones the nominator is happy to keep at $1', () => {
    const cheap = Array.from({ length: 15 }, (_, i) => P(10 + i, 4.5 - i * 0.25))
    const draws = [0, 0.99]
    expect(botNominate(() => draws.shift()!, [P(1, 60), ...cheap])).toBe(cheap[9])
  })

  it('throwaways are players real drafters buy (ESPN market > 0), never undrafted names', () => {
    const available = [P(1, 60), P(2, 30), P(3, 2), P(4, 1), P(5, 0, 3), P(6, 0, 0)]
    const draws = [0, 0.99] // throwaway, then the last cheap player
    expect(botNominate(() => draws.shift()!, available)).toBe(available[3])
  })
})
