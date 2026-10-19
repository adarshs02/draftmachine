import type { Recording } from '../capture/recording'
import { createController, type View } from '../controller'
import { teamSummary, valueOf } from '../engine/metrics'
import type { DraftEvent } from '../engine/types'
import type { KeyValueStore } from '../storage'
import type { PlayerValue } from '../values/types'
import { AuctionSim, MANUAL_AGENT, type Block } from './auction'
import { createAgent } from './policies'
import { espnRecordingReplay, joshReplay, type JoshFixture, type ReplayLine } from './replay'
import { scoreTeams, truthFrom, type ProjectionSource, type TeamScore } from './score'
import { defaultOptions, SIM_SWID, simLeague, simPlayers, simTeams, type SimOptions } from './setup'
import type { SimPlayer } from './types'

export type Speed = 1 | 5 | 20 | 'instant'
export const SPEEDS: readonly Speed[] = [1, 5, 20, 'instant']
export type Mode = 'simulate' | 'replay-espn' | 'replay-josh'
export const MODES: readonly Mode[] = ['simulate', 'replay-espn', 'replay-josh']

export interface SessionConfig {
  mode: Mode
  options: SimOptions
  speed: Speed
  /** simulate mode: my team follows the panel's calls */
  autopilot: boolean
}

export interface SessionData {
  values: PlayerValue[]
  projections: ProjectionSource | null
  recording: Recording
  josh: JoshFixture
}

export interface MyResult {
  moneyLeft: number
  /** sum over my roster of projected value (PlayerValue.consensus) minus price paid */
  valueCaptured: number
}

export interface Session {
  readonly config: SessionConfig
  /** sim ms since the draft started */
  readonly time: number
  readonly paused: boolean
  readonly done: boolean
  /** what the real panel shows */
  readonly view: View
  /** simulate mode: the block with its clock, for the countdown */
  readonly block: Block | null
  /** simulate mode: my turn to nominate */
  readonly myTurn: boolean
  readonly speed: Speed
  readonly autopilot: boolean
  available(): readonly SimPlayer[]
  /** Advances sim time by real ms x speed (instant: to the end) and renders once. */
  tick(realMs: number): void
  /** Runs until one more player is sold (or the draft ends). */
  step(): void
  /** Runs to the end of the draft. */
  finish(): void
  setPaused(paused: boolean): void
  setSpeed(speed: Speed): void
  setAutopilot(on: boolean): void
  myBid(amount: number): string | null
  myNominate(espnId: number, amount: number): string | null
  /** events from the Panel (pick my team) */
  dispatch(ev: DraftEvent): boolean
  dismissAlert(): void
  refresh(): void
  subscribe(fn: () => void): () => void
  /** projected H2H each-category standings, or null without projections */
  standings(): TeamScore[] | null
  myResult(): MyResult
}

export const defaultConfig = (): SessionConfig => ({ mode: 'simulate', options: { ...defaultOptions(1), emitClock: true }, speed: 5, autopilot: false })

const SIM_LEAGUE_ID = 0
const SIM_URL = 'wss://simulator.local/draft'
const SIM_ONLY = 'Bidding works in simulate mode'
/** Events a finish or step may run before giving up: far above a real draft (a few thousand). */
export const FINISH_GUARD = 1_000_000

interface Driver {
  done(): boolean
  nextAt(): number | null
  advanceTo(t: number): void
}

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

function lineDriver(lines: readonly ReplayLine[], push: (line: string, t: number) => void): Driver {
  let i = 0
  return {
    done: () => i >= lines.length,
    nextAt: () => (i < lines.length ? lines[i].t : null),
    advanceTo(t) {
      for (; i < lines.length && lines[i].t <= t; i++) push(lines[i].line, lines[i].t)
    },
  }
}

