import type { Settings } from '../engine/types'
import { API_BASE, SEASON, type FetchLike } from './common'
import { ESPN_DEFAULT_COUNTS, IR_SLOT } from './slots'

export interface LeagueTeam {
  id: number
  name: string
  owners: string[]
}

export interface LeagueInfo {
  id: number
  draftType: string
  budget: number
  rosterSize: number
  lineupSlotCounts: Record<number, number>
  teams: LeagueTeam[]
  /** team ids in ESPN's nomination order */
  pickOrder: number[]
}

interface RawLeague {
  id?: number
  settings?: {
    draftSettings?: { type?: string; auctionBudget?: number; pickOrder?: unknown }
    rosterSettings?: { lineupSlotCounts?: Record<string, number> }
  }
  teams?: Array<{ id: number; name?: string; location?: string; nickname?: string; owners?: string[] }>
}

export function parseLeague(json: unknown): LeagueInfo {
  const raw = json as RawLeague
  const counts: Record<number, number> = {}
  for (const [slot, n] of Object.entries(raw.settings?.rosterSettings?.lineupSlotCounts ?? ESPN_DEFAULT_COUNTS)) {
    if (Number(n) > 0) counts[Number(slot)] = Number(n)
  }
  const rosterSize = Object.entries(counts)
    .filter(([slot]) => Number(slot) !== IR_SLOT)
    .reduce((sum, [, n]) => sum + n, 0)
  const pickOrder = raw.settings?.draftSettings?.pickOrder
  const teams = (raw.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name?.trim() || `${t.location ?? ''} ${t.nickname ?? ''}`.trim() || `Team ${t.id}`,
    owners: t.owners ?? [],
  }))
  return {
    id: raw.id ?? 0,
    draftType: raw.settings?.draftSettings?.type ?? 'UNKNOWN',
    budget: raw.settings?.draftSettings?.auctionBudget ?? 200,
    rosterSize,
    lineupSlotCounts: counts,
    teams,
    pickOrder: Array.isArray(pickOrder) ? pickOrder.filter(Number.isInteger) : [],
  }
}

export const leagueUrl = (leagueId: number) => `${API_BASE}/${SEASON}/segments/0/leagues/${leagueId}?view=mSettings&view=mTeam`

/** Runs in the content script: ESPN allows fantasy.espn.com to read with the user's cookies. */
export async function fetchLeague(leagueId: number, fetchFn: FetchLike = fetch): Promise<LeagueInfo> {
  const res = await fetchFn(leagueUrl(leagueId), { credentials: 'include', headers: { Accept: 'application/json' } })
  if (res.status === 401) throw new Error('ESPN returned 401: log in to ESPN in this browser')
  if (!res.ok) throw new Error(`ESPN league HTTP ${res.status}`)
  return parseLeague(await res.json())
}

export function swidFromCookie(cookie: string): string | null {
  const m = cookie.match(/(?:^|;\s*)SWID=([^;]+)/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1] // malformed %-encoding: the raw value still compares
  }
}

export function findMyTeam(league: LeagueInfo, swid: string): number | null {
  const want = swid.toUpperCase()
  return league.teams.find((t) => t.owners.some((o) => typeof o === 'string' && o.toUpperCase() === want))?.id ?? null
}

export function toSettings(league: LeagueInfo, flyerReserve = 2): Settings {
  const rank = (id: number) => {
    const i = league.pickOrder.indexOf(id)
    return i === -1 ? Infinity : i
  }
  // Array.sort is stable: unlisted teams keep id order after the listed ones.
  const ordered = [...league.teams].sort((a, b) => rank(a.id) - rank(b.id))
  return {
    teams: ordered.map(({ id, name }) => ({ id, name })),
    budget: league.budget,
    rosterSize: league.rosterSize,
    lineupSlotCounts: league.lineupSlotCounts,
    flyerReserve,
  }
}

export function fallbackSettings(teamCount = 10): Settings {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}` })),
    budget: 200,
    rosterSize: 13,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    flyerReserve: 2,
  }
}
