import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNABLES, resetTunables, setTunables } from '../../src/engine/constants'
import { fitFor } from '../../src/engine/fit'
import { reduce } from '../../src/engine/reducer'
import { verdict } from '../../src/engine/verdict'
import { toSettings } from '../../src/espn/league'
import { AuctionSim, runToEnd } from '../../src/sim/auction'
import { marketPrice } from '../../src/sim/bots'
import { autopilotCap, createAgent, inertForAutopilot } from '../../src/sim/policies'
import { runDraft } from '../../src/sim/run'
import { defaultOptions, simLeague, simPlayers, simTeams } from '../../src/sim/setup'
import { createTracker } from '../../src/sim/tracker'
import type { PlayerValue } from '../../src/values/types'
import { build, nominated, pv, settings, sold } from '../helpers'
import { FIT_S, FIT_V } from '../engine/fitFixture'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const PLAYERS = simPlayers(VALUES)
const O = defaultOptions(1)
const SETTINGS = toSettings(simLeague(O, simTeams(O)))

/** A tracker after `sales` sales of a market-baseline draft, to test on mid-draft states too. */
function trackerAfter(sales: number) {
  const tracker = createTracker(VALUES, SETTINGS, O.myTeamId)
  const sim = new AuctionSim(O, PLAYERS, { onLine: (line) => tracker.push(line) }, createAgent('market', tracker, PLAYERS))
  while (!sim.done && sim.sales.length < sales) sim.advanceTo(sim.nextEventAt()!)
  return { tracker, sim }
}

describe('autopilotCap', () => {
  it('is 0 for a player the panel says to save the slot on', () => {
    const s = build(settings(4, { lineupSlotCounts: { 12: 13 } }), [pv('Alpha', 30), pv('Cheap', 5)], [nominated('Cheap', 2, 1)])
    expect(autopilotCap(s, 'cheap')).toBe(0)
  })

  it.each([0, 40, 90])('matches the panel exactly: BID or BID UP <=> price + 1 <= cap (after %i sales)', (sales) => {
    const { tracker, sim } = trackerAfter(sales)
    const base = { ...tracker.state, live: null }
    for (const p of sim.available.slice(0, 25)) {
      const key = tracker.keyOf(p.espnId)
      const at = (price: number) => reduce(base, { type: 'nominated', playerKey: key, teamId: 7, amount: price })
      // The agent computes the cap once, when the player opens at $1.
      const cap = autopilotCap(at(1), key)
      for (let price = 1; price <= 60; price++) {
        const kind = verdict(at(price))!.kind
        expect([price, kind, price + 1 <= cap]).toEqual([price, kind, kind === 'BID' || kind === 'BID_UP'])
      }
    }
  })
})

describe('agents', () => {
  it('market bids to the market price; consensus to the consensus value', () => {
    const { tracker, sim } = trackerAfter(0)
    while (!sim.block) sim.advanceTo(sim.nextEventAt()!)
    const p = PLAYERS.find((x) => x.espnId === sim.block!.espnId)!
    expect(createAgent('market', tracker, PLAYERS).bidCap(sim)).toBe(Math.round(marketPrice(p)))
    expect(createAgent('consensus', tracker, PLAYERS).bidCap(sim)).toBe(Math.round(p.consensus))
  })

  it('autopilot nominates an available player and plays a whole draft within ESPN rules', () => {
    const tracker = createTracker(VALUES, SETTINGS, O.myTeamId)
    const agent = createAgent('autopilot', tracker, PLAYERS)
    const sim = new AuctionSim(O, PLAYERS, { onLine: (line) => tracker.push(line) }, agent)
    runToEnd(sim)
    const me = sim.teams.find((t) => t.id === 1)!
    expect(me.roster).toHaveLength(13)
    expect(me.budget).toBeGreaterThanOrEqual(0)
    expect(sim.sales.filter((x) => x.teamId === 1).length).toBe(13)
  })
})

const runDraftAtDefaults = () => {
  resetTunables()
  return runDraft({ seed: 2, policy: 'autopilot', values: VALUES, projections: null }).sales
}

describe('inertForAutopilot', () => {
  it('names the tunables that only change what the panel shows', () => {
    expect(inertForAutopilot(DEFAULT_TUNABLES)).toEqual(['BARGAIN_RATIO', 'BID_GAP_MIN', 'BID_GAP_FRACTION', 'ONE_PLAYER_SHARE', 'TWO_PLAYER_SHARE'])
    // A gap below BID_UP_MARGIN + 1 makes BID bid past BID UP's limit.
    expect(inertForAutopilot({ ...DEFAULT_TUNABLES, BID_GAP_MIN: 2 })).not.toContain('BID_GAP_FRACTION')
    setTunables({ BID_GAP_MIN: 1 })
    try {
      expect(runDraft({ seed: 2, policy: 'autopilot', values: VALUES, projections: null }).sales).not.toEqual(runDraftAtDefaults())
    } finally {
      resetTunables()
    }
  })

  it('names FIT_MIN and FIT_MAX when category fit is off', () => {
    expect(inertForAutopilot(DEFAULT_TUNABLES)).not.toContain('FIT_MIN')
    expect(inertForAutopilot({ ...DEFAULT_TUNABLES, FIT_WEIGHT: 0 })).toEqual(expect.arrayContaining(['FIT_MIN', 'FIT_MAX']))
  })

  it('changing an inert tunable leaves an autopilot draft unchanged', () => {
    const base = runDraft({ seed: 2, policy: 'autopilot', values: VALUES, projections: null }).sales
    try {
      for (const name of inertForAutopilot(DEFAULT_TUNABLES)) {
        setTunables({ [name]: DEFAULT_TUNABLES[name] * 1.5 }) // up keeps BID_GAP_MIN >= BID_UP_MARGIN + 1
        expect([name, runDraft({ seed: 2, policy: 'autopilot', values: VALUES, projections: null }).sales]).toEqual([name, base])
        resetTunables()
      }
    } finally {
      resetTunables()
    }
  }, 60_000)
})

describe('autopilotCap with category fit', () => {
  it('bids less for a player my roster gets little from, and FIT_WEIGHT 0 restores the old cap', () => {
    // Far behind in FT%: a good FT shooter helps me less than the typical player left.
    const s = build(FIT_S, FIT_V, [sold('Brick1', 1, 20), sold('Brick2', 1, 20), sold('Brick3', 1, 20), nominated('Shooter', 2, 1)])
    expect(fitFor(s, 'shooter')!.mult).toBeLessThan(0.9)
    const withFit = autopilotCap(s, 'shooter')
    setTunables({ FIT_WEIGHT: 0 })
    const without = autopilotCap(s, 'shooter')
    resetTunables()
    expect(withFit).toBeLessThan(without)
  })
})
