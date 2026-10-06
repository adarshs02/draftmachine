import { DECOY_MARKET_RATIO, DOLLAR_MONEY, EARLY_MONEY } from './constants'
import { allTeams, available, type TeamSummary } from './metrics'
import type { DraftState } from './types'
import { ceilingFor } from './verdict'

export const rivals = (s: DraftState): TeamSummary[] => allTeams(s).filter((t) => t.id !== s.myTeamId)
export const rivalsAbove = (s: DraftState, ceiling: number): TeamSummary[] => rivals(s).filter((t) => t.maxBid > ceiling)

export type Phase = 'early' | 'mid' | 'dollar'

export function nominationPhase(s: DraftState): Phase {
  const money = allTeams(s).reduce((sum, t) => sum + t.budgetLeft, 0)
  const ratio = money / (s.settings.teams.length * s.settings.budget)
  const r = rivals(s)
  if (ratio < DOLLAR_MONEY || (r.length > 0 && r.every((t) => t.maxBid <= 2))) return 'dollar'
  return ratio > EARLY_MONEY ? 'early' : 'mid'
}

export interface Nomination {
  phase: Phase
  playerKey: string
  name: string
  reason: string
}

export function suggestNomination(s: DraftState): Nomination | null {
  if (s.myTeamId === null) return null
  const avail = available(s)
  if (!avail.length) return null
  const phase = nominationPhase(s)
  const notMine = avail.filter((v) => !s.targets.includes(v.key))
  const targets = avail.filter((v) => s.targets.includes(v.key))

  const decoy = (): Nomination => {
    const overpaid = notMine.find((v) => v.market > DECOY_MARKET_RATIO * v.b)
    if (overpaid) {
      return { phase, playerKey: overpaid.key, name: overpaid.name, reason: `Room pays ~$${Math.round(overpaid.market)}, you value $${Math.round(overpaid.b)}: get money off the board` }
    }
    const best = notMine[0] ?? avail[0]
    return { phase, playerKey: best.key, name: best.name, reason: 'Best player you are not targeting: drain rival budgets' }
  }

  if (phase === 'early') return decoy()
  if (phase === 'mid') {
    const t = targets.find((v) => rivalsAbove(s, ceilingFor(s, v.key)).length <= 1)
    return t ? { phase, playerKey: t.key, name: t.name, reason: 'At most one rival can outbid your ceiling: nominate your target now' } : decoy()
  }
  if (rivals(s).every((r) => r.maxBid <= 1)) {
    const t = targets[0] ?? avail[0]
    return { phase, playerKey: t.key, name: t.name, reason: 'No rival can bid over $1: nominate him for $1' }
  }
  return decoy()
}
