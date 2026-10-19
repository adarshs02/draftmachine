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

  it('lists players to look for once my team is known', () => {
    // Plenty of money for 2 players pins inflation at 1.2: Alpha is worth $35.8 vs $20 (value play), Bravo $23.8 vs $24.
    const a = advise(build(settings(), [pv('Alpha', 30, { market: 20 }), pv('Bravo', 20, { market: 24 })], []))
    expect(a.lookFor!.rows.map((r) => [r.name, r.flag])).toEqual([['Alpha', 'value'], ['Bravo', null]])
    expect(advise(build(settings(), [pv('Alpha', 30)], [], null)).lookFor).toBeNull()
  })
})
