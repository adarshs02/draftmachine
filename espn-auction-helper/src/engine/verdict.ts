import { TUNABLES } from './constants'
import { adjustedValue, inflation, myBudget, teamSummary, temperature, valueOf } from './metrics'
import { needBoost } from './need'
import type { DraftState } from './types'

export type VerdictKind = 'BID' | 'BID_UP' | 'LET_THEM' | 'PASS' | 'LEADING'

export interface Verdict {
  kind: VerdictKind
  playerKey: string
  name: string
  price: number
  leaderId: number
  adjusted: number
  ceiling: number
  boost: number
  pushTo: number | null
  rivalPerSlotAfter: number | null
  warnings: string[]
  unvalued: boolean
}

/** Most I should pay: adjusted value (with positional need), capped by what keeps my roster fillable. */
export function ceilingFor(s: DraftState, key: string, a = adjustedValue(s, key)): number {
  const mb = myBudget(s)
  if (!mb) return 0
  return Math.max(0, Math.floor(Math.min(a * needBoost(s, key), mb.safeMax)))
}

export function concentrationWarnings(s: DraftState, winPrice: number): string[] {
  if (s.myTeamId === null) return []
  const budget = s.settings.budget
  const prices = s.sales.filter((x) => x.teamId === s.myTeamId).map((x) => x.price)
  const top = prices.length ? Math.max(...prices) : 0
  const out: string[] = []
  if (winPrice > TUNABLES.ONE_PLAYER_SHARE * budget) out.push(`One player at $${winPrice} is over ${TUNABLES.ONE_PLAYER_SHARE * 100}% of your $${budget} budget`)
  if (top > 0 && winPrice + top > TUNABLES.TWO_PLAYER_SHARE * budget) {
    out.push(`Two players ($${top} + $${winPrice}) would be over ${TUNABLES.TWO_PLAYER_SHARE * 100}% of your budget: no margin for error`)
  }
  return out
}

export function verdict(s: DraftState): Verdict | null {
  const live = s.live
  if (!live || !myBudget(s)) return null
  const v = valueOf(s, live.playerKey)
  const a = adjustedValue(s, live.playerKey, inflation(s), temperature(s).label)
  const ceiling = ceilingFor(s, live.playerKey, a)
  const base = {
    playerKey: live.playerKey,
    name: v.name,
    price: live.price,
    leaderId: live.leaderId,
    adjusted: a,
    ceiling,
    boost: needBoost(s, live.playerKey),
    pushTo: null,
    rivalPerSlotAfter: null,
    warnings: concentrationWarnings(s, live.price + 1),
    unvalued: !(live.playerKey in s.values),
  }
  const letThem = (): Verdict => {
    const r = teamSummary(s, live.leaderId)
    return { ...base, kind: 'LET_THEM', rivalPerSlotAfter: r.open > 1 ? (r.budgetLeft - live.price) / (r.open - 1) : 0 }
  }

  if (live.leaderId === s.myTeamId) return { ...base, kind: 'LEADING', warnings: concentrationWarnings(s, live.price) }
  if (v.avoid) return live.price > a ? letThem() : { ...base, kind: 'PASS' }
  const isTarget = s.targets.includes(live.playerKey)
  if (live.price < ceiling && (isTarget || a - live.price >= Math.max(TUNABLES.BID_GAP_MIN, TUNABLES.BID_GAP_FRACTION * a))) return { ...base, kind: 'BID' }
  const pushTo = Math.min(ceiling, Math.floor(a - TUNABLES.BID_UP_MARGIN))
  if (live.price < pushTo) return { ...base, kind: 'BID_UP', pushTo }
  if (live.price > a) return letThem()
  return { ...base, kind: 'PASS' }
}
