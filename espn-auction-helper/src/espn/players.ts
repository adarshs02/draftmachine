import { API_BASE, SEASON, type FetchLike } from './common'

export interface EspnPlayer {
  id: number
  name: string
  /** eligible lineup slots 0-11 (bench 12 and IR 13 dropped) */
  slots: number[]
  /** ESPN's categories auction value (10 teams x $200 x 13 basis) */
  roto: number
  /** average price paid in ESPN auction drafts */
  market: number
}

export const PLAYERS_URL = `${API_BASE}/${SEASON}/segments/0/leaguedefaults/1?view=kona_player_info`
// The whole pool (~1100). A top-N cut would follow ESPN's own draft rank, which buries useful players far down.
export const PLAYERS_FILTER = JSON.stringify({
  players: { limit: 1500, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'STANDARD' } },
})

interface RawPlayer {
  id?: number
  player?: {
    id?: number
    fullName?: string
    eligibleSlots?: number[]
    draftRanksByRankType?: { ROTO?: { auctionValue?: number } }
    ownership?: { auctionValueAverage?: number }
  }
}

export function trimPlayers(raw: unknown): EspnPlayer[] {
  const list = (raw as { players?: RawPlayer[] } | null)?.players ?? []
  const out: EspnPlayer[] = []
  for (const p of list) {
    const pl = p.player
    const id = p.id ?? pl?.id
    if (!pl?.fullName || typeof id !== 'number') continue
    out.push({
      id,
      name: pl.fullName,
      slots: (pl.eligibleSlots ?? []).filter((s) => s <= 11),
      roto: pl.draftRanksByRankType?.ROTO?.auctionValue ?? 0,
      market: Math.round((pl.ownership?.auctionValueAverage ?? 0) * 10) / 10,
    })
  }
  return out
}

export async function fetchPlayers(fetchFn: FetchLike = fetch): Promise<EspnPlayer[]> {
  const res = await fetchFn(PLAYERS_URL, { headers: { Accept: 'application/json', 'X-Fantasy-Filter': PLAYERS_FILTER } })
  if (!res.ok) throw new Error(`ESPN players HTTP ${res.status}`)
  return trimPlayers(await res.json())
}
