import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toSettings } from '../../src/espn/league'
import { AuctionSim, runToEnd } from '../../src/sim/auction'
import { defaultOptions, simLeague, simPlayers, simTeams } from '../../src/sim/setup'
import { createTracker } from '../../src/sim/tracker'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]

describe('tracker', () => {
  it.each([1, 2, 3])('round trip (seed %i): the real decoder + engine rebuild the sim ledger exactly', (seed) => {
    const o = defaultOptions(seed)
    const tracker = createTracker(VALUES, toSettings(simLeague(o, simTeams(o))), o.myTeamId)
    const sim = new AuctionSim(o, simPlayers(VALUES), { onLine: (line) => tracker.push(line) })
    runToEnd(sim)
    expect(tracker.state.sales.map((x) => [x.playerKey, x.teamId, x.price])).toEqual(
      sim.sales.map((x) => [tracker.keyOf(x.espnId), x.teamId, x.price]),
    )
    expect(tracker.state.live).toBeNull()
  })

  it('follows the block and the nominating team as lines arrive', () => {
    const o = defaultOptions(1)
    const tracker = createTracker(VALUES, toSettings(simLeague(o, simTeams(o))), o.myTeamId)
    const sim = new AuctionSim(o, simPlayers(VALUES), { onLine: (line) => tracker.push(line) })
    expect(tracker.state.turnTeamId).toBe(7)
    while (!sim.block) sim.advanceTo(sim.nextEventAt()!)
    expect(tracker.state.live).toEqual({ playerKey: tracker.keyOf(sim.block.espnId), price: sim.block.price, leaderId: sim.block.leaderId })
  })
})
