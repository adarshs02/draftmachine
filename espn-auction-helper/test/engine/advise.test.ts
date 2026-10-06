import { describe, expect, it } from 'vitest'
import { advise } from '../../src/engine/advise'
import { build, nominated, pv, settings, sold } from '../helpers'

describe('advise', () => {
  it('bundles every card, newest sale first', () => {
    const a = advise(build(settings(), [pv('Alpha', 30), pv('Bravo', 20)], [sold('Alpha', 2, 31), sold('Bravo', 3, 9)]))
    expect(a.feed.map((f) => [f.name, f.teamName, f.price])).toEqual([['Bravo', 'T3', 9], ['Alpha', 'T2', 31]])
    expect(a.verdict).toBeNull()
    expect(a.teams).toHaveLength(4)
    expect(a.budget).toMatchObject({ budgetLeft: 200 })
    expect(a.temperature.label).toBe('Reading room')
  })

  it('includes the verdict when a player is on the block', () => {
    expect(advise(build(settings(), [pv('Alpha', 30)], [nominated('Alpha', 2, 1)])).verdict?.kind).toBe('BID')
  })
})
