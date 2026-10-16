import type { EspnPlayer } from '../espn/players'
import { joshMid, type JoshRow } from './josh'
import { normalizeName } from './names'
import type { ProjectionRow } from './projections'
import { assignTiers, TIER_COUNT, tierForRank } from './tiers'
import type { PlayerValue } from './types'

export const BLEND_WEIGHT = 0.5
// Josh mostly names cheap players he likes, so raw mid/low-tier ratios run 2-3x (selection bias).
export const RATIO_MIN = 0.6
export const RATIO_MAX = 1.5

const round1 = (x: number) => Math.round(x * 10) / 10
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Converts Josh's 12-team dollars to the consensus (projected value) basis. */
export function basisFactor(pairs: Array<{ josh: number; consensus: number }>): number {
  const both = pairs.filter((p) => p.josh >= 5 && p.consensus >= 5)
  if (!both.length) return 1
  return both.reduce((s, p) => s + p.consensus, 0) / both.reduce((s, p) => s + p.josh, 0)
}

export function tierRatios(samples: Map<number, number[]>, min = RATIO_MIN, max = RATIO_MAX): Record<number, number> {
  const tiers = Array.from({ length: TIER_COUNT }, (_, i) => i + 1)
  const own = new Map<number, number>()
  for (const t of tiers) {
    const xs = samples.get(t) ?? []
    if (xs.length >= 3) own.set(t, clamp(median(xs), min, max))
  }
  const out: Record<number, number> = {}
  for (const t of tiers) {
    let ratio = own.get(t)
    for (let d = 1; ratio === undefined && d < TIER_COUNT; d++) ratio = own.get(t - d) ?? own.get(t + d)
    out[t] = ratio ?? 1
  }
  return out
}

export interface BlendResult {
  values: PlayerValue[]
  unmatchedJosh: string[]
  /** Projected players with a value but no ESPN entry: their value never reaches the draft room */
  unmatchedProjections: string[]
  basis: number
  ratios: Record<number, number>
}

/**
 * Base values: Josh's midpoint blended with the projections' dollar value (the consensus).
 * ESPN supplies only ids, slots and its own market price; its roto values and ranks are not used.
 */
export function blendValues(espn: EspnPlayer[], josh: JoshRow[], projections: ProjectionRow[], weight = BLEND_WEIGHT): BlendResult {
  const projByKey = new Map(projections.map((r) => [normalizeName(r.name), r]))
  const consensusOf = (key: string) => projByKey.get(key)?.value ?? 0
  const rankOf = (key: string) => projByKey.get(key)?.rank ?? null
  const rankOrLast = (key: string) => rankOf(key) ?? Number.MAX_SAFE_INTEGER
  const consTier = new Map(
    espn
      .map((p) => normalizeName(p.name))
      .sort((a, b) => consensusOf(b) - consensusOf(a) || rankOrLast(a) - rankOrLast(b))
      .map((key, i) => [key, tierForRank(i + 1)]),
  )
  const joshByKey = new Map(josh.map((r) => [normalizeName(r.player), r]))
  const midFor = (key: string) => {
    const r = joshByKey.get(key)
    return r ? joshMid(r) : null
  }

  const pairs = espn.flatMap((p) => {
    const key = normalizeName(p.name)
    const mid = midFor(key)
    return mid === null ? [] : [{ key, josh: mid, consensus: consensusOf(key) }]
  })
  const basis = basisFactor(pairs)
  const samples = new Map<number, number[]>()
  for (const pr of pairs) {
    if (pr.consensus <= 0) continue
    const t = consTier.get(pr.key)!
    samples.set(t, [...(samples.get(t) ?? []), (pr.josh * basis) / pr.consensus])
  }
  const ratios = tierRatios(samples)

  const values: PlayerValue[] = espn.map((p) => {
    const key = normalizeName(p.name)
    const mid = midFor(key)
    const consensus = consensusOf(key)
    const raw = mid !== null ? weight * mid * basis + (1 - weight) * consensus : consensus * ratios[consTier.get(key)!]
    return { key, espnId: p.id, name: p.name, slots: p.slots, b: Math.max(1, round1(raw)), consensus, market: p.market, josh: mid, avoid: joshByKey.get(key)?.kind === 'avoid', rank: rankOf(key), tier: 0, line: null }
  })

  const espnKeys = new Set(espn.map((p) => normalizeName(p.name)))
  const unmatchedJosh: string[] = []
  for (const r of josh) {
    const key = normalizeName(r.player)
    if (espnKeys.has(key)) continue
    unmatchedJosh.push(r.player)
    const mid = joshMid(r)
    values.push({ key, espnId: null, name: r.player, slots: [], b: Math.max(1, round1((mid ?? 1) * basis)), consensus: 0, market: 0, josh: mid, avoid: r.kind === 'avoid', rank: rankOf(key), tier: 0, line: null })
  }
  const unmatchedProjections = projections.filter((r) => r.value > 0 && !espnKeys.has(normalizeName(r.name))).map((r) => r.name)

  return { values: assignTiers(values), unmatchedJosh, unmatchedProjections, basis, ratios }
}
