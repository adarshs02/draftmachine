import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { joshMid, parseJoshCsv } from '../../src/values/josh'

const HEADER = 'player,josh_low,josh_high,josh_kind,sold,winner,josh_take,name_confidence'
const SAMPLE = `${HEADER}
Luka Doncic,64,64,max,61,Atto Magic,bargain - best star value,high
Joel Embiid,,,avoid,16,Atto Magic,avoid,high
VJ Edgecombe,10,10,value,,Kingy,,high
`

describe('parseJoshCsv', () => {
  it('parses numbers, blanks and kinds', () => {
    const rows = parseJoshCsv(SAMPLE)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ player: 'Luka Doncic', low: 64, high: 64, kind: 'max', sold: 61, winner: 'Atto Magic', take: 'bargain - best star value', confidence: 'high' })
    expect(rows[1]).toMatchObject({ player: 'Joel Embiid', low: null, high: null, kind: 'avoid' })
    expect(rows[2]).toMatchObject({ sold: null, take: '' })
  })

  it('rejects a row with the wrong number of fields', () => {
    expect(() => parseJoshCsv(`${HEADER}\nBad,1,2\n`)).toThrow(/row 2 has 3 fields/)
  })

  it('rejects an unknown kind', () => {
    expect(() => parseJoshCsv(`${HEADER}\nX,1,2,maybe,,,,high\n`)).toThrow(/bad kind maybe/)
  })

  it('reads the real decoded file', () => {
    const rows = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))
    expect(rows).toHaveLength(115)
    expect(rows.map((r) => r.player)).toContain('Myles Turner')
  })
})

describe('joshMid', () => {
  it('is the midpoint of low and high, or null', () => {
    const [luka, embiid] = parseJoshCsv(SAMPLE)
    expect(joshMid(luka)).toBe(64)
    expect(joshMid(embiid)).toBeNull()
    expect(joshMid({ ...luka, low: 15, high: 23 })).toBe(19)
  })
})
