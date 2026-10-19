import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createAssembler } from '../../src/capture/assembler'
import { decodeFrame } from '../../src/capture/decoder'
import type { Recording } from '../../src/capture/recording'
import { initialState, reduce } from '../../src/engine/reducer'
import type { DraftEvent } from '../../src/engine/types'
import { settings } from '../helpers'

const rec = JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording
const notes = JSON.parse(readFileSync('test/fixtures/espn-auction-notes.json', 'utf8'))
const incoming = rec.frames.filter((f) => f.dir === 'in')
const raws = incoming.flatMap((f) => decodeFrame(f.data))
// The assembler reads the block from the draft state, as the controller does.
let state = initialState(settings(10), [])
const assembler = createAssembler((id) => `espn:${id}`, () => state.live)
const events: DraftEvent[] = raws.flatMap((r) =>
  assembler.push(r).map((ev) => {
    state = reduce(state, ev)
    return ev
  }),
)

describe('recorded ESPN salary-cap draft', () => {
  it('every incoming verb is either decoded or known noise', () => {
    expect([...new Set(raws.filter((r) => r.kind === 'unknown').map((r) => (r as { verb: string }).verb))]).toEqual([])
  })

  it('the first nomination, bid and sale match what was on screen', () => {
    expect(events.find((e) => e.type === 'nominated')).toEqual({ type: 'nominated', playerKey: `espn:${notes.firstNomination.espnId}`, teamId: notes.firstNomination.teamId, amount: notes.firstNomination.amount })
    expect(events.find((e) => e.type === 'bid')).toEqual({ type: 'bid', teamId: notes.firstBid.teamId, amount: notes.firstBid.amount })
    expect(events.find((e) => e.type === 'sold')).toEqual({ type: 'sold', playerKey: `espn:${notes.firstSale.espnId}`, teamId: notes.firstSale.teamId, price: notes.firstSale.price })
  })

  it('the decoded sales, in order, match the Draft Recap answer key', () => {
    const got = events.flatMap((e) => (e.type === 'sold' ? [[Number(e.playerKey.replace('espn:', '')), e.teamId, e.price]] : []))
    expect(got).toEqual(notes.sales)
  })
})
