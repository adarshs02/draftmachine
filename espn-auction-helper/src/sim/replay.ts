import { splitLines } from '../capture/frames'
import type { Recording } from '../capture/recording'
import { placeholderValue } from '../engine/reducer'
import type { LeagueInfo } from '../espn/league'
import { ESPN_DEFAULT_COUNTS } from '../espn/slots'
import { normalizeName } from '../values/names'
import type { PlayerValue } from '../values/types'
import { ROSTER_SIZE, SIM_SWID, USER_PICK_ORDER, USER_TEAM_ID } from './setup'

export interface ReplayLine {
  /** ms from the start of the replay */
  t: number
  line: string
}

export interface Replay {
  league: LeagueInfo
  /** values to use instead of data/values.json, or null to use it as is */
  values: PlayerValue[] | null
  lines: ReplayLine[]
}

/** test/fixtures/josh-mock-sales.json */
export interface JoshFixture {
  teams: string[]
  settings: { teams: number; budget: number; rosterSize: number }
  sales: Array<{ player: string; team: string; price: number }>
}

/** Josh players with no ESPN id get ids from here, so their frames still decode to the right player. */
export const PLACEHOLDER_ID_BASE = 900000
export const JOSH_SALE_MS = 4000
export const JOSH_SOLD_AFTER_MS = 3000

function replayLeague(teams: Array<{ id: number; name: string }>, myTeamId: number, pickOrder: number[], budget: number, rosterSize: number): LeagueInfo {
  return {
    id: 0,
    draftType: 'AUCTION',
    budget,
    rosterSize,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    teams: teams.map((t) => ({ ...t, owners: t.id === myTeamId ? [SIM_SWID] : [] })),
    pickOrder,
  }
}

/** The recorded ESPN draft (scrubbed fixture), timed from its first incoming frame. */
export function espnRecordingReplay(rec: Recording): Replay {
  const frames = rec.frames.filter((f) => f.dir === 'in')
  const t0 = frames[0]?.t ?? 0
  return {
    league: replayLeague(USER_PICK_ORDER.map((id) => ({ id, name: `Team ${id}` })), USER_TEAM_ID, [...USER_PICK_ORDER], 200, ROSTER_SIZE),
    values: null,
    lines: frames.flatMap((f) => splitLines(f.data).map((line) => ({ t: f.t - t0, line }))),
  }
}

/** Josh Lloyd's 12-team mock as ESPN lines: each sale is one BID (nomination at the final price) then its SOLD. */
export function joshReplay(f: JoshFixture, values: readonly PlayerValue[]): Replay {
  const out = values.map((v) => ({ ...v }))
  const byKey = new Map(out.map((v) => [v.key, v]))
  const ids = new Map<string, number>()
  f.sales.forEach((sale, i) => {
    const key = normalizeName(sale.player)
    const v = byKey.get(key)
    if (v && v.espnId !== null) {
      ids.set(key, v.espnId)
      return
    }
    const id = PLACEHOLDER_ID_BASE + i
    ids.set(key, id)
    if (v) {
      v.espnId = id
    } else {
      const placeholder: PlayerValue = { ...placeholderValue(key), espnId: id, name: sale.player }
      out.push(placeholder)
      byKey.set(key, placeholder)
    }
  })
  const teamId = (name: string) => {
    const i = f.teams.indexOf(name)
    if (i < 0) throw new Error(`Josh fixture: unknown team ${name}`)
    return i + 1
  }
  const lines: ReplayLine[] = [{ t: 0, line: 'STATE 1' }]
  f.sales.forEach((sale, i) => {
    const team = teamId(sale.team)
    const id = ids.get(normalizeName(sale.player))!
    lines.push({ t: i * JOSH_SALE_MS, line: `BID ${team} ${id} ${sale.price} 25000 10000` })
    lines.push({ t: i * JOSH_SALE_MS + JOSH_SOLD_AFTER_MS, line: `SOLD ${team} ${id} 0 ${sale.price} 0` })
  })
  lines.push({ t: f.sales.length * JOSH_SALE_MS, line: 'STATE 2' })
  const teams = f.teams.map((name, i) => ({ id: i + 1, name }))
  return {
    league: replayLeague(teams, teamId('Josh'), teams.map((t) => t.id), f.settings.budget, f.settings.rosterSize),
    values: out,
    lines,
  }
}
