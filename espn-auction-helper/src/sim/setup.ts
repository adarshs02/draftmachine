import type { LeagueInfo } from '../espn/league'
import { ESPN_DEFAULT_COUNTS } from '../espn/slots'
import type { PlayerValue } from '../values/types'
import { DEFAULT_BOT_MIX, marketPrice, ROOMS } from './bots'
import type { BotKind, SimPlayer, SimTeam } from './types'

/** The user's league: ESPN nomination order of the test league; the user is team 1, nominating 5th. */
export const USER_PICK_ORDER = [7, 10, 5, 9, 1, 4, 8, 3, 6, 2]
export const USER_TEAM_ID = 1
export const ROSTER_SIZE = 13
/** The simulated user's ESPN member id, so the controller's normal SWID match finds "my team". */
export const SIM_SWID = '{51A10000-0000-0000-0000-000000000001}'

export interface SimOptions {
  seed: number
  room: number
  /** one per bot, assigned in draft order skipping my team */
  botKinds: BotKind[]
  pickOrder: number[]
  myTeamId: number
  budget: number
  /** CLOCK lines every 2 s (the page needs them for the live light; the batch doesn't) */
  emitClock: boolean
}

export const defaultOptions = (seed = 1): SimOptions => ({
  seed,
  room: ROOMS.neutral,
  botKinds: [...DEFAULT_BOT_MIX],
  pickOrder: [...USER_PICK_ORDER],
  myTeamId: USER_TEAM_ID,
  budget: 200,
  emitClock: false,
})

/** Players the room can draft: those with an ESPN id (frames carry ids), most expensive first. */
export function simPlayers(values: readonly PlayerValue[]): SimPlayer[] {
  return values
    .filter((v): v is PlayerValue & { espnId: number } => v.espnId !== null)
    .map((v) => ({ espnId: v.espnId, key: v.key, name: v.name, market: v.market, consensus: v.consensus }))
    .sort((a, b) => marketPrice(b) - marketPrice(a))
}

export function simTeams(o: SimOptions): SimTeam[] {
  const kinds = [...o.botKinds]
  if (kinds.length < o.pickOrder.length - 1) throw new Error(`need ${o.pickOrder.length - 1} bot kinds, got ${kinds.length}`)
  return o.pickOrder.map((id) => {
    const bot = id === o.myTeamId ? null : kinds.shift()!
    return { id, name: bot === null ? 'You' : `Bot ${id} (${bot})`, bot, budget: o.budget, roster: [] }
  })
}

/** The league as the controller sees it: draft order, ESPN default lineup, the sim user owning my team. */
export function simLeague(o: SimOptions, teams: readonly SimTeam[]): LeagueInfo {
  return {
    id: 0,
    draftType: 'AUCTION',
    budget: o.budget,
    rosterSize: ROSTER_SIZE,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    teams: teams.map((t) => ({ id: t.id, name: t.name, owners: t.id === o.myTeamId ? [SIM_SWID] : [] })),
    pickOrder: [...o.pickOrder],
  }
}
