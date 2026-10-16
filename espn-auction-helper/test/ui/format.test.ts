import { describe, expect, it } from 'vitest'
import type { Verdict } from '../../src/engine/verdict'
import { fitText, flagText, injuryTag, injuryText, money, profileText, standingText, verdictText } from '../../src/ui/format'

const base: Verdict = { kind: 'BID', playerKey: 'a', name: 'A', price: 30, leaderId: 2, adjusted: 35.8, ceiling: 35, boost: 1, pushTo: null, rivalPerSlotAfter: null, warnings: [], unvalued: false, saveSlot: null, fit: null, profile: null }

describe('format', () => {
  it('rounds money', () => {
    expect(money(35.8)).toBe('$36')
  })

  it.each([
    [{ kind: 'BID' }, 'BID up to $35'],
    [{ kind: 'BID_UP', pushTo: 33 }, 'BID UP to $33'],
    [{ kind: 'LET_THEM', price: 40 }, 'LET THEM ($40 > value $36)'],
    [{ kind: 'PASS' }, 'PASS'],
    [{ kind: 'PASS', saveSlot: 18 }, 'PASS: save the slot'],
    [{ kind: 'LEADING' }, 'You lead at $30 (ceiling $35)'],
  ] as const)('%o -> %s', (patch, text) => {
    expect(verdictText({ ...base, ...patch })).toBe(text)
  })
})

describe('fitText', () => {
  it('names the categories behind the fit', () => {
    expect(fitText({ mult: 1.15, cats: ['ast', 'tpm'], helps: [] })).toBe('fits your team ×1.15: AST, 3PM')
    expect(fitText({ mult: 0.85, cats: ['blk', 'ftPct'], helps: [] })).toBe('fits your team ×0.85: less useful in BLK, FT%')
    expect(fitText({ mult: 1.05, cats: [], helps: [] })).toBe('fits your team ×1.05')
  })
})

describe('profile, flag and standing text', () => {
  it('says where the value comes from and what he costs you', () => {
    expect(profileText({ strengths: ['blk', 'reb', 'fgPct'], costs: ['ftPct', 'to'] })).toBe('Value from: BLK, REB, FG% · costs you: FT%, TO')
    expect(profileText({ strengths: ['ast'], costs: [] })).toBe('Value from: AST')
    expect(profileText({ strengths: [], costs: ['ftPct'] })).toBe('Costs you: FT%')
    expect(profileText({ strengths: [], costs: [] })).toBeNull()
  })

  it('flags a value play or an overpay against the ESPN average', () => {
    expect(flagText('value', 19)).toBe('⭐ value play: room usually pays $19')
    expect(flagText('overpay', 34)).toBe('room usually overpays: ~$34')
    expect(flagText(null, 20)).toBeNull()
  })

  it('sums up where my team stands', () => {
    expect(standingText(['reb', 'blk'], ['ast', 'ftPct'])).toBe('Your team: strong REB, BLK · weak AST, FT%')
    expect(standingText(['blk'], [])).toBe('Your team: strong BLK')
    expect(standingText([], [])).toBeNull()
  })
})

describe('injury', () => {
  it('spells out the games behind the label', () => {
    expect(injuryText({ label: 'prone', games: [76, 51, 20] })).toBe('Injury prone: 76/51/20 games, last 3 seasons')
    expect(injuryText({ label: 'prone', games: [null, 36, 11] })).toBe('Injury prone: –/36/11 games, last 3 seasons')
    expect(injuryText({ label: 'recent', games: [74, 72, 16] })).toBe('Coming off injury: 16 games last season')
  })

  it('tags lists INJ or RET', () => {
    expect(injuryTag({ label: 'prone', games: [] })).toBe('INJ')
    expect(injuryTag({ label: 'recent', games: [] })).toBe('RET')
  })
})
