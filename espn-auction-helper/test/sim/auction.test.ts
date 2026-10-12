import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AuctionSim, MANUAL_AGENT, MIN_AFTER_BID_MS, NOMINATE_TIMEOUT_MS, runToEnd, START_MS, type MyAgent } from '../../src/sim/auction'
import { maxBid } from '../../src/sim/bots'
import { defaultOptions, ROSTER_SIZE, simPlayers, type SimOptions } from '../../src/sim/setup'
import type { PlayerValue } from '../../src/values/types'

const PLAYERS = simPlayers(JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[])

function runAll(o: SimOptions = defaultOptions(7), agent: MyAgent = MANUAL_AGENT) {
  const lines: Array<{ t: number; line: string }> = []
  const sim = new AuctionSim(o, PLAYERS, { onLine: (line, t) => lines.push({ t, line }) }, agent)
  runToEnd(sim)
  return { sim, lines }
}
const tokens = (line: string) => line.split(' ')

describe('AuctionSim', () => {
  it('completes with the manual agent: every roster full, budgets >= 0', () => {
    const { sim, lines } = runAll()
    expect(sim.done).toBe(true)
    expect(lines[0].line).toBe('STATE 1')
    expect(lines.at(-1)!.line).toBe('STATE 2')
    expect(sim.sales).toHaveLength(10 * ROSTER_SIZE)
    for (const t of sim.teams) {
      expect(t.roster).toHaveLength(ROSTER_SIZE)
      expect(t.budget).toBeGreaterThanOrEqual(0)
    }
  })

  it('never breaks the ESPN max-bid rule and never lets a full roster bid', () => {
    const { lines } = runAll(defaultOptions(11))
    const budget = new Map<number, number>()
    const count = new Map<number, number>()
    for (const { line } of lines) {
      const [verb, team, , a, b] = tokens(line)
      const id = Number(team)
      if (verb === 'BID') {
        const open = ROSTER_SIZE - (count.get(id) ?? 0)
        expect(open).toBeGreaterThan(0)
        expect(Number(a)).toBeLessThanOrEqual(maxBid(budget.get(id) ?? 200, open))
      }
      if (verb === 'SOLD') {
        budget.set(id, (budget.get(id) ?? 200) - Number(b))
        count.set(id, (count.get(id) ?? 0) + 1)
      }
    }
  })

  it('rotates nominations in draft order, skipping full rosters', () => {
    const o = defaultOptions(5)
    const { lines } = runAll(o)
    const count = new Map<number, number>()
    let last: number | null = null
    for (const { line } of lines) {
      const [verb, team] = tokens(line)
      if (verb === 'NOMINATION') {
        const order = o.pickOrder
        const start = last === null ? -1 : order.indexOf(last)
        const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          .map((step) => order[(start + step + order.length) % order.length])
          .find((id) => (count.get(id) ?? 0) < ROSTER_SIZE)
        expect(Number(team)).toBe(expected)
        last = Number(team)
      }
      if (verb === 'SOLD') count.set(Number(team), (count.get(Number(team)) ?? 0) + 1)
    }
  })

  it('runs the ESPN clock: 25 s to start, at least 10 s after the last bid', () => {
    const { lines } = runAll(defaultOptions(9))
    let opened = 0
    let lastBid = 0
    let afterNomination = false
    for (const { t, line } of lines) {
      const [verb, , , , , remaining] = tokens(line)
      if (verb === 'NOMINATION') afterNomination = true
      if (verb === 'BID') {
        if (afterNomination) {
          expect(Number(remaining)).toBe(START_MS)
          opened = t
          afterNomination = false
        }
        lastBid = t
      }
      if (verb === 'SOLD') {
        expect(t).toBeGreaterThanOrEqual(opened + START_MS)
        expect(t).toBeGreaterThanOrEqual(lastBid + MIN_AFTER_BID_MS)
      }
    }
  })

  it('my nomination times out to the top available player at $1', () => {
    const { lines } = runAll(defaultOptions(3))
    const i = lines.findIndex(({ line }) => line === `NOMINATION 1 ${NOMINATE_TIMEOUT_MS}`)
    const bid = lines[i + 1]
    expect(bid.t - lines[i].t).toBe(NOMINATE_TIMEOUT_MS)
    expect(tokens(bid.line).slice(0, 2)).toEqual(['BID', '1'])
    expect(tokens(bid.line)[3]).toBe('1')
  })

  it('is deterministic per seed', () => {
    expect(runAll(defaultOptions(21)).lines).toEqual(runAll(defaultOptions(21)).lines)
    expect(runAll(defaultOptions(21)).lines).not.toEqual(runAll(defaultOptions(22)).lines)
  })

  it('validates my bids and nominations against ESPN rules', () => {
    const sim = new AuctionSim(defaultOptions(4), PLAYERS, { onLine: () => {} })
    expect(sim.myBid(5)).toBe('Nothing is on the block')
    expect(sim.myNominate(PLAYERS[0].espnId, 1)).toBe('Not your turn to nominate')
    while (!sim.block) sim.advanceTo(sim.nextEventAt()!)
    const b = sim.block
    expect(sim.myBid(b.price)).toBe(`Bid must beat $${b.price}`)
    expect(sim.myBid(500)).toBe('Your max bid is $188')
    expect(sim.myBid(b.price + 1)).toBeNull()
    expect(sim.block!.leaderId).toBe(1)
    expect(sim.myBid(b.price + 2)).toBe('You already lead')
  })

  it('an agent that bids follows its cap', () => {
    const greedy: MyAgent = { reactionMs: 500, nominate: () => null, bidCap: () => 3 }
    const { sim } = runAll(defaultOptions(8), greedy)
    expect(sim.sales.filter((x) => x.teamId === 1).every((x) => x.price <= 3)).toBe(true)
  })
})
