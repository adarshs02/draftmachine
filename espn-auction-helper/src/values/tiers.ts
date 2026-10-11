import type { PlayerValue } from './types'

export const TIER_BOUNDS = [12, 36, 72, 120]
export const TIER_COUNT = TIER_BOUNDS.length + 1

export function tierForRank(rank: number): number {
  const i = TIER_BOUNDS.findIndex((bound) => rank <= bound)
  return i === -1 ? TIER_COUNT : i + 1
}

const rankOrLast = (v: PlayerValue) => v.rank ?? Number.MAX_SAFE_INTEGER

/** Highest b first; ties (mostly the $1 crowd) by projection rank, unranked last. */
export const byValue = (a: PlayerValue, b: PlayerValue): number => b.b - a.b || rankOrLast(a) - rankOrLast(b)

export function assignTiers(values: PlayerValue[]): PlayerValue[] {
  return [...values].sort(byValue).map((v, i) => ({ ...v, tier: tierForRank(i + 1) }))
}
