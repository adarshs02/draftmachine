import { API_BASE, type FetchLike } from './common'

/** ESPN season ids of the last three finished seasons, oldest first (2026 = 2025-26). */
export const HISTORY_SEASONS = [2024, 2025, 2026] as const
export const HISTORY_PATH = 'data/espn-games-history.json'

export interface SeasonGames {
  gp: number
  mpg: number
}

/** ESPN player id -> season id -> games played and minutes per game, for seasons he played */
export type GamesHistory = Record<string, Record<string, SeasonGames>>

const GP = '42'
const MINUTES = '40'

export const historyUrl = (season: number) => `${API_BASE}/${season}/segments/0/leaguedefaults/1?view=kona_player_info`
// Actual stats (source 0) for the whole season (split 0); ESPN needs a sort alongside a limit.
export const HISTORY_FILTER = JSON.stringify({
  players: {
    limit: 1500,
    sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'STANDARD' },
    filterStatsForSourceIds: { value: [0] },
    filterStatsForSplitTypeIds: { value: [0] },
  },
})

interface RawStat {
  seasonId?: number
  statSourceId?: number
  statSplitTypeId?: number
  stats?: Record<string, number>
}
interface RawPlayer {
  id?: number
  player?: { id?: number; stats?: RawStat[] }
}

/** One season's games played and minutes per game, by ESPN id; players without a game are left out. */
export function trimSeasonGames(raw: unknown, season: number): Record<string, SeasonGames> {
  const out: Record<string, SeasonGames> = {}
  for (const p of (raw as { players?: RawPlayer[] } | null)?.players ?? []) {
    const id = p.id ?? p.player?.id
    const st = p.player?.stats?.find((x) => x.seasonId === season && x.statSourceId === 0 && x.statSplitTypeId === 0)
    const gp = st?.stats?.[GP]
    if (typeof id !== 'number' || typeof gp !== 'number' || gp <= 0) continue
    out[id] = { gp, mpg: Math.round(((st?.stats?.[MINUTES] ?? 0) / gp) * 10) / 10 }
  }
  return out
}

export async function fetchHistory(fetchFn: FetchLike = fetch, seasons: readonly number[] = HISTORY_SEASONS): Promise<GamesHistory> {
  const out: GamesHistory = {}
  for (const season of seasons) {
    const res = await fetchFn(historyUrl(season), { headers: { Accept: 'application/json', 'X-Fantasy-Filter': HISTORY_FILTER } })
    if (!res.ok) throw new Error(`ESPN ${season} games HTTP ${res.status}`)
    for (const [id, games] of Object.entries(trimSeasonGames(await res.json(), season))) (out[id] ??= {})[season] = games
  }
  return out
}
