import type { Frame } from './capture/frames'
import { buildRecording } from './capture/recording'
import { advise, type Advice } from './engine/advise'
import { initialState, reduce } from './engine/reducer'
import type { DraftEvent, DraftState } from './engine/types'
import { fallbackSettings, findMyTeam, swidFromCookie, toSettings, type LeagueInfo } from './espn/league'
import { loadEvents, saveEvents, type KeyValueStore } from './storage'
import type { Health } from './ui/Panel'
import { rescaleToLeague } from './values/rescale'
import type { PlayerValue } from './values/types'

export interface View {
  advice: Advice
  state: DraftState
  health: Health
  banner: string | null
  frameCount: number
}

export interface ControllerDeps {
  leagueId: number
  storage: KeyValueStore
  values: PlayerValue[]
  cookie: string
  loadLeague: () => Promise<LeagueInfo>
  render: (view: View) => void
}

export interface Controller {
  dispatch(ev: DraftEvent): void
  getState(): DraftState
  onFrame(frame: Frame): void
  recordingJson(): string
}

export async function createController(deps: ControllerDeps): Promise<Controller> {
  let banner: string | null = null
  let league: LeagueInfo | null = null
  try {
    league = await deps.loadLeague()
  } catch (e) {
    banner = `ESPN league settings unavailable (${(e as Error).message}); assuming 10 teams, $200, 13 spots`
  }
  if (league && league.draftType !== 'AUCTION') banner = `This league's draft type is ${league.draftType}; this helper is built for auctions`

  const settings = league ? toSettings(league) : fallbackSettings()
  const values = rescaleToLeague(deps.values, { teams: settings.teams.length, budget: settings.budget, rosterSize: settings.rosterSize })
  const swid = swidFromCookie(deps.cookie)
  let state = initialState(settings, values, league && swid ? findMyTeam(league, swid) : null)
  const log = loadEvents(deps.storage, deps.leagueId)
  for (const ev of log) state = reduce(state, ev)

  const startedAt = new Date()
  const frames: Frame[] = []
  const health: Health = 'manual'
  const publish = () => deps.render({ advice: advise(state), state, health, banner, frameCount: frames.length })
  publish()

  return {
    dispatch(ev) {
      state = reduce(state, ev)
      log.push(ev)
      saveEvents(deps.storage, deps.leagueId, log)
      publish()
    },
    getState: () => state,
    onFrame(frame) {
      frames.push(frame)
      publish()
    },
    recordingJson: () => JSON.stringify(buildRecording(deps.leagueId, startedAt, frames)),
  }
}
