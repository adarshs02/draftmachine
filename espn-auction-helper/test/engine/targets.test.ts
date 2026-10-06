import { describe, expect, it } from 'vitest'
import { targetList } from '../../src/engine/targets'
import { build, pv, settings } from '../helpers'

// Me: 6 spots, 2 flyers -> 4 core slots, $98 / 4 = $24.5 per slot -> band $12.25-$36.75. Inflation pinned at 1.2.
const S = settings(2, { budget: 100, rosterSize: 6, lineupSlotCounts: { 12: 6 } })
const V = [pv('X1', 30), pv('X2', 20), pv('X3', 5), pv('X4', 80), pv('X5', 25, { avoid: true })]

describe('targetList', () => {
  it('lists players priced near my per-slot money, best value gap first, pinned on top', () => {
    const rows = targetList(build(S, V, [{ type: 'toggleTarget', playerKey: 'x3' }]))
    expect(rows.map((r) => r.name)).toEqual(['X3', 'X1', 'X2'])
    expect(rows[1]).toMatchObject({ pinned: false, ceiling: 35, outbidBy: ['T2'] })
    expect(rows[1].gap).toBeCloseTo(0.2 * 29, 6)
  })

  it('is empty without my team', () => {
    expect(targetList(build(S, V, [], null))).toEqual([])
  })
})
