import { UTIL_SLOT } from '../espn/slots'
import type { PlayerValue } from '../values/types'
import type { DraftEvent, DraftState, Settings } from './types'

/** Stand-in for a player missing from values.json (rookie call-up, unknown ESPN id). */
export function placeholderValue(key: string, b = 1): PlayerValue {
  const espnId = /^espn:(\d+)$/.exec(key)?.[1]
  const name = espnId ? `ESPN #${espnId}` : key
  return { key, espnId: null, name, slots: [UTIL_SLOT], b, consensus: 0, market: 0, josh: null, avoid: false, rank: null, tier: 5 }
}

export function initialState(settings: Settings, values: PlayerValue[], myTeamId: number | null = null): DraftState {
  return { settings, myTeamId, values: Object.fromEntries(values.map((v) => [v.key, v])), sales: [], live: null, targets: [], nextSeq: 1, turnTeamId: null, lastNominatorId: null }
}

const isSold = (s: DraftState, key: string) => s.sales.some((x) => x.playerKey === key)

export function reduce(s: DraftState, ev: DraftEvent): DraftState {
  switch (ev.type) {
    case 'nominated':
      if (isSold(s, ev.playerKey) || s.live?.playerKey === ev.playerKey) return s
      return { ...s, live: { playerKey: ev.playerKey, price: ev.amount, leaderId: ev.teamId }, lastNominatorId: ev.teamId, turnTeamId: null }
    case 'turn':
      return s.turnTeamId === ev.teamId ? s : { ...s, turnTeamId: ev.teamId }
    case 'bid':
      if (!s.live || ev.amount <= s.live.price) return s
      return { ...s, live: { ...s.live, price: ev.amount, leaderId: ev.teamId } }
    case 'clearLive':
      return s.live ? { ...s, live: null } : s
    case 'sold':
      if (isSold(s, ev.playerKey)) return s
      return {
        ...s,
        live: null,
        nextSeq: s.nextSeq + 1,
        sales: [...s.sales, { seq: s.nextSeq, playerKey: ev.playerKey, teamId: ev.teamId, price: ev.price }],
      }
    case 'undo':
      return s.sales.length ? { ...s, live: null, sales: s.sales.slice(0, -1) } : s
    case 'editSale':
      return { ...s, sales: s.sales.map((x) => (x.seq === ev.seq ? { ...x, teamId: ev.teamId, price: ev.price } : x)) }
    case 'setMyTeam':
      return { ...s, myTeamId: ev.teamId }
    case 'toggleTarget':
      return {
        ...s,
        targets: s.targets.includes(ev.playerKey) ? s.targets.filter((k) => k !== ev.playerKey) : [...s.targets, ev.playerKey],
      }
    case 'setValue': {
      const current = s.values[ev.playerKey] ?? placeholderValue(ev.playerKey)
      return { ...s, values: { ...s.values, [ev.playerKey]: { ...current, b: Math.max(1, ev.b) } } }
    }
    default:
      return s // unknown event (e.g. from an older saved log): ignore
  }
}
