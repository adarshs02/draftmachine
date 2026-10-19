import { describe, expect, it } from 'vitest'
import { categoryProfile, valueFlag } from '../../src/engine/profile'
import { build, pv } from '../helpers'
import { FIT_S, FIT_V } from './fitFixture'

const s = build(FIT_S, FIT_V, [])

describe('categoryProfile', () => {
  it('names what a player is good at against the draftable pool', () => {
    expect(categoryProfile(s, 'wall1')!.strengths[0]).toBe('blk')
    expect(categoryProfile(s, 'passer')!.strengths[0]).toBe('ast')
  })

  it('names what he costs you: a poor FT shooter on volume hurts FT%', () => {
    expect(categoryProfile(s, 'brick1')!.costs).toContain('ftPct')
    expect(categoryProfile(s, 'brick1')!.strengths).not.toContain('ftPct')
  })

  it('at most 3 strengths and 2 costs; an average player has neither', () => {
    for (const key of ['wall1', 'passer', 'brick1', 'p1', 'p60']) {
      const p = categoryProfile(s, key)!
      expect(p.strengths.length).toBeLessThanOrEqual(3)
      expect(p.costs.length).toBeLessThanOrEqual(2)
    }
    expect(categoryProfile(s, 'p26')).toEqual({ strengths: [], costs: [] })
  })

  it('is null without a stat line', () => {
    expect(categoryProfile(s, 'nostats')).toBeNull()
    expect(categoryProfile(build(FIT_S, [pv('Lonely', 10)], []), 'lonely')).toBeNull()
  })
})

describe('valueFlag', () => {
  it('value play when my value beats what the room pays by $3 and 15%', () => {
    expect(valueFlag(26, 19)).toBe('value')
    expect(valueFlag(12, 10)).toBeNull() // $2 gap
    expect(valueFlag(60, 54)).toBeNull() // $6 but only 11%
  })

  it('room overpays when the room pays that much more than my value', () => {
    expect(valueFlag(19, 26)).toBe('overpay')
  })

  it('no flag without an ESPN average', () => {
    expect(valueFlag(30, 0)).toBeNull()
  })
})
