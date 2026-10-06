import { describe, expect, it } from 'vitest'
import { placeholderValue, reduce } from '../../src/engine/reducer'
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

  it('re-nominating the player already on the block is ignored (no price drop)', () => {
    const s = build(settings(), V, [nominated('Alpha', 2, 1), { type: 'bid', teamId: 3, amount: 9 }])
    expect(reduce(s, nominated('Alpha', 4, 2))).toBe(s)
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

  it('names a placeholder for an unmapped ESPN id "ESPN #<id>", any other key by itself', () => {
    expect(placeholderValue('espn:4396993').name).toBe('ESPN #4396993')
    expect(build(settings(), V, [{ type: 'setValue', playerKey: 'espn:42', b: 5 }]).values['espn:42']).toMatchObject({ name: 'ESPN #42', b: 5 })
    expect(placeholderValue('ghost').name).toBe('ghost')
    expect(placeholderValue('espn:12x').name).toBe('espn:12x')
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

describe('nomination turn state', () => {
  const turn = (teamId: number): DraftEvent => ({ type: 'turn', teamId })

  it('starts unknown', () => {
    const s = build(settings(), V, [])
    expect([s.turnTeamId, s.lastNominatorId]).toEqual([null, null])
  })

  it('a turn event sets turnTeamId, and repeating it changes nothing', () => {
    const s = build(settings(), V, [turn(3)])
    expect(s.turnTeamId).toBe(3)
    expect(reduce(s, turn(3))).toBe(s)
    expect(reduce(s, turn(2)).turnTeamId).toBe(2)
  })

  it('a nomination records the nominator and clears the turn', () => {
    const s = build(settings(), V, [turn(3), nominated('Alpha', 3, 1)])
    expect([s.turnTeamId, s.lastNominatorId]).toEqual([null, 3])
  })

  it('a refused nomination leaves both fields alone', () => {
    const s = build(settings(), V, [nominated('Alpha', 2, 1), sold('Alpha', 2, 5), turn(4)])
    expect(reduce(s, nominated('Alpha', 1, 1))).toBe(s)
  })

  it('sold, undo, clearLive and editSale leave both fields alone', () => {
    let s = build(settings(), V, [nominated('Alpha', 2, 1), turn(4)])
    const keep = (x: typeof s) => [x.turnTeamId, x.lastNominatorId]
    s = reduce(s, nominated('Bravo', 3, 1))
    s = reduce(s, turn(4))
    for (const ev of [sold('Bravo', 3, 5), { type: 'editSale', seq: 1, teamId: 1, price: 6 }, { type: 'clearLive' }, { type: 'undo' }] as DraftEvent[]) {
      expect(keep(reduce(s, ev))).toEqual([4, 3])
    }
  })

  it('a saved log from before turns existed still replays, fields null', () => {
    const old: DraftEvent[] = [nominated('Alpha', 2, 1), { type: 'bid', teamId: 3, amount: 5 }, sold('Alpha', 3, 5)]
    const s = build(settings(), V, old)
    expect(s.sales).toHaveLength(1)
    expect(s.turnTeamId).toBeNull()
    expect(s.lastNominatorId).toBe(2)
  })
})
