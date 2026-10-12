import { DEFAULT_TUNABLES, TUNABLES, type TunableName, type Tunables } from '../engine/constants'
import { adjustedValue, inflation, temperature, valueOf } from '../engine/metrics'
import { suggestNomination } from '../engine/nominate'
import type { DraftState } from '../engine/types'
import { ceilingFor } from '../engine/verdict'
import type { AuctionView, MyAgent } from './auction'
import { marketPrice } from './bots'
import type { SimPlayer } from './types'

export type PolicyName = 'autopilot' | 'market' | 'consensus'
export const POLICIES: PolicyName[] = ['autopilot', 'market', 'consensus']
export const AUTOPILOT_REACTION_MS = 1000

export interface StateSource {
  readonly state: DraftState
  keyOf(espnId: number): string
}

/**
 * Highest price the panel's verdict would keep bidding to for `key` with a rival leading:
 * BID while price < ceiling and (target or a - price >= gap); BID UP while price < pushTo.
 * Depends only on sales, values and tunables, so it is computed once per block.
 */
export function autopilotCap(s: DraftState, key: string): number {
  if (valueOf(s, key).avoid) return 0
  const a = adjustedValue(s, key, inflation(s), temperature(s).label)
  const ceiling = ceilingFor(s, key, a)
  if (s.targets.includes(key)) return ceiling
  const gap = Math.max(TUNABLES.BID_GAP_MIN, TUNABLES.BID_GAP_FRACTION * a)
  const bidTo = Math.min(ceiling, Math.floor(a - gap) + 1)
  const pushTo = Math.min(ceiling, Math.floor(a - TUNABLES.BID_UP_MARGIN))
  return Math.max(0, bidTo, pushTo)
}

/** Tunables that only change what the panel shows (warnings, alerts, the target list). */
const DISPLAY_ONLY: readonly TunableName[] = ['BARGAIN_RATIO', 'ONE_PLAYER_SHARE', 'TWO_PLAYER_SHARE', 'TARGET_BAND', 'TARGET_LIMIT']

/**
 * Tunables that can't change autopilot's bids under `t`, in DEFAULT_TUNABLES order. BID_GAP_* only
 * pick the label (BID vs BID UP) while the gap is at least BID_UP_MARGIN + 1: BID UP then bids further.
 */
export function inertForAutopilot(t: Readonly<Tunables>): TunableName[] {
  const gapInert = t.BID_GAP_MIN >= t.BID_UP_MARGIN + 1
  return (Object.keys(DEFAULT_TUNABLES) as TunableName[]).filter(
    (k) => DISPLAY_ONLY.includes(k) || (gapInert && (k === 'BID_GAP_MIN' || k === 'BID_GAP_FRACTION')),
  )
}

export function createAgent(name: PolicyName, source: StateSource, players: readonly SimPlayer[]): MyAgent {
  const byId = new Map(players.map((p) => [p.espnId, p]))
  const byKey = new Map(players.map((p) => [p.key, p.espnId]))
  const topAvailable = (view: AuctionView) => (view.available.length ? { espnId: view.available[0].espnId, amount: 1 } : null)
  const blockPlayer = (view: AuctionView) => (view.block ? byId.get(view.block.espnId) ?? null : null)

  if (name === 'autopilot') {
    let capFor: { espnId: number; cap: number } | null = null
    return {
      reactionMs: AUTOPILOT_REACTION_MS,
      nominate(view) {
        const pick = suggestNomination(source.state)
        const espnId = pick ? byKey.get(pick.playerKey) : undefined
        if (espnId !== undefined && view.available.some((p) => p.espnId === espnId)) return { espnId, amount: 1 }
        return topAvailable(view)
      },
      bidCap(view) {
        if (!view.block) return null
        if (capFor?.espnId !== view.block.espnId) capFor = { espnId: view.block.espnId, cap: autopilotCap(source.state, source.keyOf(view.block.espnId)) }
        return capFor.cap
      },
    }
  }
  return {
    reactionMs: AUTOPILOT_REACTION_MS,
    nominate: topAvailable,
    bidCap(view) {
      const p = blockPlayer(view)
      if (!p) return null
      return Math.round(name === 'market' ? marketPrice(p) : p.consensus)
    },
  }
}
