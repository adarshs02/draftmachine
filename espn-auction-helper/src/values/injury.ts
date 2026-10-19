import { HISTORY_SEASONS, type GamesHistory, type SeasonGames } from '../espn/history'
import type { Injury, PlayerValue } from './types'

/** A season counts only when he was a regular: few games at low minutes is usually role, not injury. */
export const REGULAR_MPG = 20
/** Missed 25+ of 82 games, in this many of the last three seasons: injury prone. */
export const PRONE_MAX_GP = 57
export const PRONE_SEASONS = 2
/** Or missed 45+ games in one of the seasons before last (Kawhi 68/37/65, Ingram 64/18/77): injury prone. */
export const BIG_MISS_MAX_GP = 37
/** Missed 37+ games last season (and not injury prone): returning from major injury. */
export const RECENT_MAX_GP = 45

export function injuryFor(seasons: Record<string, SeasonGames> | undefined, years: readonly number[] = HISTORY_SEASONS): Injury | null {
  if (!seasons) return null
  const games = years.map((y) => seasons[y]?.gp ?? null)
  const missed = (y: number, maxGp: number) => {
    const s = seasons[y]
    return !!s && s.mpg >= REGULAR_MPG && s.gp <= maxGp
  }
  const repeated = years.filter((y) => missed(y, PRONE_MAX_GP)).length >= PRONE_SEASONS
  const bigMissEarlier = years.slice(0, -1).some((y) => missed(y, BIG_MISS_MAX_GP))
  if (repeated || bigMissEarlier) return { label: 'prone', games }
  if (missed(years[years.length - 1], RECENT_MAX_GP)) return { label: 'recent', games }
  return null
}

/** Labels each player from ESPN's games history (by ESPN id); without the file nobody is labelled. */
export function withInjuries(values: readonly PlayerValue[], history: GamesHistory | null): PlayerValue[] {
  return values.map((v) => ({ ...v, injury: history && v.espnId !== null ? injuryFor(history[v.espnId]) : null }))
}
