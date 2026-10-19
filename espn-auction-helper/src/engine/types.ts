import type { PlayerValue } from '../values/types'

export interface Team {
  id: number
  name: string
}

export interface Settings {
  teams: Team[]
  budget: number
  rosterSize: number
  /** ESPN lineup slot id -> count, bench/IR included */
  lineupSlotCounts: Record<number, number>
  /** $1 streaming slots to hold back (Josh keeps 2) */
  flyerReserve: number
}

export interface Sale {
  seq: number
  playerKey: string
  teamId: number
  price: number
}

export interface Live {
  playerKey: string
  price: number
  leaderId: number
}

export interface DraftState {
  settings: Settings
  myTeamId: number | null
  values: Record<string, PlayerValue>
  sales: Sale[]
  live: Live | null
  targets: string[]
  nextSeq: number
  /** team ESPN says is on the clock to nominate; null when unknown */
  turnTeamId: number | null
  /** who nominated the most recent player */
  lastNominatorId: number | null
}

export type DraftEvent =
  | { type: 'nominated'; playerKey: string; teamId: number; amount: number }
  | { type: 'turn'; teamId: number }
  | { type: 'bid'; teamId: number; amount: number }
  | { type: 'clearLive' }
  | { type: 'sold'; playerKey: string; teamId: number; price: number }
  | { type: 'undo' }
  | { type: 'editSale'; seq: number; teamId: number; price: number }
  | { type: 'setMyTeam'; teamId: number }
  | { type: 'toggleTarget'; playerKey: string }
  | { type: 'setValue'; playerKey: string; b: number }
