import { describe, expect, it } from 'vitest'
import { reduce } from '../../src/engine/reducer'
import type { DraftEvent } from '../../src/engine/types'
import { build, nominated, pv, settings, sold } from '../helpers'

const V = [pv('Alpha', 30), pv('Bravo', 20)]

describe('reduce', () => {
  it('a nomination puts the player on the block with the nominator leading', () => {
    expect(build(settings(), V, [nominated('Alpha', 2, 1)]).live).toEqual({ playerKey: 'alpha', price: 1, leaderId: 2 })
  })

  it('higher bids move price and leader; equal or lower bids are ignored', () => {
    const s = build(settings(), V, [nominated('Alpha', 2, 1), { type: 'bid', teamId: 3, amount: 5 }, { type: 'bid', teamId: 4, amount: 5 }, { type: 'bid', teamId: 4, amount: 3 }])
    expect(s.live).toEqual({ playerKey: 'alpha', price: 5, leaderId: 3 })
  })

  it('a bid with nothing on the block is ignored', () => {
    expect(build(settings(), V, [{ type: 'bid', teamId: 3, amount: 5 }]).live).toBeNull()
  })

  it('a sale records a sequence number, clears the block and ignores repeats', () => {
    const s = build(settings(), V, [nominated('Alpha', 2, 1), sold('Alpha', 3, 12), sold('Alpha', 4, 15)])
    expect(s.sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 3, price: 12 }])
    expect(s.live).toBeNull()
    expect(s.nextSeq).toBe(2)
  })

  it('nominating an already-sold player is ignored', () => {
    expect(build(settings(), V, [sold('Alpha', 3, 12), nominated('Alpha', 2, 1)]).live).toBeNull()
  })

  it('keeps sales of players missing from the values', () => {
    expect(build(settings(), V, [sold('Ghost', 2, 3)]).sales[0].playerKey).toBe('ghost')
  })

  it('undo removes the last sale and is a no-op with none', () => {
    expect(build(settings(), V, [sold('Alpha', 3, 12), sold('Bravo', 2, 9), { type: 'undo' }]).sales.map((x) => x.playerKey)).toEqual(['alpha'])
    expect(build(settings(), V, [{ type: 'undo' }]).sales).toEqual([])
  })

  it('editSale fixes team and price', () => {
    const s = build(settings(), V, [sold('Alpha', 3, 12), { type: 'editSale', seq: 1, teamId: 4, price: 14 }])
    expect(s.sales[0]).toEqual({ seq: 1, playerKey: 'alpha', teamId: 4, price: 14 })
  })

  it('toggleTarget adds then removes', () => {
    const t = { type: 'toggleTarget', playerKey: 'bravo' } as const
    expect(build(settings(), V, [t]).targets).toEqual(['bravo'])
    expect(build(settings(), V, [t, t]).targets).toEqual([])
  })

  it('setValue floors at $1 and creates an entry for an unknown player', () => {
    const s = build(settings(), V, [{ type: 'setValue', playerKey: 'alpha', b: 0 }, { type: 'setValue', playerKey: 'ghost', b: 7 }])
    expect(s.values.alpha.b).toBe(1)
    expect(s.values.ghost).toMatchObject({ key: 'ghost', name: 'ghost', b: 7, tier: 5 })
  })

  it('clearLive takes the player off the block', () => {
    expect(build(settings(), V, [nominated('Alpha', 2, 1), { type: 'clearLive' }]).live).toBeNull()
  })

  it('ignores events of unknown type', () => {
    const before = build(settings(), V, [sold('Alpha', 3, 12)])
    expect(reduce(before, { type: 'bogus' } as unknown as DraftEvent)).toBe(before)
  })

  it('setMyTeam', () => {
    expect(build(settings(), V, [{ type: 'setMyTeam', teamId: 3 }], null).myTeamId).toBe(3)
  })
})
