import { describe, expect, it } from 'vitest'
import { createAssembler } from '../../src/capture/assembler'

const key = (id: number) => `p${id}`

/** An assembler reading a block the test controls, the way the controller hands it state.live. */
function make(initial: { playerKey: string; price: number } | null = null) {
  const box = { live: initial }
  return { box, a: createAssembler(key, () => box.live) }
}

describe('createAssembler', () => {
  it('a first BID on an empty block is the nomination', () => {
    const { a } = make()
    expect(a.push({ kind: 'bid', teamId: 2, playerId: 9, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 2, amount: 1 }])
  })

  it('a BID for a different player than the one on the block is a nomination', () => {
    const { a } = make({ playerKey: 'p9', price: 1 })
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 10, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p10', teamId: 3, amount: 1 }])
  })

  it('a BID for the player on the block is a bid', () => {
    const { a } = make({ playerKey: 'p9', price: 1 })
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 9, amount: 5 })).toEqual([{ type: 'bid', teamId: 3, amount: 5 }])
  })

  it('follows the block it is given, not what it emitted before', () => {
    const { a, box } = make()
    a.push({ kind: 'bid', teamId: 2, playerId: 9, amount: 1 })
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 9, amount: 5 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 3, amount: 5 }])
    box.live = { playerKey: 'p9', price: 5 }
    expect(a.push({ kind: 'bid', teamId: 4, playerId: 9, amount: 6 })).toEqual([{ type: 'bid', teamId: 4, amount: 6 }])
  })

  it('still handles an explicit nomination, bid without player id, and a sale priced from the block', () => {
    const { a, box } = make()
    expect(a.push({ kind: 'nominated', teamId: 2, playerId: 9, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 2, amount: 1 }])
    box.live = { playerKey: 'p9', price: 5 }
    expect(a.push({ kind: 'bid', teamId: 3, playerId: null, amount: 5 })).toEqual([{ type: 'bid', teamId: 3, amount: 5 }])
    expect(a.push({ kind: 'sold', teamId: 3, playerId: 9, amount: null })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 3, price: 5 }])
  })

  it('prefers the price on the sale frame when there is one', () => {
    const { a } = make({ playerKey: 'p9', price: 1 })
    expect(a.push({ kind: 'sold', teamId: 2, playerId: 9, amount: 6 })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 2, price: 6 }])
  })

  it('ignores a player-less bid with nothing on the block', () => {
    expect(make().a.push({ kind: 'bid', teamId: 3, playerId: null, amount: 5 })).toEqual([])
  })

  it('with the block empty after a sale, the next bid nominates again', () => {
    const { a } = make(null)
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 9, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 3, amount: 1 }])
  })

  it('prices a sale it never saw nominated at $1 (fix it with the pencil in the panel)', () => {
    expect(make().a.push({ kind: 'sold', teamId: 2, playerId: 9, amount: null })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 2, price: 1 }])
  })

  it('does not price a sale from a different player on the block', () => {
    const { a } = make({ playerKey: 'p8', price: 7 })
    expect(a.push({ kind: 'sold', teamId: 2, playerId: 9, amount: null })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 2, price: 1 }])
  })

  it('drops unknown events', () => {
    expect(make().a.push({ kind: 'unknown', verb: 'X' })).toEqual([])
  })

  it('a nominating turn makes no draft event, even with a player on the block', () => {
    expect(make({ playerKey: 'p9', price: 5 }).a.push({ kind: 'turn', teamId: 4 })).toEqual([])
  })
})
