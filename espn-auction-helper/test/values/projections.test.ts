import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProjectionsCsv } from '../../src/values/projections'

const HEADER = '"R#","PLAYER","POS","TEAM","GP","MPG","TOTAL","VALUED AT","Y! AVG","ESPN AVG","BLEND AVG"'

describe('parseProjectionsCsv', () => {
  it('reads rank, name, positions, games, minutes, z total and dollar value; skips repeated headers', () => {
    const text = [
      HEADER,
      '"1","Nikola Jokic","C","DEN","72","35.1","15.89","$74.8","$80.1","$83.2","$81.7"',
      HEADER,
      '"197","Mikel Brown Jr.","PG,SG","BKN","69","28.8","-1.85","$0.0","$0.0","$","$0.0"',
      '',
    ].join('\r\n')
    expect(parseProjectionsCsv(text)).toEqual([
      { rank: 1, name: 'Nikola Jokic', pos: 'C', team: 'DEN', gp: 72, mpg: 35.1, z: 15.89, value: 74.8 },
      { rank: 197, name: 'Mikel Brown Jr.', pos: 'PG,SG', team: 'BKN', gp: 69, mpg: 28.8, z: -1.85, value: 0 },
    ])
  })

  it('handles a doubled quote inside a field', () => {
    const rows = parseProjectionsCsv(`${HEADER}\n"5","Day""Ron Sharpe","C","BKN","70","20.0","1.00","$7.9","$","$","$"`)
    expect(rows[0].name).toBe('Day"Ron Sharpe')
  })

  it('rejects an unexpected header or a short row', () => {
    expect(() => parseProjectionsCsv('player,value\nX,1')).toThrow(/header/)
    expect(() => parseProjectionsCsv(`${HEADER}\n"1","Short Row","C"`)).toThrow(/row 2/)
  })

  it('on real data: 200 players, value is a straight line in z (floored at $0)', () => {
    const rows = parseProjectionsCsv(readFileSync('data/auction-values.csv', 'utf8'))
    expect(rows.length).toBeGreaterThanOrEqual(150)
    expect(rows[0].name).toBe('Nikola Jokic')
    for (const r of rows) expect(r.value).toBeCloseTo(Math.max(0, 4.489 * r.z + 3.46), 0)
  })
})
