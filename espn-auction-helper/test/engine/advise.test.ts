import { describe, expect, it } from 'vitest'
import { advise } from '../../src/engine/advise'
import { build, nominated, pv, settings, sold } from '../helpers'

describe('advise', () => {
  it('bundles every card, newest sale first', () => {
    const a = advise(build(settings(), [pv('Alpha', 30), pv('Bravo', 20)], [sold('Alpha', 2, 31), sold('Bravo', 3, 9)]))
    expect(a.feed.map((f) => [f.name, f.teamName, f.price, f.value])).toEqual([['Bravo', 'T3', 9, 20], ['Alpha', 'T2', 31, 30]])
    expect(a.verdict).toBeNull()
    expect(a.teams).toHaveLength(4)
    expect(a.budget).toMatchObject({ budgetLeft: 200 })
    expect(a.temperature.label).toBe('Reading room')
  })

  it('keeps the 8 newest sales', () => {
    const sales = Array.from({ length: 10 }, (_, i) => sold(`F${i}`, 2, 1))
    expect(advise(build(settings(), [], sales)).feed.map((f) => f.name)).toEqual(['f9', 'f8', 'f7', 'f6', 'f5', 'f4', 'f3', 'f2'])
  })

  it('includes the verdict when a player is on the block', () => {
    expect(advise(build(settings(), [pv('Alpha', 30)], [nominated('Alpha', 2, 1)])).verdict?.kind).toBe('BID')
  })
})
