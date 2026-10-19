import { describe, expect, it } from 'vitest'
import type { FetchLike } from '../../src/espn/common'
import { fetchHistory, HISTORY_FILTER, historyUrl, trimSeasonGames } from '../../src/espn/history'

const stat = (seasonId: number, gp: number | undefined, min: number, statSourceId = 0, statSplitTypeId = 0) =>
  ({ seasonId, statSourceId, statSplitTypeId, stats: gp === undefined ? { '40': min } : { '42': gp, '40': min } })

const season = (year: number) => ({
  players: [
    // the actual season total for this year, next to a projection and a different season
    { id: 1, player: { stats: [stat(year, 65, 2265), stat(year, 70, 2400, 1), stat(year - 1, 79, 2700)] } },
    { id: 2, player: { stats: [stat(year, 0, 0)] } },
    { id: 3, player: { stats: [stat(year, undefined, 300)] } },
    { player: { id: 4, stats: [stat(year, 20, 625)] } },
    { id: 5, player: {} },
  ],
})

describe('trimSeasonGames', () => {
  it("keeps games played and minutes per game from the season's actual totals", () => {
    expect(trimSeasonGames(season(2026), 2026)).toEqual({ 1: { gp: 65, mpg: 34.8 }, 4: { gp: 20, mpg: 31.3 } })
  })

  it('returns {} for junk', () => {
    expect(trimSeasonGames(null, 2026)).toEqual({})
    expect(trimSeasonGames({}, 2026)).toEqual({})
  })
})

describe('fetchHistory', () => {
  it('asks each season for actual season totals and merges them by player', async () => {
    const calls: Array<{ url: string; filter: string }> = []
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, filter: (init?.headers as Record<string, string>)['X-Fantasy-Filter'] })
      const year = Number(/seasons\/(\d+)\//.exec(url)![1])
      return { ok: true, status: 200, json: async () => season(year) }
    }
    const history = await fetchHistory(fake, [2025, 2026])
    expect(calls.map((c) => c.url)).toEqual([historyUrl(2025), historyUrl(2026)])
    expect(calls[0].filter).toBe(HISTORY_FILTER)
    expect(JSON.parse(HISTORY_FILTER).players).toMatchObject({ filterStatsForSourceIds: { value: [0] }, filterStatsForSplitTypeIds: { value: [0] } })
    expect(history['1']).toEqual({ 2025: { gp: 65, mpg: 34.8 }, 2026: { gp: 65, mpg: 34.8 } })
    expect(history['2']).toBeUndefined()
  })

  it('throws on HTTP errors', async () => {
    const fake: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchHistory(fake, [2026])).rejects.toThrow(/2026.*503/)
  })
})
