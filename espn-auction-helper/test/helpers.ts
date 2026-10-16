import type { VerbMap } from '../src/capture/decoder'
import { initialState, reduce } from '../src/engine/reducer'
import type { DraftEvent, DraftState, Settings } from '../src/engine/types'
import { ESPN_DEFAULT_COUNTS } from '../src/espn/slots'
import type { KeyValueStore } from '../src/storage'
import { normalizeName } from '../src/values/names'
import type { PlayerValue } from '../src/values/types'

export function pv(name: string, b: number, extra: Partial<PlayerValue> = {}): PlayerValue {
  return { key: normalizeName(name), espnId: null, name, slots: [11], b, consensus: b, market: b, josh: null, avoid: false, rank: null, tier: 3, line: null, injury: null, ...extra }
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

export function memoryStore(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] }
}

/** Builds a socket line for a grammar entry, so tests hold whatever verbs ESPN uses. */
export function lineFor(m: VerbMap, v: { team: number; player?: number; amount?: number }): string {
  const tokens = Array.from({ length: Math.max(m.team, m.player ?? 0, m.amount ?? 0) + 1 }, () => '0')
  tokens[0] = m.verb
  tokens[m.team] = String(v.team)
  if (m.player !== null && v.player !== undefined) tokens[m.player] = String(v.player)
  if (m.amount !== null && v.amount !== undefined) tokens[m.amount] = String(v.amount)
  return tokens.join(' ')
}
