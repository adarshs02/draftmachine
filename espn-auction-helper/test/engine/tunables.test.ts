import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TUNABLES, resetTunables, setTunables, TUNABLES } from '../../src/engine/constants'
import { verdict } from '../../src/engine/verdict'
import { build, nominated, pv, settings } from '../helpers'

afterEach(() => resetTunables())

describe('tunables', () => {
  it('start at the validated defaults', () => {
    expect(TUNABLES).toEqual(DEFAULT_TUNABLES)
    expect(TUNABLES.HOT).toBe(1.05)
    expect(TUNABLES.BID_GAP_FRACTION).toBe(0.25)
  })

  it('setTunables changes the engine on the next call; resetTunables restores', () => {
    // All-bench lineup (no need boost); inflation pinned at 1.2 -> Alpha a = 35.8, ceiling 35.
    const s = build(settings(4, { lineupSlotCounts: { 12: 13 } }), [pv('Alpha', 30)], [nominated('Alpha', 2, 1), { type: 'bid', teamId: 3, amount: 30 }])
    expect(verdict(s)!.kind).toBe('BID_UP') // gap 5.8 < max(3, 0.25 * 35.8)
    setTunables({ BID_GAP_FRACTION: 0.1 }) // gap needed max(3, 3.58)
    expect(verdict(s)!.kind).toBe('BID')
    resetTunables()
    expect(verdict(s)!.kind).toBe('BID_UP')
  })

  it('rejects unknown names and non-numbers', () => {
    expect(() => setTunables({ NOPE: 1 } as never)).toThrow(/unknown tunable NOPE/)
    expect(() => setTunables({ HOT: Number.NaN })).toThrow(/finite/)
  })
})
