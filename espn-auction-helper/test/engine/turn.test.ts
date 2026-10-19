import { describe, expect, it } from 'vitest'
import { nominationTurn } from '../../src/engine/turn'
import type { DraftEvent } from '../../src/engine/types'
import { build, nominated, pv, settings, sold } from '../helpers'

const V = [pv('Alpha', 30), pv('Bravo', 20), pv('Charlie', 10)]
const S = settings(4)
const turn = (teamId: number): DraftEvent => ({ type: 'turn', teamId })
/** Fills a team's roster with $1 players so it has no open slots. */
const fill = (teamId: number, n: number): DraftEvent[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'sold', playerKey: `filler${teamId}-${i}`, teamId, price: 1 }) as DraftEvent)

describe('nominationTurn', () => {
  it('at draft start the first team in order is on the clock and turns = my position', () => {
    expect(nominationTurn(build(S, V, [], 3))).toEqual({ onClock: 1, upNext: null, turnsUntilMe: 2 })
    expect(nominationTurn(build(S, V, [], 1)).turnsUntilMe).toBe(0)
  })

  it('while a nomination is on the block, the next team in order is up next', () => {
    expect(nominationTurn(build(S, V, [nominated('Alpha', 2, 1)], 4))).toEqual({ onClock: null, upNext: 3, turnsUntilMe: 1 })
  })

  it('after the sale the team after the nominator is on the clock', () => {
    expect(nominationTurn(build(S, V, [nominated('Alpha', 2, 1), sold('Alpha', 4, 9)], 1))).toEqual({ onClock: 3, upNext: null, turnsUntilMe: 2 })
  })

  it('wraps around the order', () => {
    const s = build(S, V, [nominated('Alpha', 4, 1), sold('Alpha', 4, 9)], 2)
    expect(nominationTurn(s)).toEqual({ onClock: 1, upNext: null, turnsUntilMe: 1 })
  })

  it('skips teams with full rosters', () => {
    const s = build(settings(4, { rosterSize: 2 }), V, [...fill(3, 2), nominated('Alpha', 2, 1), sold('Alpha', 2, 5)], 4)
    expect(nominationTurn(s)).toEqual({ onClock: 4, upNext: null, turnsUntilMe: 0 })
  })

  it('counts turns without the full teams', () => {
    const s = build(settings(4, { rosterSize: 2 }), V, [...fill(3, 2)], 4)
    expect(nominationTurn(s).turnsUntilMe).toBe(2)
  })

  it('an explicit turn overrides inference', () => {
    const s = build(S, V, [nominated('Alpha', 2, 1), sold('Alpha', 2, 5), turn(4)], 1)
    expect(nominationTurn(s)).toEqual({ onClock: 4, upNext: null, turnsUntilMe: 1 })
  })

  it('an explicit turn for a team with a full roster is ignored', () => {
    const s = build(settings(4, { rosterSize: 2 }), V, [...fill(2, 2), turn(2)], 1)
    expect(nominationTurn(s).onClock).toBe(1)
  })

  it('my roster full -> turnsUntilMe is null', () => {
    const s = build(settings(4, { rosterSize: 2 }), V, fill(1, 2), 1)
    expect(nominationTurn(s)).toEqual({ onClock: 2, upNext: null, turnsUntilMe: null })
  })

  it('unknown team of mine -> turnsUntilMe is null', () => {
    expect(nominationTurn(build(S, V, [], null))).toEqual({ onClock: 1, upNext: null, turnsUntilMe: null })
  })

  it('a last nominator outside the order falls back to the first team with room', () => {
    expect(nominationTurn(build(S, V, [nominated('Alpha', 99, 1), sold('Alpha', 2, 5)], 1)).onClock).toBe(1)
  })

  it('everyone full -> nobody on the clock', () => {
    const s = build(settings(2, { rosterSize: 1 }), V, [...fill(1, 1), ...fill(2, 1)], 1)
    expect(nominationTurn(s)).toEqual({ onClock: null, upNext: null, turnsUntilMe: null })
  })
})