/** One draft on the page: the auction (or a replay) feeds the real controller line by line on one sim clock. */
export async function createSession(config: SessionConfig, data: SessionData): Promise<Session> {
  const replay = config.mode === 'replay-espn' ? espnRecordingReplay(data.recording) : config.mode === 'replay-josh' ? joshReplay(data.josh, data.values) : null
  const values = replay?.values ?? data.values
  const options: SimOptions = { ...config.options, emitClock: true }
  /** seasons are scored on the projections plus error drawn from this draft's seed */
  const truth = data.projections ? truthFrom(data.projections, options.seed) : null
  const league = replay?.league ?? simLeague(options, simTeams(options))
  let time = 0
  let view: View | null = null
  let dirty = false
  let paused = false
  let speed = config.speed
  let autopilot = !replay && config.autopilot
  /** standings for the sales they were computed from: 400 simulated seasons is too slow for every render */
  let scored: { sales: readonly unknown[]; standings: TeamScore[] } | null = null
  const listeners = new Set<() => void>()

  const controller = await createController({
    leagueId: SIM_LEAGUE_ID,
    storage: memoryStore(),
    backup: memoryStore(),
    persist: false,
    values,
    cookie: `SWID=${SIM_SWID}`,
    loadLeague: async () => league,
    render: (v) => {
      view = v
    },
    now: () => time,
  })
  const push = (line: string, t: number) => {
    time = t
    controller.onFrame({ dir: 'in', data: line, t, url: SIM_URL }, { quiet: true })
    dirty = true
  }

  const keyToEspn = new Map(values.flatMap((v) => (v.espnId === null ? [] : [[v.key, v.espnId] as const])))
  const espnToKey = new Map([...keyToEspn].map(([key, id]) => [id, key] as const))
  const source = {
    get state() {
      return controller.getState()
    },
    keyOf: (id: number) => espnToKey.get(id) ?? `espn:${id}`,
  }

  let sim: AuctionSim | null = null
  let players: SimPlayer[] = []
  const agentFor = (on: boolean) => (on ? createAgent('autopilot', source, players) : MANUAL_AGENT)
  let driver: Driver
  if (replay) {
    driver = lineDriver(replay.lines, push)
  } else {
    players = simPlayers(values)
    const s = new AuctionSim(options, players, { onLine: push }, agentFor(autopilot))
    sim = s
    driver = { done: () => s.done, nextAt: () => s.nextEventAt(), advanceTo: (t) => s.advanceTo(t) }
  }

  const notify = () => listeners.forEach((fn) => fn())
  const settle = () => {
    if (dirty) {
      dirty = false
      controller.refresh()
    } else {
      controller.tick()
    }
    notify()
  }
  const advanceTo = (t: number) => {
    driver.advanceTo(t)
    // A finished draft keeps its clock at the last line, so the panel stays live.
    if (!driver.done()) time = Math.max(time, t)
  }
  const salesCount = () => controller.getState().sales.length
  /** Runs events until `stop()` or the end; the guard turns a runaway loop into an error instead of a hung tab. */
  const runUntil = (stop: () => boolean) => {
    for (let i = 0; !driver.done() && !stop(); i++) {
      if (i >= FINISH_GUARD) throw new Error('simulation did not finish')
      const next = driver.nextAt()
      if (next === null) break
      advanceTo(next)
    }
    settle()
  }

  const session: Session = {
    config,
    get time() {
      return time
    },
    get paused() {
      return paused
    },
    get done() {
      return driver.done()
    },
    get view() {
      return view!
    },
    get block() {
      return sim?.block ?? null
    },
    get myTurn() {
      return sim !== null && !sim.done && !sim.block && sim.onClock === sim.myTeamId
    },
    get speed() {
      return speed
    },
    get autopilot() {
      return autopilot
    },
    available: () => sim?.available ?? [],
    tick(realMs) {
      if (paused || driver.done()) return
      const s = speed
      if (s === 'instant') return session.finish()
      advanceTo(time + realMs * s)
      settle()
    },
    step() {
      const target = salesCount() + 1
      runUntil(() => salesCount() >= target)
    },
    finish() {
      runUntil(() => false)
    },
    setPaused(p) {
      paused = p
      notify()
    },
    setSpeed(s) {
      speed = s
      notify()
    },
    setAutopilot(on) {
      if (!sim) return
      autopilot = on
      sim.setAgent(agentFor(on))
      settle()
    },
    myBid(amount) {
      if (!sim) return SIM_ONLY
      const error = sim.myBid(amount)
      settle()
      return error
    },
    myNominate(espnId, amount) {
      if (!sim) return SIM_ONLY
      const error = sim.myNominate(espnId, amount)
      settle()
      return error
    },
    dispatch(ev) {
      const changed = controller.dispatch(ev)
      notify()
      return changed
    },
    dismissAlert() {
      controller.dismissAlert()
      notify()
    },
    refresh() {
      controller.refresh()
      notify()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    standings() {
      if (!truth) return null
      const state = controller.getState()
      const rosters = new Map(state.settings.teams.map((t) => [t.id, [] as number[]]))
      // -1: a player with no ESPN id counts as missing a projection.
      if (scored?.sales === state.sales) return scored.standings
      for (const x of state.sales) rosters.get(x.teamId)?.push(keyToEspn.get(x.playerKey) ?? -1)
      scored = { sales: state.sales, standings: scoreTeams(rosters, truth, options.seed) }
      return scored.standings
    },
    myResult() {
      const state = controller.getState()
      const me = state.myTeamId
      if (me === null) return { moneyLeft: 0, valueCaptured: 0 }
      const mine = state.sales.filter((x) => x.teamId === me)
      return {
        moneyLeft: teamSummary(state, me).budgetLeft,
        valueCaptured: mine.reduce((sum, x) => sum + valueOf(state, x.playerKey).consensus - x.price, 0),
      }
    },
  }
  return session
}
