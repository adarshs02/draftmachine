import type { Fit } from '../engine/fit'
import { CATEGORY_LABELS, type Category } from '../engine/h2h'
import type { CategoryProfile } from '../engine/profile'
import type { Team } from '../engine/types'
import type { Verdict } from '../engine/verdict'

export const money = (n: number) => `$${Math.round(n)}`

/** "#3 Bubble Boys": the id is what the ✎ fix prompt asks for. */
export const teamLabel = (t: Team) => `#${t.id} ${t.name}`

export function verdictText(v: Verdict): string {
  switch (v.kind) {
    case 'BID':
      return `BID up to ${money(v.ceiling)}`
    case 'BID_UP':
      return `BID UP to ${money(v.pushTo ?? v.ceiling)}`
    case 'LET_THEM':
      return `LET THEM (${money(v.price)} > value ${money(v.adjusted)})`
    case 'PASS':
      return v.saveSlot !== null ? 'PASS: save the slot' : 'PASS'
    case 'LEADING':
      return `You lead at ${money(v.price)} (ceiling ${money(v.ceiling)})`
  }
}

/** The panel names the fit only when it moves the value this much. */
export const FIT_NOTE_MIN = 0.02

export function fitText(f: Fit): string {
  const names = f.cats.map((c) => CATEGORY_LABELS[c]).join(', ')
  const head = `fits your team ×${f.mult.toFixed(2)}`
  if (!names) return head
  return f.mult > 1 ? `${head}: ${names}` : `${head}: less useful in ${names}`
}

const labels = (cats: readonly Category[]) => cats.map((c) => CATEGORY_LABELS[c]).join(', ')

/** "Value from: BLK, REB · costs you: FT%"; null for a player with no standout categories. */
export function profileText(p: CategoryProfile): string | null {
  if (p.strengths.length && p.costs.length) return `Value from: ${labels(p.strengths)} · costs you: ${labels(p.costs)}`
  if (p.strengths.length) return `Value from: ${labels(p.strengths)}`
  if (p.costs.length) return `Costs you: ${labels(p.costs)}`
  return null
}

export function flagText(flag: 'value' | 'overpay' | null, market: number): string | null {
  if (flag === 'value') return `⭐ value play: room usually pays ${money(market)}`
  if (flag === 'overpay') return `room usually overpays: ~${money(market)}`
  return null
}

export function standingText(strong: readonly Category[], weak: readonly Category[]): string | null {
  const parts = [strong.length ? `strong ${labels(strong)}` : '', weak.length ? `weak ${labels(weak)}` : ''].filter(Boolean)
  return parts.length ? `Your team: ${parts.join(' · ')}` : null
}
