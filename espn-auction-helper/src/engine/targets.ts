import { TARGET_BAND, TARGET_LIMIT } from './constants'
import { adjustedValue, available, inflation, myBudget, temperature } from './metrics'
import { rivalsAbove } from './nominate'
import type { DraftState } from './types'
import { ceilingFor } from './verdict'

export interface TargetRow {
  playerKey: string
  name: string
  adjusted: number
  expected: number
  gap: number
  ceiling: number
  pinned: boolean
  outbidBy: string[]
}

export function targetList(s: DraftState, limit = TARGET_LIMIT): TargetRow[] {
  const mb = myBudget(s)
  if (!mb) return []
  const temp = temperature(s)
  const I = inflation(s)
  const T = temp.T ?? 1
  const perSlot = mb.core > 0 ? mb.perSlot : mb.safeMax
  const lo = perSlot * (1 - TARGET_BAND)
  const hi = perSlot * (1 + TARGET_BAND)
  return available(s)
    .filter((v) => !v.avoid)
    .map((v) => ({ v, expected: v.b * T, pinned: s.targets.includes(v.key) }))
    .filter(({ expected, pinned }) => pinned || (expected >= lo && expected <= hi))
    .map(({ v, expected, pinned }) => {
      const adjusted = adjustedValue(s, v.key, I, temp.label)
      const ceiling = ceilingFor(s, v.key, adjusted)
      return { playerKey: v.key, name: v.name, adjusted, expected, gap: adjusted - expected, ceiling, pinned, outbidBy: rivalsAbove(s, ceiling).map((t) => t.name) }
    })
    .sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.gap - x.gap)
    .slice(0, limit)
}
