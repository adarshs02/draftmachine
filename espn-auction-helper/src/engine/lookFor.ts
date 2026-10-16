import { TUNABLES } from './constants'
import { fitFor, teamStanding } from './fit'
import { CATEGORIES, type Category } from './h2h'
import { adjustedValue, available, inflation, myBudget, temperature } from './metrics'
import { categoryProfile, valueFlag } from './profile'
import type { DraftState, Sale } from './types'

export const LOOK_FOR_COUNT = 6
/** My weekly odds in a category that count as strong, and as weak. */
const STRONG = 0.6
const WEAK = 0.4

export interface LookForRow {
  key: string
  name: string
  /** my value for him: adjusted value x category fit */
  value: number
  /** ESPN average price, 0 when unknown */
  market: number
  flag: 'value' | 'overpay' | null
  /** where he'd help my team most (his strengths before my first pick) */
  cats: Category[]
}

export interface LookFor {
  rows: LookForRow[]
  /** categories I'd usually win in a week as my roster stands; empty before my first pick */
  strong: Category[]
  weak: Category[]
}

// The ranking only changes with a sale (or values, settings, my team, tunables), not with bids.
const cache = new WeakMap<readonly Sale[], { values: DraftState['values']; settings: DraftState['settings']; me: number; tunables: string; ranked: LookForRow[]; strong: Category[]; weak: Category[] }>()

function rank(s: DraftState, safeMax: number): LookForRow[] {
  const I = inflation(s)
  const label = temperature(s).label
  return available(s)
    .filter((v) => v.b >= TUNABLES.NEED_MIN_VALUE && !v.avoid && v.market <= safeMax)
    .map((v) => {
      const fit = fitFor(s, v.key)
      const value = adjustedValue(s, v.key, I, label) * (fit?.mult ?? 1)
      const cats = fit?.helps.length ? fit.helps : (categoryProfile(s, v.key)?.strengths.slice(0, 2) ?? [])
      // Without an ESPN average there is no gap to read: rank him as fairly priced.
      const gap = value - (v.market > 0 ? v.market : value)
      return { row: { key: v.key, name: v.name, value, market: v.market, flag: valueFlag(value, v.market), cats }, gap }
    })
    .sort((a, b) => b.gap - a.gap || b.row.value - a.row.value)
    .map((x) => x.row)
}

/**
 * Players to look for: the best available for my roster by my value over what the room usually pays,
 * affordable (ESPN average within my safe max) and worth $5+, plus where my team stands by category.
 */
export function lookFor(s: DraftState, n = LOOK_FOR_COUNT): LookFor | null {
  const mb = myBudget(s)
  if (!mb || mb.open === 0 || s.myTeamId === null) return null
  const tunables = JSON.stringify(TUNABLES)
  let hit = cache.get(s.sales)
  if (!hit || hit.values !== s.values || hit.settings !== s.settings || hit.me !== s.myTeamId || hit.tunables !== tunables) {
    const standing = teamStanding(s)
    const pick = (keep: (p: number) => boolean) => (standing ? CATEGORIES.filter((c) => keep(standing[c])) : [])
    hit = { values: s.values, settings: s.settings, me: s.myTeamId, tunables, ranked: rank(s, mb.safeMax), strong: pick((p) => p >= STRONG), weak: pick((p) => p <= WEAK) }
    cache.set(s.sales, hit)
  }
  const live = s.live?.playerKey
  return { rows: hit.ranked.filter((r) => r.key !== live).slice(0, n), strong: hit.strong, weak: hit.weak }
}
