import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCsvRecords, parseHashtagStats, parsePlaytime, PLAYTIME_PATH, projectionsFromCsv, seasonProjections, STATS_PATH, withLines } from '../../src/values/seasonStats'
import type { PlayerValue } from '../../src/values/types'
import { pv } from '../helpers'

const HEADER = '"R#","PLAYER","ADP","POS","TEAM","GP","MPG","FG%","FT%","3PM","PTS","TREB","AST","STL","BLK","TO","TOTAL"'
const JOKIC = '"1","Nikola Jokic","1.5","C","DEN","72","35.1","0.573 (10.5/18.3) 3.91","0.816 (5.6/6.8) 0.98","1.8 0.22","28.4 2.22","12.7 3.10","10.4 3.88","1.6 1.72","0.7 0.42","3.5 -2.27","15.89"'
const DANIELS = '"2","Dyson Daniels","40.0","SG,SF","ATL","70","30.0","0.480 (6.0/12.5) 0.10","0.750 (2.0/2.7) -0.20","1.0 0.10","15.0 0.50","8.0 1.00","2.0 0.10","3.0 4.50","0.5 0.20","2.0 -0.50","3.00"'
const CSV = [HEADER, JOKIC, HEADER, DANIELS].join('\n')
const VALUES = [pv('Nikola Jokic', 70, { espnId: 3112335 }), pv('Dyson Daniels', 20, { espnId: 4869342 }), pv('No Projection', 5, { espnId: 1 })]

describe('Hashtag export', () => {
  it('reads per-game stats, skipping the repeated header rows', () => {
    const rows = parseHashtagStats(CSV)
    expect(rows.map((r) => r.key)).toEqual(['nikola jokic', 'dyson daniels'])
    expect(rows[0]).toEqual({
      key: 'nikola jokic', name: 'Nikola Jokic', gp: 72, mpg: 35.1,
      perGame: { pts: 28.4, reb: 12.7, ast: 10.4, stl: 1.6, blk: 0.7, tpm: 1.8, to: 3.5, fgm: 10.5, fga: 18.3, ftm: 5.6, fta: 6.8 },
    })
  })

  it('rejects a missing column or a percentage cell without made/attempts', () => {
    expect(() => parseHashtagStats(CSV.replaceAll('"TREB"', '"REB"'))).toThrow('projections CSV is missing columns: TREB')
    expect(() => parseHashtagStats([HEADER, JOKIC.replace('"0.573 (10.5/18.3) 3.91"', '"0.573"')].join('\n'))).toThrow('projections row 1: FG% "0.573" has no (made/attempts)')
  })

  it('parses quoted fields with commas', () => {
    expect(parseCsvRecords('"A","B"\n"x, y","2"')).toEqual([{ A: 'x, y', B: '2' }])
  })
})

describe('season projections', () => {
  it('season totals = per game x games, by ESPN id', () => {
    const proj = seasonProjections(parseHashtagStats(CSV), new Map(), VALUES)
    expect(proj(3112335)!.pts).toBeCloseTo(28.4 * 72, 6)
    expect(proj(3112335)!.fga).toBeCloseTo(18.3 * 72, 6)
    expect(proj(4869342)!.stl).toBeCloseTo(3.0 * 70, 6)
    expect(proj(1)).toBeNull()
    expect(proj(999)).toBeNull()
  })

  it('games and minutes edited in the sheet win: stats scale with minutes, percentages stay', () => {
    const playtime = parsePlaytime('"R#","PLAYER","POS","TEAM","GP","MPG","TOTAL","VALUED AT"\n"1","Nikola Jokic","C","DEN","36","17.55","15.89","$74.8"')
    expect(playtime.get('nikola jokic')).toEqual({ gp: 36, mpg: 17.55 })
    const proj = seasonProjections(parseHashtagStats(CSV), playtime, VALUES)
    expect(proj(3112335)!.pts).toBeCloseTo(28.4 * 36 * 0.5, 6)
    expect(proj(3112335)!.fgm / proj(3112335)!.fga).toBeCloseTo(10.5 / 18.3, 9)
    expect(proj(4869342)!.pts).toBeCloseTo(15.0 * 70, 6)
  })

  it('no stats file: no projections', () => {
    expect(projectionsFromCsv(null, null, VALUES)).toBeNull()
  })

  it('the committed export covers the draftable pool', () => {
    const values = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
    const stats = parseHashtagStats(readFileSync(STATS_PATH, 'utf8'))
    expect(stats).toHaveLength(200)
    expect(stats[0]).toMatchObject({ name: 'Nikola Jokic', perGame: { pts: 28.4 } })
    const playtime = existsSync(PLAYTIME_PATH) ? readFileSync(PLAYTIME_PATH, 'utf8') : null
    const proj = projectionsFromCsv(readFileSync(STATS_PATH, 'utf8'), playtime, values)!
    const covered = values.filter((v) => v.espnId !== null && proj(v.espnId) !== null)
    expect(covered.length).toBeGreaterThanOrEqual(190)
  })
})

describe('withLines', () => {
  it("adds each player's season line, rounded to 0.1, keyed by name; null without a stats row", () => {
    const out = withLines(VALUES, CSV, null)
    expect(out[0].line).toMatchObject({ pts: Math.round(28.4 * 72 * 10) / 10, fga: Math.round(18.3 * 72 * 10) / 10 })
    expect(out[1].line!.stl).toBeCloseTo(3.0 * 70, 6)
    expect(out[2].line).toBeNull()
    expect(out.map((v) => v.b)).toEqual(VALUES.map((v) => v.b))
  })

  it('takes games and minutes from the sheet like the simulator does', () => {
    const sheet = '"PLAYER","GP","MPG"\n"Nikola Jokic","60","35.1"'
    expect(withLines(VALUES, CSV, sheet)[0].line!.pts).toBeCloseTo(Math.round(28.4 * 60 * 10) / 10, 6)
  })

  it('gives every player a null line without the stats file', () => {
    expect(withLines(VALUES, null, null).every((v) => v.line === null)).toBe(true)
  })

  it('matches seasonProjections for players with an ESPN id', () => {
    const proj = seasonProjections(parseHashtagStats(CSV), new Map(), VALUES)
    expect(withLines(VALUES, CSV, null)[0].line!.reb).toBeCloseTo(proj(3112335)!.reb, 1)
  })
})
