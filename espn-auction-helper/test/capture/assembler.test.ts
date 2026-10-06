import { describe, expect, it } from 'vitest'
import { createAssembler } from '../../src/capture/assembler'

const key = (id: number) => `p${id}`

describe('createAssembler', () => {
  it('a first BID on an empty block is the nomination', () => {
    const a = createAssembler(key)
    expect(a.push({ kind: 'bid', teamId: 2, playerId: 9, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 2, amount: 1 }])
  })

  it('a BID for a different player replaces the block with a nomination', () => {
    const a = createAssembler(key)
    a.push({ kind: 'bid', teamId: 2, playerId: 9, amount: 1 })
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 10, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p10', teamId: 3, amount: 1 }])
  })

  it('a BID for the same player is a bid', () => {
    const a = createAssembler(key)
    a.push({ kind: 'bid', teamId: 2, playerId: 9, amount: 1 })
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 9, amount: 5 })).toEqual([{ type: 'bid', teamId: 3, amount: 5 }])
  })

  it('still handles an explicit nomination, bid without player id, and a sale priced from the last bid', () => {
    const a = createAssembler(key)
    expect(a.push({ kind: 'nominated', teamId: 2, playerId: 9, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 2, amount: 1 }])
    expect(a.push({ kind: 'bid', teamId: 3, playerId: null, amount: 5 })).toEqual([{ type: 'bid', teamId: 3, amount: 5 }])
    expect(a.push({ kind: 'sold', teamId: 3, playerId: 9, amount: null })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 3, price: 5 }])
  })

  it('prefers the price on the sale frame when there is one', () => {
    const a = createAssembler(key)
    a.push({ kind: 'nominated', teamId: 2, playerId: 9, amount: 1 })
    expect(a.push({ kind: 'sold', teamId: 2, playerId: 9, amount: 6 })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 2, price: 6 }])
  })

  it('ignores a player-less bid with nothing on the block', () => {
    expect(createAssembler(key).push({ kind: 'bid', teamId: 3, playerId: null, amount: 5 })).toEqual([])
  })

  it('after a sale the next bid nominates again', () => {
    const a = createAssembler(key)
    a.push({ kind: 'bid', teamId: 2, playerId: 9, amount: 1 })
    a.push({ kind: 'sold', teamId: 2, playerId: 9, amount: 4 })
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 9, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 3, amount: 1 }])
  })

  it('prices a sale it never saw nominated at $1 (fix it with the pencil in the panel)', () => {
    expect(createAssembler(key).push({ kind: 'sold', teamId: 2, playerId: 9, amount: null })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 2, price: 1 }])
  })

  it('drops unknown events', () => {
    expect(createAssembler(key).push({ kind: 'unknown', verb: 'X' })).toEqual([])
  })
})
