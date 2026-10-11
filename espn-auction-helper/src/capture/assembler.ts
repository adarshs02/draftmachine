import type { DraftEvent } from '../engine/types'
import type { RawEvent } from './decoder'

type Block = { playerKey: string; price: number } | null

/**
 * Turns decoded socket events into draft events, judging them against the block the panel shows
 * (getLive), so a refresh, an undo or a manual nomination cannot leave it out of step.
 * ESPN has no nominate verb: a bid on a player who is not on the block is the nomination.
 */
export function createAssembler(idToKey: (espnId: number) => string, getLive: () => Block) {
  return {
    push(raw: RawEvent): DraftEvent[] {
      switch (raw.kind) {
        case 'nominated':
          return [{ type: 'nominated', playerKey: idToKey(raw.playerId), teamId: raw.teamId, amount: raw.amount }]
        case 'bid': {
          const live = getLive()
          if (raw.playerId !== null) {
            const playerKey = idToKey(raw.playerId)
            if (live?.playerKey !== playerKey) return [{ type: 'nominated', playerKey, teamId: raw.teamId, amount: raw.amount }]
          }
          if (!live) return []
          return [{ type: 'bid', teamId: raw.teamId, amount: raw.amount }]
        }
        case 'sold': {
          const playerKey = idToKey(raw.playerId)
          const live = getLive()
          const price = raw.amount ?? (live?.playerKey === playerKey ? live.price : 1)
          return [{ type: 'sold', playerKey, teamId: raw.teamId, price }]
        }
        case 'turn': // the controller judges a turn against the block; it is no draft event
        default:
          return []
      }
    },
  }
}
