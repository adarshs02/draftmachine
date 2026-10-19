import { createAssembler } from '../capture/assembler'
import { decodeLine } from '../capture/decoder'
import { initialState, reduce } from '../engine/reducer'
import type { DraftState, Settings } from '../engine/types'
import { rescaleToLeague } from '../values/rescale'
import type { PlayerValue } from '../values/types'

export interface Tracker {
  readonly state: DraftState
  keyOf(espnId: number): string
  push(line: string): void
}

/** The panel's draft state built from socket lines exactly as the controller does, minus storage, alerts and rendering. */
export function createTracker(values: PlayerValue[], settings: Settings, myTeamId: number): Tracker {
  const scaled = rescaleToLeague(values, { teams: settings.teams.length, budget: settings.budget, rosterSize: settings.rosterSize })
  let state = initialState(settings, scaled, myTeamId)
  const byEspnId = new Map(scaled.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, v.key] as const])))
  const keyOf = (espnId: number) => byEspnId.get(espnId) ?? `espn:${espnId}`
  const assembler = createAssembler(keyOf, () => state.live)
  return {
    get state() {
      return state
    },
    keyOf,
    push(line) {
      const raw = decodeLine(line)
      if (!raw || raw.kind === 'unknown') return
      if (raw.kind === 'turn') {
        state = reduce(state, { type: 'turn', teamId: raw.teamId })
        return
      }
      for (const ev of assembler.push(raw)) state = reduce(state, ev)
    },
  }
}
