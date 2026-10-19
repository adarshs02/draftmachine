import { normal, pick, type Rng } from './rng'
import type { BotKind, SimPlayer } from './types'

export const ROOMS = { cold: 0.92, neutral: 1, hot: 1.1 } as const
export const DEFAULT_BOT_MIX: BotKind[] = ['stars', 'balanced', 'value', 'balanced', 'stars', 'balanced', 'value', 'balanced', 'stars']
export const VALUE_SIGMA = 0.15
/** centres private values so the room's second-highest value, the price, lands near ESPN's average price */
export const VALUE_CENTER = 0.85
export const STAR_COUNT = 15
export const PACING_SHARE = 0.6
export const PACING_MIN_OPEN = 4
export const JUMP_CHANCE = 0.3
export const JUMP_BELOW = 0.6
export const CHEAP_MARKET = 5
export const THROWAWAY_CHANCE = 0.2
/** throwaways come from this many of the most-bought cheap players */
export const THROWAWAY_POOL = 10

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
    values.set(p.espnId, marketPrice(p) * VALUE_CENTER * noise * room * personalityFactor(kind, stars.has(p.espnId)))
  }
  return values
}

/** Bots scale their values by the room's money, like the panel's inflation, within this range. */
export const INFLATION_RANGE: readonly [number, number] = [0.5, 2]

/**
 * Money the room has above $1 per open slot, over the market value above $1 of the players still to be
 * drafted (`poolMarkets`: the top ones, one per open slot). 1 when the room's money matches the market.
 */
export function roomInflation(money: number, open: number, poolMarkets: readonly number[]): number {
  const surplus = poolMarkets.reduce((s, m) => s + Math.max(0, m - 1), 0)
  if (surplus <= 0) return 1
  return Math.min(INFLATION_RANGE[1], Math.max(INFLATION_RANGE[0], (money - open) / surplus))
}

export const BOT_INFLATION_RANGE: readonly [number, number] = [0.5, 2.5]

/**
 * One bot's multiplier on its values: the room's inflation, scaled by its spare money per open slot
 * against the room's. Rich bots pay up for what's left; bots that spent big early drop out.
 */
export function botInflation(room: number, budget: number, open: number, roomSparePerSlot: number): number {
  if (open <= 0 || roomSparePerSlot <= 0) return room
  const ratio = (budget - open) / open / roomSparePerSlot
  return Math.min(BOT_INFLATION_RANGE[1], Math.max(BOT_INFLATION_RANGE[0], room * ratio))
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

/**
 * `available` must be sorted by market price, highest first. Throwaways are among the most-bought cheap
 * players (ESPN market > 0, under $5): the nominator usually keeps them at $1, so they must be worth a slot.
 */
export function botNominate(r: Rng, available: readonly SimPlayer[]): SimPlayer {
  if (r() < THROWAWAY_CHANCE) {
    const cheap = available.filter((p) => p.market > 0 && marketPrice(p) < CHEAP_MARKET).slice(0, THROWAWAY_POOL)
    if (cheap.length) return pick(r, cheap)
  }
  return available[0]
}
