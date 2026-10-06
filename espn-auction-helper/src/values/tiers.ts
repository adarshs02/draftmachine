import type { PlayerValue } from './types'

export const TIER_BOUNDS = [12, 36, 72, 120]
export const TIER_COUNT = TIER_BOUNDS.length + 1

export function tierForRank(rank: number): number {
  const i = TIER_BOUNDS.findIndex((bound) => rank <= bound)
  return i === -1 ? TIER_COUNT : i + 1
}

export function assignTiers(values: PlayerValue[]): PlayerValue[] {
  return [...values].sort((a, b) => b.b - a.b).map((v, i) => ({ ...v, tier: tierForRank(i + 1) }))
}
