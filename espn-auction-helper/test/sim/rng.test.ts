import { describe, expect, it } from 'vitest'
import { mulberry32, normal, pick, uniform } from '../../src/sim/rng'

describe('rng', () => {
  it('is deterministic per seed and in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 1000 }, () => a())
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(mulberry32(43)()).not.toBe(mulberry32(42)())
  })

  it('normal has mean ~0 and sd ~1', () => {
    const r = mulberry32(7)
    const xs = Array.from({ length: 20000 }, () => normal(r))
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
    expect(Math.abs(mean)).toBeLessThan(0.03)
    expect(Math.abs(sd - 1)).toBeLessThan(0.03)
  })

  it('uniform and pick stay in range', () => {
    const r = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const u = uniform(r, 300, 3000)
      expect(u).toBeGreaterThanOrEqual(300)
      expect(u).toBeLessThan(3000)
    }
    expect(['a', 'b', 'c']).toContain(pick(r, ['a', 'b', 'c']))
  })
})
