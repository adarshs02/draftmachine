import { describe, expect, it } from 'vitest'
import { nominationPhase, suggestNomination } from '../../src/engine/nominate'
import type { DraftEvent } from '../../src/engine/types'
import { build, nominated, pv, settings, sold } from '../helpers'

const S2 = settings(2, { budget: 100, rosterSize: 3, lineupSlotCounts: { 12: 3 } })
const S3 = settings(3, { budget: 100, rosterSize: 3, lineupSlotCounts: { 12: 3 } })
const V = [pv('Decoy', 20, { market: 30 }), pv('Dud', 25, { market: 20 }), pv('Target', 15, { market: 15 })]
const pin: DraftEvent = { type: 'toggleTarget', playerKey: 'target' }

describe('nominationPhase', () => {
  it('early while the room still holds over 60% of its money', () => {
    expect(nominationPhase(build(S2, V, []))).toBe('early')
  })
  it('mid between 15% and 60%', () => {
    expect(nominationPhase(build(S2, V, [sold('F1', 2, 60), sold('F2', 2, 30)]))).toBe('mid')
  })
  it('dollar once no rival can bid over $2', () => {
    expect(nominationPhase(build(S2, V, [sold('F1', 2, 99)]))).toBe('dollar')
  })
})

describe('suggestNomination', () => {
  it('early: the best player the room overpays for (market > 1.1 x my value)', () => {
    expect(suggestNomination(build(S2, V, []))).toMatchObject({ phase: 'early', name: 'Decoy' })
  })

  it('early with no overpaid player: best player I am not targeting', () => {
    const s = build(S2, [pv('A', 20, { market: 10 }), pv('B', 10, { market: 5 })], [])
    expect(suggestNomination(s)).toMatchObject({ name: 'A', reason: expect.stringContaining('not targeting') })
  })

  it('mid: my target once at most one rival can outbid my ceiling', () => {
    expect(suggestNomination(build(S2, V, [pin, sold('F1', 2, 60), sold('F2', 2, 30)]))).toMatchObject({ phase: 'mid', name: 'Target' })
  })

  it('mid: a decoy while two rivals can still outbid me', () => {
    const s = build(S3, V, [pin, sold('F1', 2, 40), sold('F2', 3, 40), sold('F3', 1, 60)])
    expect(suggestNomination(s)).toMatchObject({ phase: 'mid', name: 'Decoy' })
  })

  it('dollar: my target when no rival can bid over $1', () => {
    expect(suggestNomination(build(S2, V, [pin, sold('F1', 2, 99)]))).toMatchObject({ phase: 'dollar', name: 'Target', reason: expect.stringContaining('$1') })
  })

  it('never suggests the player already on the block', () => {
    expect(suggestNomination(build(S2, V, [nominated('Decoy', 2, 1)]))!.name).not.toBe('Decoy')
  })

  it('is null without my team', () => {
    expect(suggestNomination(build(S2, V, [], null))).toBeNull()
  })
})
