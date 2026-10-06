import { splitLines, type Frame } from './capture/frames'
import { createAssembler } from './capture/assembler'
import { decodeLine, NOISE_VERBS, type RawEvent } from './capture/decoder'
import { buildRecording } from './capture/recording'
import { advise, type Advice } from './engine/advise'
import { teamSummary, valueOf } from './engine/metrics'
import { initialState, reduce } from './engine/reducer'
import type { DraftEvent, DraftState, Live } from './engine/types'
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
  /** Something the user must check by hand; kept until dismissed or replaced. */
  alert: string | null
  /** incoming socket verbs the decoder does not know, with how often each arrived */
  unknownVerbs: Record<string, number>
  frameCount: number
}

export interface ControllerDeps {
  leagueId: number
  /** sessionStorage: this tab's draft, survives a refresh */
  storage: KeyValueStore
  /** localStorage: the same log, so a closed tab doesn't lose a manual draft */
  backup: KeyValueStore
  values: PlayerValue[]
  cookie: string
  loadLeague: () => Promise<LeagueInfo>
  render: (view: View) => void
  /** clock for the health window (tests); default Date.now */
  now?: () => number
}

export interface Controller {
  dispatch(ev: DraftEvent): void
  dismissAlert(): void
  getState(): DraftState
  onFrame(frame: Frame): void
  recordingJson(): string
  /** Re-renders only if health changed since the last render (decoding went quiet, or came back). */
  tick(): void
  /** New draft: forget every recorded event, keep league settings, values and the detected team. */
  reset(): void
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** ESPN sends CLOCK every 2-5 s and PONG every 15 s: this long without a line we understand means decoding has stopped. */
export const LIVE_WINDOW_MS = 20000

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
  const stores = [deps.storage, deps.backup]
  const clearLog = () => stores.forEach((store) => clearEvents(store, deps.leagueId))
  const sessionLog = loadEvents(deps.storage, deps.leagueId)
  // New tab or restarted browser: fall back to the browser-wide copy.
  const backupLog = sessionLog.length ? [] : loadEvents(deps.backup, deps.leagueId)
  let log = backupLog.length ? backupLog : sessionLog
  try {
    for (const ev of log) state = reduce(state, ev)
    if (backupLog.length) restoreBanner = `Restored ${state.sales.length} saved sales from this browser — use New draft to start over`
  } catch {
    // A log this build can't replay would crash every refresh: drop it.
    log = []
    state = fresh()
    clearLog()
    restoreBanner = 'Saved draft could not be restored; starting fresh'
  }

  const startedAt = new Date()
  const frames: Frame[] = []
  const byEspnId = new Map(values.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, v.key] as const])))
  const assembler = createAssembler((id) => byEspnId.get(id) ?? `espn:${id}`, () => state.live)
  const now = deps.now ?? Date.now
  let lastRecognizedAt: number | null = null
  const unknownVerbs = new Map<string, number>()
  const health = (): Health => (lastRecognizedAt !== null && now() - lastRecognizedAt < LIVE_WINDOW_MS ? 'live' : 'manual')
  let shownHealth: Health = 'manual'
  let alert: string | null = null
  const banner = () => [leagueBanner, restoreBanner].filter(Boolean).join(' · ') || null
  const publish = () => {
    shownHealth = health()
    deps.render({ advice: advise(state), state, health: shownHealth, banner: banner(), alert, unknownVerbs: Object.fromEntries(unknownVerbs), frameCount: frames.length })
  }
  /** Returns whether the event changed anything; no-ops (repeat bids, stale bids) stay out of the log. */
  const apply = (ev: DraftEvent): boolean => {
    const next = reduce(state, ev)
    if (next === state) return false
    state = next
    log.push(ev)
    for (const store of stores) saveEvents(store, deps.leagueId, log)
    return true
  }
  const missedSale = (live: Live) =>
    `Missed the end of ${valueOf(state, live.playerKey).name}'s auction (last seen $${live.price} by ${teamSummary(state, live.leaderId).name}). If it sold, enter it with Sold.`
  /**
   * ESPN streams NOMINATION -> BID... -> SOLD -> NOMINATION. A turn, or a bid on someone else,
   * while our block still holds an unsold player means its SOLD was lost (refresh, reconnect).
   */
  const onRaw = (raw: RawEvent) => {
    if (raw.kind === 'turn') {
      if (state.live) {
        alert = missedSale(state.live)
        apply({ type: 'clearLive' })
      }
      return
    }
    for (const ev of assembler.push(raw)) {
      const live = state.live
      if (ev.type === 'nominated' && live && live.playerKey !== ev.playerKey && !state.sales.some((x) => x.playerKey === live.playerKey)) {
        alert = missedSale(live)
      }
      apply(ev)
    }
  }
  /** A line counts toward health when it decodes, or is a verb we know to ignore; other verbs are counted for the panel. */
  const onLine = (line: string) => {
    const raw = decodeLine(line)
    if (raw?.kind === 'unknown') {
      unknownVerbs.set(raw.verb, (unknownVerbs.get(raw.verb) ?? 0) + 1)
      return
    }
    if (raw || NOISE_VERBS.has(line.split(/\s+/)[0])) lastRecognizedAt = now()
    if (raw) onRaw(raw)
  }
  publish()

  return {
    dispatch(ev) {
      apply(ev)
      publish()
    },
    dismissAlert() {
      alert = null
      publish()
    },
    getState: () => state,
    onFrame(frame) {
      frames.push(frame)
      if (frame.dir === 'in') for (const line of splitLines(frame.data)) onLine(line)
      publish()
    },
    recordingJson: () => JSON.stringify(buildRecording(deps.leagueId, startedAt, frames)),
    tick() {
      if (health() !== shownHealth) publish()
    },
    reset() {
      log = []
      clearLog()
      state = fresh()
      restoreBanner = null
      alert = null
      publish()
    },
  }
}
