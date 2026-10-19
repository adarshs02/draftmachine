import { fitFor } from './fit'
import { CATEGORIES, type Category } from './h2h'
import { adjustedValue, available, inflation, temperature, valueOf } from './metrics'
import { categoryZ, STRENGTH_Z, valueFlag } from './profile'
import type { DraftState } from './types'

export const SIMILAR_COUNT = 5
/** A similar player is within this share of his value, and never held closer than BAND_MIN dollars. */
const BAND_SHARE = 0.5
const BAND_MIN = 3
const MAX_CATS = 3

export interface SimilarRow {
  key: string
  name: string
  /** my value for him: adjusted value x category fit, as in Look for */
  value: number
  /** ESPN average price, 0 when unknown */
  market: number
  flag: 'value' | 'overpay' | null
  /** categories both he and the player on the block are strong in */
  cats: Category[]
}

export interface Similar {
  rows: SimilarRow[]
}

const distance = (a: Record<Category, number>, b: Record<Category, number>) => Math.hypot(...CATEGORIES.map((c) => a[c] - b[c]))

/**
 * Who else gives what the player on the block gives: available players near his value, closest
 * category profile first. Without a stat line for him, the nearest values.
 */
export function similar(s: DraftState, n = SIMILAR_COUNT): Similar | null {
  const live = s.live?.playerKey
  if (!live) return null
  const him = valueOf(s, live)
  const hisZ = categoryZ(s, live)
  const band = Math.max(BAND_MIN, BAND_SHARE * him.b)
  const ranked = available(s)
    .filter((v) => v.key !== live && !v.avoid && Math.abs(v.b - him.b) <= band)
    .map((v) => {
      const z = hisZ && categoryZ(s, v.key)
      return { v, z, d: hisZ ? (z ? distance(hisZ, z) : Infinity) : Math.abs(v.b - him.b) }
    })
    .filter((x) => x.d < Infinity)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
  const I = inflation(s)
  const label = temperature(s).label
  return {
    rows: ranked.map(({ v, z }) => {
      const value = adjustedValue(s, v.key, I, label) * (fitFor(s, v.key)?.mult ?? 1)
      const cats = hisZ && z ? CATEGORIES.filter((c) => hisZ[c] >= STRENGTH_Z && z[c] >= STRENGTH_Z).slice(0, MAX_CATS) : []
      return { key: v.key, name: v.name, value, market: v.market, flag: valueFlag(value, v.market), cats }
    }),
  }
}
