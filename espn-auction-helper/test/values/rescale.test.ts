import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rescaleToLeague } from '../../src/values/rescale'
import type { PlayerValue } from '../../src/values/types'

const v = (key: string, b: number): PlayerValue => ({ key, espnId: null, name: key, slots: [11], b, consensus: 0, market: 0, josh: null, avoid: false, rank: null, tier: 0, line: null, injury: null })
const sumTop = (xs: PlayerValue[], k: number) => xs.slice(0, k).reduce((s, x) => s + x.b, 0)

describe('rescaleToLeague', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => v(`p${i}`, 40 - i))

  it('spends exactly the league money on the rostered players, surplus over the replacement player', () => {
    const out = rescaleToLeague(thirty, { teams: 2, budget: 100, rosterSize: 5 })
    expect(sumTop(out, 10)).toBeCloseTo(200, 6)
    expect(out[0].b).toBeCloseTo(1 + (10 * 190) / 55, 6)
    expect(out[9].b).toBeCloseTo(1 + 190 / 55, 6)
    expect(out.slice(10).every((x) => x.b === 1)).toBe(true)
  })

  it('reassigns tiers by new rank', () => {
    const out = rescaleToLeague(thirty, { teams: 2, budget: 100, rosterSize: 5 })
    expect(out[11].tier).toBe(1)
    expect(out[12].tier).toBe(2)
  })

  it('keeps $1 players in projection rank order', () => {
    const tail = [{ ...v('c', 1), rank: 30 }, { ...v('a', 1), rank: 10 }, { ...v('b', 1), rank: 20 }]
    const out = rescaleToLeague([...thirty, ...tail], { teams: 2, budget: 100, rosterSize: 5 })
    expect(out.slice(-3).map((x) => x.key)).toEqual(['a', 'b', 'c'])
  })

  it('degenerates to $1 everywhere when nobody has surplus', () => {
    const out = rescaleToLeague([v('a', 1), v('b', 1)], { teams: 2, budget: 100, rosterSize: 5 })
    expect(out.map((x) => x.b)).toEqual([1, 1])
  })

  it('on real values: a 10-team league sums to $2000 and a 12-team league to $2400', () => {
    const real = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
    const ten = rescaleToLeague(real, { teams: 10, budget: 200, rosterSize: 13 })
    expect(sumTop(ten, 130)).toBeCloseTo(2000, 6)
    const jokic = ten.find((x) => x.name === 'Nikola Jokic')!
    expect(jokic.b).toBeGreaterThan(60)
    expect(jokic.b).toBeLessThan(80)
    expect(sumTop(rescaleToLeague(real, { teams: 12, budget: 200, rosterSize: 13 }), 156)).toBeCloseTo(2400, 6)
  })
})
