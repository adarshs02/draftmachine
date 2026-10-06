import { describe, expect, it } from 'vitest'
import type { DraftEvent } from '../../src/engine/types'
import { ceilingFor, verdict } from '../../src/engine/verdict'
import { build, nominated, pv, settings, sold } from '../helpers'

// All-bench lineup: no starting slots, so need boost is always 1.
// 4 teams x $200 chasing 3 valued players keeps inflation pinned at 1.2: Alpha a = 1 + 29 * 1.2 = 35.8.
const S = settings(4, { lineupSlotCounts: { 12: 13 } })
const V = [pv('Alpha', 30), pv('Bravo', 30, { avoid: true }), pv('Star', 70, { tier: 1 })]
const at = (events: DraftEvent[], me: number | null = 1) => build(S, V, events, me)
const bid = (teamId: number, amount: number): DraftEvent => ({ type: 'bid', teamId, amount })

describe('verdict', () => {
  it('is null with nothing on the block or without my team', () => {
    expect(verdict(at([]))).toBeNull()
    expect(verdict(at([nominated('Alpha', 2, 1)], null))).toBeNull()
  })

  it('BID up to the ceiling while the price is far under value', () => {
    const v = verdict(at([nominated('Alpha', 2, 1)]))!
    expect(v.kind).toBe('BID')
    expect(v.adjusted).toBeCloseTo(35.8, 6)
    expect(v.ceiling).toBe(35)
  })

  it('BID UP to a safe level once the gap is small', () => {
    expect(verdict(at([nominated('Alpha', 2, 1), bid(3, 30)]))).toMatchObject({ kind: 'BID_UP', pushTo: 33 })
  })

  it('PASS around value', () => {
    expect(verdict(at([nominated('Alpha', 2, 1), bid(3, 34)]))!.kind).toBe('PASS')
  })

  it('LET THEM when a rival pays over value, showing their money per slot afterwards', () => {
    const v = verdict(at([nominated('Alpha', 2, 1), bid(3, 36)]))!
    expect(v.kind).toBe('LET_THEM')
    expect(v.rivalPerSlotAfter).toBeCloseTo((200 - 36) / 12, 6)
  })

  it('a pinned target gets BID even when the gap is small', () => {
    expect(verdict(at([{ type: 'toggleTarget', playerKey: 'alpha' }, nominated('Alpha', 2, 1), bid(3, 30)]))!.kind).toBe('BID')
  })

  it('LEADING when I am the high bidder', () => {
    expect(verdict(at([nominated('Alpha', 1, 5)]))!.kind).toBe('LEADING')
  })

  it('never BIDs on an avoid player', () => {
    expect(verdict(at([nominated('Bravo', 2, 5)]))!.kind).toBe('PASS')
    expect(verdict(at([nominated('Bravo', 2, 5), bid(3, 40)]))!.kind).toBe('LET_THEM')
  })

  it('a player missing from values is priced at $1 and flagged', () => {
    const v = verdict(at([nominated('Ghost', 2, 1)]))!
    expect(v).toMatchObject({ kind: 'PASS', unvalued: true, ceiling: 1, name: 'ghost' })
  })

  it('the ceiling never exceeds my safe max', () => {
    const fillers = Array.from({ length: 10 }, (_, i) => sold(`F${i}`, 1, 18))
    expect(verdict(at([...fillers, nominated('Alpha', 2, 1)]))).toMatchObject({ kind: 'BID', ceiling: 18 })
  })

  it('the ceiling is 0, never negative, on a full roster', () => {
    const fillers = Array.from({ length: 13 }, (_, i) => sold(`F${i}`, 1, 1))
    expect(ceilingFor(at(fillers), 'alpha')).toBe(0)
  })

  it('warns about stars-and-scrubs concentration', () => {
    const two = verdict(at([sold('Star', 1, 80), nominated('Alpha', 2, 60)]))!
    expect(two.warnings.some((w) => w.startsWith('Two players'))).toBe(true)
    const one = verdict(at([nominated('Alpha', 2, 70)]))!
    expect(one.warnings.some((w) => w.startsWith('One player'))).toBe(true)
  })
})
