import type { DraftEvent } from '../engine/types'
import type { RawEvent } from './decoder'

/**
 * Tracks the player on the block so bids without a player id, and sales without a price, resolve.
 * ESPN has no nominate verb: a bid on a player who is not on the block is the nomination.
 */
export function createAssembler(idToKey: (espnId: number) => string) {
  let live: { playerKey: string; price: number } | null = null
  return {
    push(raw: RawEvent): DraftEvent[] {
      switch (raw.kind) {
        case 'nominated': {
          const playerKey = idToKey(raw.playerId)
          live = { playerKey, price: raw.amount }
          return [{ type: 'nominated', playerKey, teamId: raw.teamId, amount: raw.amount }]
        }
        case 'bid': {
          if (raw.playerId !== null) {
            const playerKey = idToKey(raw.playerId)
            if (!live || live.playerKey !== playerKey) {
              live = { playerKey, price: raw.amount }
              return [{ type: 'nominated', playerKey, teamId: raw.teamId, amount: raw.amount }]
            }
          }
          if (!live) return []
          live = { ...live, price: Math.max(live.price, raw.amount) }
          return [{ type: 'bid', teamId: raw.teamId, amount: raw.amount }]
        }
        case 'sold': {
          const playerKey = idToKey(raw.playerId)
          const price = raw.amount ?? (live?.playerKey === playerKey ? live.price : 1)
          live = null
          return [{ type: 'sold', playerKey, teamId: raw.teamId, price }]
        }
        default:
          return []
      }
    },
  }
}
