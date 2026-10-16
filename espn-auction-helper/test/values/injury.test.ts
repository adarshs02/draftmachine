import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HISTORY_PATH, type GamesHistory } from '../../src/espn/history'
import { injuryFor, withInjuries } from '../../src/values/injury'
import type { PlayerValue } from '../../src/values/types'
import { pv } from '../helpers'

const YEARS = [2024, 2025, 2026]
/** [gp, mpg] per season, oldest first; null = no games that season */
const seasons = (...s: Array<[number, number] | null>) =>
  Object.fromEntries(s.flatMap((x, i) => (x ? [[YEARS[i], { gp: x[0], mpg: x[1] }]] : [])))

describe('injuryFor', () => {
  it('calls a regular who missed 25+ games in 2 of the last 3 seasons injury prone', () => {
    expect(injuryFor(seasons([76, 33], [51, 34], [20, 33]), YEARS)).toEqual({ label: 'prone', games: [76, 51, 20] })
    expect(injuryFor(seasons([57, 30], [80, 30], [57, 30]), YEARS)?.label).toBe('prone')
    expect(injuryFor(seasons([58, 30], [80, 30], [58, 30]), YEARS)).toBeNull()
  })

  it('also calls one big miss (45+ games) before last season injury prone', () => {
    expect(injuryFor(seasons([68, 33], [37, 32], [65, 32]), YEARS)).toEqual({ label: 'prone', games: [68, 37, 65] })
    expect(injuryFor(seasons([64, 34], [18, 33], [77, 34]), YEARS)?.label).toBe('prone')
    expect(injuryFor(seasons([68, 33], [38, 32], [65, 32]), YEARS)).toBeNull()
  })

  it('ignores seasons where he was not a regular: few games there is usually role, not injury', () => {
    expect(injuryFor(seasons([13, 9], [56, 19.9], [74, 28]), YEARS)).toBeNull()
  })

  it('calls one big miss last season coming off injury', () => {
    expect(injuryFor(seasons([74, 36], [72, 36], [16, 35]), YEARS)).toEqual({ label: 'recent', games: [74, 72, 16] })
    expect(injuryFor(seasons([74, 36], [72, 36], [45, 35]), YEARS)?.label).toBe('recent')
    expect(injuryFor(seasons([74, 36], [72, 36], [46, 35]), YEARS)).toBeNull()
  })

  it('prefers injury prone over coming off injury, and shows missing seasons as null', () => {
    expect(injuryFor(seasons(null, [36, 30], [11, 26]), YEARS)).toEqual({ label: 'prone', games: [null, 36, 11] })
  })

  it('has nothing to say without history', () => {
    expect(injuryFor(undefined, YEARS)).toBeNull()
    expect(injuryFor({}, YEARS)).toBeNull()
  })
})

describe('withInjuries', () => {
  const history: GamesHistory = { 7: seasons([39, 34], [19, 30], [38, 31]) }
  const values: PlayerValue[] = [pv('Embiid', 30, { espnId: 7 }), pv('Clean', 20, { espnId: 8 }), pv('No Id', 5)]

  it('labels players by ESPN id', () => {
    expect(withInjuries(values, history).map((v) => v.injury?.label ?? null)).toEqual(['prone', null, null])
  })

  it('labels nobody without a history file', () => {
    expect(withInjuries(values, null).every((v) => v.injury === null)).toBe(true)
  })

  it.runIf(existsSync(HISTORY_PATH))('on real data: Embiid, Kawhi and Ingram prone, Tatum coming off injury, Jokic clean', () => {
    const real = JSON.parse(readFileSync(HISTORY_PATH, 'utf8')) as GamesHistory
    const ids = { 'Joel Embiid': 3059318, 'Kawhi Leonard': 6450, 'Brandon Ingram': 3913176, 'Jayson Tatum': 4065648, 'Nikola Jokic': 3112335 }
    const out = withInjuries(Object.entries(ids).map(([name, espnId]) => pv(name, 1, { espnId })), real)
    expect(out.map((v) => v.injury?.label ?? null)).toEqual(['prone', 'prone', 'prone', 'recent', null])
  })
})
