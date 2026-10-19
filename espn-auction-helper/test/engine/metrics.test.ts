import { describe, expect, it } from 'vitest'
import { adjustedValue, available, inflation, myBudget, saleFlags, teamSummary, temperature } from '../../src/engine/metrics'
import type { DraftEvent } from '../../src/engine/types'
import { build, pv, settings, sold } from '../helpers'

const small = settings(2, { budget: 100, rosterSize: 3 })

describe('teamSummary', () => {
  it('derives budget, open slots, max bid and per-slot money from sales', () => {
    const s = build(small, [pv('A', 40)], [sold('A', 1, 40)])
    expect(teamSummary(s, 1)).toMatchObject({ name: 'T1', budgetLeft: 60, open: 2, maxBid: 59, perSlot: 30 })
    expect(teamSummary(s, 9).name).toBe('Team 9')
  })
})

describe('available', () => {
  it('drops sold players and sorts by value', () => {
    const s = build(small, [pv('A', 10), pv('B', 30), pv('C', 20)], [sold('B', 2, 30)])
    expect(available(s).map((v) => v.name)).toEqual(['C', 'A'])
  })
})

describe('inflation', () => {
  it('is (money left - open slots) / surplus of the best remaining players', () => {
    const s = build(small, ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => pv(n, [80, 60, 40, 20, 10, 5][i])), [])
    expect(inflation(s)).toBeCloseTo(194 / 209, 6)
  })

  it('clamps to [0.8, 1.2] and is 1 with no surplus left', () => {
    expect(inflation(build(small, [pv('A', 2)], []))).toBe(1.2)
    expect(inflation(build(small, [pv('A', 200), pv('B', 200)], []))).toBe(0.8)
    expect(inflation(build(small, [pv('A', 1)], []))).toBe(1)
  })
})

describe('temperature', () => {
  const four = ['P1', 'P2', 'P3', 'P4'].map((n) => pv(n, 100))
  const sellAll = (price: number): DraftEvent[] => ['P1', 'P2', 'P3', 'P4'].map((n, i) => sold(n, i + 1, price))

  it('needs 4 sales of $5+ players before reading the room', () => {
    const t = temperature(build(settings(), four, sellAll(100).slice(0, 3)))
    expect(t).toEqual({ T: null, label: 'Reading room' })
  })

  it.each([
    [106, 'Hot'],
    [103, 'Warm'],
    [100, 'Neutral'],
    [94, 'Cold'],
  ])('price %i on $100 players -> %s', (price, label) => {
    expect(temperature(build(settings(), four, sellAll(price))).label).toBe(label)
  })

  it('ignores players under $5', () => {
    const s = build(settings(), [...four, pv('Cheap', 2)], [...sellAll(100), sold('Cheap', 1, 50)])
    expect(temperature(s).label).toBe('Neutral')
  })

  it('only looks at the last 12 qualifying sales', () => {
    const names = Array.from({ length: 13 }, (_, i) => `Q${i}`)
    const events = names.map((n, i) => sold(n, (i % 4) + 1, i === 0 ? 50 : 10))
    expect(temperature(build(settings(), names.map((n) => pv(n, 10)), events)).label).toBe('Neutral')
  })
})

describe('adjustedValue', () => {
  const hotRoom = (extra: ReturnType<typeof pv>[]) =>
    build(settings(), [...['P1', 'P2', 'P3', 'P4'].map((n) => pv(n, 100)), ...extra], ['P1', 'P2', 'P3', 'P4'].map((n, i) => sold(n, i + 1, 106)))

  it('in a Hot room stars (tier <= 2) get no inflation credit', () => {
    const s = hotRoom([pv('Star', 50, { tier: 1 }), pv('Mid', 50, { tier: 3 })])
    expect(adjustedValue(s, 'star')).toBe(50)
    expect(adjustedValue(s, 'mid')).toBeCloseTo(1 + 49 * 1.2, 6)
  })

  it('accepts explicit inflation and label', () => {
    const s = hotRoom([pv('Mid', 50)])
    expect(adjustedValue(s, 'mid', 1, 'Neutral')).toBe(50)
  })

  it('treats unknown players as $1', () => {
    expect(adjustedValue(build(settings(), [], []), 'ghost')).toBe(1)
  })
})

describe('myBudget', () => {
  it('reserves 2 flyer slots and spreads the rest over core slots', () => {
    expect(myBudget(build(settings(), [], []))).toEqual({ budgetLeft: 200, open: 13, reserve: 2, core: 11, perSlot: 18, safeMax: 188, hardMax: 188 })
  })

  it('with only flyer slots left, safe max is the ESPN max bid', () => {
    const fillers = Array.from({ length: 11 }, (_, i) => sold(`F${i}`, 1, 10))
    expect(myBudget(build(settings(), [], fillers))).toEqual({ budgetLeft: 90, open: 2, reserve: 2, core: 0, perSlot: 0, safeMax: 89, hardMax: 89 })
  })

  it('a full roster has zero to spend and no NaN', () => {
    const fillers = Array.from({ length: 13 }, (_, i) => sold(`F${i}`, 1, 1))
    expect(myBudget(build(settings(), [], fillers))).toEqual({ budgetLeft: 187, open: 0, reserve: 0, core: 0, perSlot: 0, safeMax: 0, hardMax: 0 })
  })

  it('is null without my team', () => {
    expect(myBudget(build(settings(), [], [], null))).toBeNull()
  })
})

describe('saleFlags', () => {
  it('flags a star sold at or under 95% of its adjusted value at that moment', () => {
    const one = settings(1, { budget: 100, rosterSize: 2 })
    const s = build(one, [pv('Star', 60, { tier: 1 }), pv('Other', 41, { tier: 2 })], [sold('Star', 1, 50), sold('Other', 1, 48)])
    const flags = saleFlags(s)
    expect(flags.get(1)).toEqual({ bargain: true })
    expect(flags.get(2)).toEqual({ bargain: false })
  })
})
