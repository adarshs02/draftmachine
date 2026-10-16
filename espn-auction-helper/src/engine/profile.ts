import { byValue } from '../values/tiers'
import { CATEGORIES, type Category, type SeasonLine } from './h2h'
import { valueOf } from './metrics'
import type { DraftState } from './types'

/** Where a player's value comes from: categories well above the draftable pool, and the ones he drags down. */
export interface CategoryProfile {
  strengths: Category[]
  costs: Category[]
}

/** z-score against the draftable pool that counts as a strength, and as a cost. */
const STRENGTH_Z = 0.75
const COST_Z = -0.5
const MAX_STRENGTHS = 3
const MAX_COSTS = 2

/** The panel flags a value play (or an overpay) when the gap is at least this many dollars and this share. */
export const VALUE_FLAG_MIN = 3
export const VALUE_FLAG_SHARE = 0.15

interface PoolStats {
  /** a category's contribution, higher is better: turnovers negated, percentages as makes above the pool's rate */
  score: Record<Category, (l: SeasonLine) => number>
  mean: Record<Category, number>
  sd: Record<Category, number>
}

const cache = new WeakMap<DraftState['values'], { settings: DraftState['settings']; stats: PoolStats | null }>()

/** Category means and spreads over the players expected to be drafted: the best teams x roster size with a stat line. */
function poolStats(s: DraftState): PoolStats | null {
  const hit = cache.get(s.values)
  if (hit && hit.settings === s.settings) return hit.stats
  const pool = Object.values(s.values)
    .filter((v) => v.line !== null)
    .sort(byValue)
    .slice(0, s.settings.teams.length * s.settings.rosterSize)
    .map((v) => v.line!)
  let stats: PoolStats | null = null
  if (pool.length >= 2) {
    const total = (f: (l: SeasonLine) => number) => pool.reduce((sum, l) => sum + f(l), 0)
    const fg = total((l) => l.fgm) / Math.max(1, total((l) => l.fga))
    const ft = total((l) => l.ftm) / Math.max(1, total((l) => l.fta))
    const score: PoolStats['score'] = {
      pts: (l) => l.pts,
      reb: (l) => l.reb,
      ast: (l) => l.ast,
      stl: (l) => l.stl,
      blk: (l) => l.blk,
      tpm: (l) => l.tpm,
      fgPct: (l) => l.fgm - fg * l.fga,
      ftPct: (l) => l.ftm - ft * l.fta,
      to: (l) => -l.to,
    }
    const mean = {} as Record<Category, number>
    const sd = {} as Record<Category, number>
    for (const c of CATEGORIES) {
      mean[c] = total(score[c]) / pool.length
      sd[c] = Math.sqrt(total((l) => (score[c](l) - mean[c]) ** 2) / (pool.length - 1))
    }
    stats = { score, mean, sd }
  }
  cache.set(s.values, { settings: s.settings, stats })
  return stats
}

/** Up to 3 strengths and 2 costs against the draftable pool; null without a stat line. */
export function categoryProfile(s: DraftState, key: string): CategoryProfile | null {
  const line = valueOf(s, key).line
  const stats = line && poolStats(s)
  if (!line || !stats) return null
  const z = CATEGORIES.map((c) => ({ c, z: stats.sd[c] > 0 ? (stats.score[c](line) - stats.mean[c]) / stats.sd[c] : 0 }))
  return {
    strengths: z.filter((x) => x.z >= STRENGTH_Z).sort((a, b) => b.z - a.z).slice(0, MAX_STRENGTHS).map((x) => x.c),
    costs: z.filter((x) => x.z <= COST_Z).sort((a, b) => a.z - b.z).slice(0, MAX_COSTS).map((x) => x.c),
  }
}

/** 'value' when my value beats what the room usually pays (ESPN average) by the flag gap, 'overpay' the other way. */
export function valueFlag(value: number, market: number): 'value' | 'overpay' | null {
  if (market <= 0) return null
  if (value - market >= Math.max(VALUE_FLAG_MIN, VALUE_FLAG_SHARE * market)) return 'value'
  if (market - value >= Math.max(VALUE_FLAG_MIN, VALUE_FLAG_SHARE * value)) return 'overpay'
  return null
}
