import { describe, expect, it } from 'vitest'
import { assignTiers, byValue, tierForRank } from '../../src/values/tiers'
import type { PlayerValue } from '../../src/values/types'

const v = (key: string, b: number): PlayerValue => ({ key, espnId: null, name: key, slots: [11], b, consensus: 0, market: 0, josh: null, avoid: false, rank: null, tier: 0 })

describe('tiers', () => {
  it.each([[1, 1], [12, 1], [13, 2], [36, 2], [37, 3], [72, 3], [73, 4], [120, 4], [121, 5], [400, 5]])('rank %i -> tier %i', (rank, tier) => {
    expect(tierForRank(rank)).toBe(tier)
  })

  it('assignTiers sorts by b and tiers by rank', () => {
    const out = assignTiers(Array.from({ length: 14 }, (_, i) => v(`p${i}`, i + 1)))
    expect(out[0]).toMatchObject({ key: 'p13', b: 14, tier: 1 })
    expect(out[11].tier).toBe(1)
    expect(out[12].tier).toBe(2)
  })

  it('byValue breaks ties by projection rank, unranked last', () => {
    const tied = [{ ...v('none', 1) }, { ...v('r9', 1), rank: 9 }, { ...v('big', 5), rank: 300 }, { ...v('r2', 1), rank: 2 }]
    expect([...tied].sort(byValue).map((x) => x.key)).toEqual(['big', 'r2', 'r9', 'none'])
    expect(assignTiers(tied).map((x) => x.key)).toEqual(['big', 'r2', 'r9', 'none'])
  })
})
