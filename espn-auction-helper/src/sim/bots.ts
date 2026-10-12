import { normal, pick, type Rng } from './rng'
import type { BotKind, SimPlayer } from './types'

export const ROOMS = { cold: 0.92, neutral: 1, hot: 1.1 } as const
export const DEFAULT_BOT_MIX: BotKind[] = ['stars', 'balanced', 'value', 'balanced', 'stars', 'balanced', 'value', 'balanced', 'stars']
export const VALUE_SIGMA = 0.15
export const STAR_COUNT = 15
export const PACING_SHARE = 0.6
export const PACING_MIN_OPEN = 4
export const JUMP_CHANCE = 0.3
export const JUMP_BELOW = 0.6
export const CHEAP_MARKET = 5
export const THROWAWAY_CHANCE = 0.2

export const marketPrice = (p: SimPlayer): number => (p.market > 0 ? p.market : Math.max(1, p.consensus))

export function personalityFactor(kind: BotKind, isStar: boolean): number {
  if (kind === 'stars') return isStar ? 1.15 : 0.85
  if (kind === 'value') return 0.9
  return 1
}

/** A bot's private dollar value for every player, drawn once per draft (lognormal noise with mean 1). */
export function drawBotValues(r: Rng, kind: BotKind, players: readonly SimPlayer[], room: number): Map<number, number> {
  const stars = new Set([...players].sort((a, b) => marketPrice(b) - marketPrice(a)).slice(0, STAR_COUNT).map((p) => p.espnId))
  const values = new Map<number, number>()
  for (const p of players) {
    const noise = Math.exp(VALUE_SIGMA * normal(r) - VALUE_SIGMA ** 2 / 2)
    values.set(p.espnId, marketPrice(p) * noise * room * personalityFactor(kind, stars.has(p.espnId)))
  }
  return values
}

/** ESPN rule: keep $1 for every other open slot. */
export const maxBid = (budget: number, open: number): number => (open > 0 ? Math.max(0, budget - (open - 1)) : 0)

/** Highest price this bot will pay right now, after ESPN's limit and its own pacing. */
export function botCap(value: number, budget: number, open: number): number {
  let cap = Math.min(Math.floor(value), maxBid(budget, open))
  if (open >= PACING_MIN_OPEN) cap = Math.min(cap, Math.floor(budget * PACING_SHARE))
  return Math.max(0, cap)
}

/** The bot's next bid at this price, or null to stay out. */
export function botRaise(r: Rng, price: number, cap: number, value: number): number | null {
  if (price + 1 > cap) return null
  let next = price + 1
  if (price < JUMP_BELOW * value && r() < JUMP_CHANCE) next = price + 2 + Math.floor(r() * 4)
  return Math.min(next, cap)
}

/** `available` must be sorted by market price, highest first. */
export function botNominate(r: Rng, available: readonly SimPlayer[]): SimPlayer {
  if (r() < THROWAWAY_CHANCE) {
    const cheap = available.filter((p) => marketPrice(p) < CHEAP_MARKET)
    if (cheap.length) return pick(r, cheap)
  }
  return available[0]
}
