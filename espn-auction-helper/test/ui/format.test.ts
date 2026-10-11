import { describe, expect, it } from 'vitest'
import type { Verdict } from '../../src/engine/verdict'
import { money, verdictText } from '../../src/ui/format'

const base: Verdict = { kind: 'BID', playerKey: 'a', name: 'A', price: 30, leaderId: 2, adjusted: 35.8, ceiling: 35, boost: 1, pushTo: null, rivalPerSlotAfter: null, warnings: [], unvalued: false }

describe('format', () => {
  it('rounds money', () => {
    expect(money(35.8)).toBe('$36')
  })

  it.each([
    [{ kind: 'BID' }, 'BID up to $35'],
    [{ kind: 'BID_UP', pushTo: 33 }, 'BID UP to $33'],
    [{ kind: 'LET_THEM', price: 40 }, 'LET THEM ($40 > value $36)'],
    [{ kind: 'PASS' }, 'PASS'],
    [{ kind: 'LEADING' }, 'You lead at $30 (ceiling $35)'],
  ] as const)('%o -> %s', (patch, text) => {
    expect(verdictText({ ...base, ...patch })).toBe(text)
  })
})
