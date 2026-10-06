import { initialState, reduce } from '../src/engine/reducer'
import type { DraftEvent, DraftState, Settings } from '../src/engine/types'
import { ESPN_DEFAULT_COUNTS } from '../src/espn/slots'
import { normalizeName } from '../src/values/names'
import type { PlayerValue } from '../src/values/types'

export function pv(name: string, b: number, extra: Partial<PlayerValue> = {}): PlayerValue {
  return { key: normalizeName(name), espnId: null, name, slots: [11], b, consensus: b, market: b, josh: null, avoid: false, tier: 3, ...extra }
}

export function settings(teamCount = 4, extra: Partial<Settings> = {}): Settings {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: i + 1, name: `T${i + 1}` })),
    budget: 200,
    rosterSize: 13,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    flyerReserve: 2,
    ...extra,
  }
}

export function build(s: Settings, values: PlayerValue[], events: DraftEvent[], myTeamId: number | null = 1): DraftState {
  return events.reduce(reduce, initialState(s, values, myTeamId))
}

export const sold = (name: string, teamId: number, price: number): DraftEvent => ({ type: 'sold', playerKey: normalizeName(name), teamId, price })
export const nominated = (name: string, teamId: number, amount: number): DraftEvent => ({ type: 'nominated', playerKey: normalizeName(name), teamId, amount })
