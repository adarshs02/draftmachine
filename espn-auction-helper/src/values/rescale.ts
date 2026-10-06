import { tierForRank } from './tiers'
import type { PlayerValue } from './types'

export interface LeagueShape {
  teams: number
  budget: number
  rosterSize: number
}

/**
 * Re-prices values for a league: the teams x rosterSize best players share the
 * money above $1 each, in proportion to their surplus over the first player
 * left out (the replacement level); everyone else is a $1 player.
 */
export function rescaleToLeague(values: PlayerValue[], shape: LeagueShape): PlayerValue[] {
  const sorted = [...values].sort((a, b) => b.b - a.b)
  const rostered = shape.teams * shape.rosterSize
  const pool = shape.teams * shape.budget - rostered
  const replacement = sorted.length > rostered ? sorted[rostered].b - 1 : 0
  const surplus = sorted.map((v, i) => (i < rostered ? Math.max(0, v.b - 1 - replacement) : 0))
  const total = surplus.reduce((s, x) => s + x, 0)
  return sorted.map((v, i) => ({
    ...v,
    b: total > 0 && i < rostered ? 1 + (surplus[i] * pool) / total : 1,
    tier: tierForRank(i + 1),
  }))
}
