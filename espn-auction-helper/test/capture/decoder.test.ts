import { describe, expect, it } from 'vitest'
import { decodeFrame, decodeLine, GRAMMAR as g, type AuctionGrammar } from '../../src/capture/decoder'
import { lineFor } from '../helpers'

const withNominate: AuctionGrammar = { ...g, nominate: { verb: 'NOM', team: 1, player: 2, amount: 3 } }

describe('decodeLine', () => {
  it('decodes a bid', () => {
    expect(decodeLine(lineFor(g.bid, { team: 4, player: 3112335, amount: 7 }))).toEqual({ kind: 'bid', teamId: 4, playerId: 3112335, amount: 7 })
  })

  it('decodes a real BID line', () => {
    expect(decodeLine('BID 2 3112335 12 85495 12000')).toEqual({ kind: 'bid', teamId: 2, playerId: 3112335, amount: 12 })
  })

  it('decodes a sale with the price in token 4', () => {
    expect(decodeLine('SOLD 1 3112335 0 66 0')).toEqual({ kind: 'sold', teamId: 1, playerId: 3112335, amount: 66 })
    expect(decodeLine(lineFor(g.sold, { team: 4, player: 9, amount: 7 }))).toEqual({ kind: 'sold', teamId: 4, playerId: 9, amount: 7 })
  })

  it('still decodes nominations for a grammar that has a nominate verb', () => {
    expect(decodeLine(lineFor(withNominate.nominate!, { team: 3, player: 9, amount: 1 }), withNominate)).toEqual({ kind: 'nominated', teamId: 3, playerId: 9, amount: 1 })
  })

  it('has no nominate verb in the real grammar', () => {
    expect(g.nominate).toBeNull()
    expect(decodeLine('NOMINATE 3 9 1')).toEqual({ kind: 'unknown', verb: 'NOMINATE' })
  })

  it('skips noise and flags unknown verbs', () => {
    for (const l of ['CLOCK 6 85495 1', 'PONG PING%201', 'BID_ACK 1 3112335 5', 'PROJECTED_STANDINGS {"a":1}']) expect(decodeLine(l)).toBeNull()
    expect(decodeLine('ZZZ_NOT_A_VERB 1 2')).toEqual({ kind: 'unknown', verb: 'ZZZ_NOT_A_VERB' })
  })

  it('decodes NOMINATION as the team whose turn it is to nominate', () => {
    expect(decodeLine('NOMINATION 7 30000')).toEqual({ kind: 'turn', teamId: 7 })
    expect(decodeLine(lineFor(g.turn, { team: 4 }))).toEqual({ kind: 'turn', teamId: 4 })
    expect(decodeLine('NOMINATION x 30000')).toBeNull()
  })

  it('drops a known verb with garbage fields', () => {
    expect(decodeLine(`${g.bid.verb} x y z`)).toBeNull()
  })
})

describe('decodeFrame', () => {
  it('decodes every line of a batched frame', () => {
    const data = `CLOCK 6 1 2\n${lineFor(g.bid, { team: 3, player: 9, amount: 1 })}\n`
    expect(decodeFrame(data)).toEqual([{ kind: 'bid', teamId: 3, playerId: 9, amount: 1 }])
  })
})
