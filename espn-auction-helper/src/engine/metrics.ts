import { byValue } from '../values/tiers'
import type { PlayerValue } from '../values/types'
import {
  BARGAIN_RATIO, COLD, HOT, INFLATION_MAX, INFLATION_MIN, STAR_TIER_MAX, TEMP_MIN_SALES, TEMP_MIN_VALUE, TEMP_WINDOW, WARM,
} from './constants'
import { placeholderValue } from './reducer'
import type { DraftState, Sale } from './types'

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export function valueOf(s: DraftState, key: string): PlayerValue {
  return s.values[key] ?? placeholderValue(key)
}

export interface TeamSummary {
  id: number
  name: string
  budgetLeft: number
  open: number
  maxBid: number
  perSlot: number
  roster: Sale[]
}

export function teamSummary(s: DraftState, teamId: number): TeamSummary {
  const roster = s.sales.filter((x) => x.teamId === teamId)
  const budgetLeft = s.settings.budget - sum(roster.map((x) => x.price))
  const open = Math.max(0, s.settings.rosterSize - roster.length)
  return {
    id: teamId,
    name: s.settings.teams.find((t) => t.id === teamId)?.name ?? `Team ${teamId}`,
    budgetLeft,
    open,
    maxBid: open > 0 ? Math.max(0, budgetLeft - (open - 1)) : 0,
    perSlot: open > 0 ? budgetLeft / open : 0,
    roster,
  }
}

export const allTeams = (s: DraftState): TeamSummary[] => s.settings.teams.map((t) => teamSummary(s, t.id))

export const soldKeys = (s: DraftState): Set<string> => new Set(s.sales.map((x) => x.playerKey))

export function available(s: DraftState): PlayerValue[] {
  const sold = soldKeys(s)
  return Object.values(s.values).filter((v) => !sold.has(v.key)).sort(byValue)
}

export function inflation(s: DraftState): number {
  const teams = allTeams(s)
  const money = sum(teams.map((t) => t.budgetLeft))
  const open = sum(teams.map((t) => t.open))
  const surplus = sum(available(s).slice(0, open).map((v) => v.b - 1))
  if (surplus <= 0) return 1
  return Math.min(INFLATION_MAX, Math.max(INFLATION_MIN, (money - open) / surplus))
}

export type TempLabel = 'Reading room' | 'Hot' | 'Warm' | 'Neutral' | 'Cold'
export interface Temperature {
  T: number | null
  label: TempLabel
}

export function temperature(s: DraftState): Temperature {
  const window = s.sales.filter((x) => valueOf(s, x.playerKey).b >= TEMP_MIN_VALUE).slice(-TEMP_WINDOW)
  if (window.length < TEMP_MIN_SALES) return { T: null, label: 'Reading room' }
  const T = sum(window.map((x) => x.price)) / sum(window.map((x) => valueOf(s, x.playerKey).b))
  return { T, label: T > HOT ? 'Hot' : T > WARM ? 'Warm' : T >= COLD ? 'Neutral' : 'Cold' }
}

export function adjustedValue(s: DraftState, key: string, I = inflation(s), label: TempLabel = temperature(s).label): number {
  const v = valueOf(s, key)
  if (label === 'Hot' && v.tier <= STAR_TIER_MAX) return v.b
  return 1 + (v.b - 1) * I
}

export interface MyBudget {
  budgetLeft: number
  open: number
  reserve: number
  core: number
  perSlot: number
  safeMax: number
  hardMax: number
}

export function myBudget(s: DraftState): MyBudget | null {
  if (s.myTeamId === null) return null
  const t = teamSummary(s, s.myTeamId)
  const reserve = Math.min(s.settings.flyerReserve, t.open)
  const core = t.open - reserve
  return {
    budgetLeft: t.budgetLeft,
    open: t.open,
    reserve,
    core,
    perSlot: core > 0 ? (t.budgetLeft - reserve) / core : 0,
    safeMax: core >= 1 ? Math.max(0, t.budgetLeft - reserve - (core - 1)) : t.maxBid,
    hardMax: t.maxBid,
  }
}

/** Replays the sales, judging each against the room as it stood just before it. */
export function saleFlags(s: DraftState): Map<number, { bargain: boolean }> {
  const out = new Map<number, { bargain: boolean }>()
  let before: DraftState = { ...s, sales: [], live: null }
  for (const sale of s.sales) {
    const a = adjustedValue(before, sale.playerKey)
    out.set(sale.seq, { bargain: valueOf(s, sale.playerKey).tier <= STAR_TIER_MAX && sale.price <= BARGAIN_RATIO * a })
    before = { ...before, sales: [...before.sales, sale] }
  }
  return out
}
