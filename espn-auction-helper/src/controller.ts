import type { Frame } from './capture/frames'
import { buildRecording } from './capture/recording'
import { advise, type Advice } from './engine/advise'
import { initialState, reduce } from './engine/reducer'
import type { DraftEvent, DraftState } from './engine/types'
import { fallbackSettings, findMyTeam, swidFromCookie, toSettings, type LeagueInfo } from './espn/league'
import { clearEvents, loadEvents, saveEvents, type KeyValueStore } from './storage'
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

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function createController(deps: ControllerDeps): Promise<Controller> {
  let leagueBanner: string | null = null
  let restoreBanner: string | null = null
  let settings = fallbackSettings()
  let myTeamId: number | null = null
  try {
    const league = await deps.loadLeague()
    if (league.teams.length < 2) throw new Error(`league has ${league.teams.length} teams`)
    const swid = swidFromCookie(deps.cookie)
    myTeamId = swid ? findMyTeam(league, swid) : null
    settings = toSettings(league)
    if (league.draftType !== 'AUCTION') leagueBanner = `This league's draft type is ${league.draftType}; this helper is built for auctions`
  } catch (e) {
    settings = fallbackSettings()
    myTeamId = null
    leagueBanner = `ESPN league settings unavailable (${errorMessage(e)}); assuming 10 teams, $200, 13 spots`
  }

  const values = rescaleToLeague(deps.values, { teams: settings.teams.length, budget: settings.budget, rosterSize: settings.rosterSize })
  const fresh = () => initialState(settings, values, myTeamId)
  let state = fresh()
  let log = loadEvents(deps.storage, deps.leagueId)
  try {
    for (const ev of log) state = reduce(state, ev)
  } catch {
    // A log this build can't replay would crash every refresh: drop it.
    log = []
    state = fresh()
    clearEvents(deps.storage, deps.leagueId)
    restoreBanner = 'Saved draft could not be restored; starting fresh'
  }

  const startedAt = new Date()
  const frames: Frame[] = []
  const health: Health = 'manual'
  const banner = () => [leagueBanner, restoreBanner].filter(Boolean).join(' · ') || null
  const publish = () => deps.render({ advice: advise(state), state, health, banner: banner(), frameCount: frames.length })
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
