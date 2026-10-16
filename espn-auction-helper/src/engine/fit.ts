import { TUNABLES } from './constants'
import { CATEGORIES, categoryWinChance, LINE_FIELDS, weeklyFromLines, type Category, type SeasonLine, type WeeklyLine } from './h2h'
import { adjustedValue, allTeams, available, inflation, teamSummary, temperature, valueOf, type TempLabel } from './metrics'
import { byValue } from '../values/tiers'
import type { DraftState, Sale } from './types'

export interface Fit {
  /** multiplier on the player's value for my roster */
  mult: number
  /** categories behind it: where he helps me most (mult > 1) or least (mult < 1) */
  cats: Category[]
}

/** Gains (expected weekly categories won) this small are noise. */
const MIN_GAIN = 0.001
/** Smallest per-category part the panel names. */
const MIN_PART = 0.005
/** Replacement level: the average of this many players just below the filler pool. */
const REPLACEMENT_COUNT = 10
/** The typical ratio averages over at least this many of the best players left, so a late, tiny pool can't void it. */
const TYPICAL_MIN = 20

interface FitContext {
  rivals: WeeklyLine[]
  /** my roster's lines, a filler in every open slot but the last, which holds a replacement player (`gain` swaps the rated player in) */
  myLines: SeasonLine[]
  myBase: number[]
  /** my roster with my picks swapped for average rostered players: what a value that ignores my roster's shape assumes */
  genericLines: SeasonLine[]
  genericBase: number[]
  /** my gain over the generic gain, summed over the best players left above replacement: the typical remaining player's ratio */
  typical: number
}

const total = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

function meanLine(lines: readonly SeasonLine[]): SeasonLine {
  return Object.fromEntries(LINE_FIELDS.map((f) => [f, total(lines.map((l) => l[f])) / lines.length])) as unknown as SeasonLine
}

/** Chance to win each category in a week, averaged over the rivals. */
function perCategory(week: WeeklyLine, rivals: readonly WeeklyLine[]): number[] {
  return CATEGORIES.map((c) => total(rivals.map((r) => categoryWinChance(week, r, c))) / rivals.length)
}

/** A team's lines: rostered players (a filler for one without stats), then a filler per open slot. */
function teamLines(s: DraftState, teamId: number, filler: SeasonLine): SeasonLine[] {
  const t = teamSummary(s, teamId)
  return [...t.roster.map((x) => valueOf(s, x.playerKey).line ?? filler), ...Array<SeasonLine>(t.open).fill(filler)]
}

/** Per-category gain from `line` in the last slot over the replacement player there (`base`). */
function gain(lines: readonly SeasonLine[], base: readonly number[], line: SeasonLine, rivals: readonly WeeklyLine[]): number[] {
  return perCategory(weeklyFromLines([...lines.slice(0, -1), line]), rivals).map((x, i) => x - base[i])
}

function buildContext(s: DraftState, me: number): FitContext | null {
  const teams = allTeams(s)
  const rivalIds = teams.filter((t) => t.id !== me).map((t) => t.id)
  if (!rivalIds.length || teamSummary(s, me).open === 0) return null
  const lined = available(s).filter((v) => v.line !== null)
  const open = total(teams.map((t) => t.open))
  const pool = lined.slice(0, open)
  if (!pool.length) return null
  const below = lined.slice(open, open + REPLACEMENT_COUNT)
  const replacement = meanLine((below.length ? below : pool.slice(-REPLACEMENT_COUNT)).map((v) => v.line!))
  const filler = meanLine(pool.map((v) => v.line!))
  const rostered = Object.values(s.values)
    .filter((v) => v.line !== null)
    .sort(byValue)
    .slice(0, teams.length * s.settings.rosterSize)
  const average = meanLine(rostered.map((v) => v.line!))
  const rivals = rivalIds.map((id) => weeklyFromLines(teamLines(s, id, filler)))
  // Gains are measured over a replacement player in one slot, as auction values are; against the
  // pool's average they would sum to about 0 over the pool.
  const mineNow = teamLines(s, me, filler)
  const picks = teamSummary(s, me).roster.length
  const myLines = [...mineNow.slice(0, -1), replacement]
  const genericLines = [...Array<SeasonLine>(picks).fill(average), ...mineNow.slice(picks, -1), replacement]
  const myBase = perCategory(weeklyFromLines(myLines), rivals)
  const genericBase = perCategory(weeklyFromLines(genericLines), rivals)
  let mine = 0
  let generic = 0
  for (const v of lined.slice(0, Math.max(open, TYPICAL_MIN))) {
    const g = total(gain(genericLines, genericBase, v.line!, rivals))
    if (g < MIN_GAIN) continue
    generic += g
    mine += total(gain(myLines, myBase, v.line!, rivals))
  }
  if (mine < MIN_GAIN || generic < MIN_GAIN) return null
  return { rivals, myLines, myBase, genericLines, genericBase, typical: mine / generic }
}

// One context per sales list: bids don't change it; a sale, undo or fix makes a new list.
const cache = new WeakMap<readonly Sale[], { values: DraftState['values']; settings: DraftState['settings']; me: number; ctx: FitContext | null }>()

function context(s: DraftState, me: number): FitContext | null {
  const hit = cache.get(s.sales)
  if (hit && hit.values === s.values && hit.settings === s.settings && hit.me === me) return hit.ctx
  const ctx = buildContext(s, me)
  cache.set(s.sales, { values: s.values, settings: s.settings, me, ctx })
  return ctx
}

/**
 * How much more (or less) a player helps my roster than the typical remaining player, against my
 * rivals as they stand: (my gain / generic gain) / typical, clamped, ^FIT_WEIGHT. Null when it doesn't apply.
 */
export function fitFor(s: DraftState, key: string): Fit | null {
  if (TUNABLES.FIT_WEIGHT === 0 || s.myTeamId === null) return null
  const v = valueOf(s, key)
  if (v.line === null || v.b < TUNABLES.NEED_MIN_VALUE) return null
  const ctx = context(s, s.myTeamId)
  if (!ctx) return null
  const mine = gain(ctx.myLines, ctx.myBase, v.line, ctx.rivals)
  const generic = gain(ctx.genericLines, ctx.genericBase, v.line, ctx.rivals)
  const g = total(generic)
  if (g < MIN_GAIN) return null
  const m = total(mine)
  const raw = m <= 0 ? TUNABLES.FIT_MIN : Math.min(TUNABLES.FIT_MAX, Math.max(TUNABLES.FIT_MIN, m / g / ctx.typical))
  const mult = raw ** TUNABLES.FIT_WEIGHT
  // My gain in generic units, so the parts compare the way the multiplier does.
  const parts = CATEGORIES.map((c, i) => ({ c, d: mine[i] / ctx.typical - generic[i] }))
  const named =
    mult > 1 ? parts.filter((p) => p.d > MIN_PART).sort((a, b) => b.d - a.d) : mult < 1 ? parts.filter((p) => p.d < -MIN_PART).sort((a, b) => a.d - b.d) : []
  return { mult, cats: named.slice(0, 2).map((p) => p.c) }
}

/** The player's value for my roster: adjusted value (inflation, hot-room stars) x category fit. */
export function myValue(s: DraftState, key: string, I = inflation(s), label: TempLabel = temperature(s).label): number {
  return adjustedValue(s, key, I, label) * (fitFor(s, key)?.mult ?? 1)
}
