import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Recording } from '../../src/capture/recording'
import type { JoshFixture } from '../../src/sim/replay'
import { createSession, defaultConfig, type SessionConfig, type SessionData } from '../../src/sim/session'
import type { PlayerValue } from '../../src/values/types'

const DATA: SessionData = {
  values: JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[],
  projections: null,
  recording: JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording,
  josh: JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as JoshFixture,
}
const config = (over: Partial<SessionConfig> = {}): SessionConfig => ({ ...defaultConfig(), ...over })
const FLAT_LINE = { pts: 1000, reb: 400, ast: 200, stl: 60, blk: 40, tpm: 100, to: 120, fgm: 400, fga: 850, ftm: 150, fta: 190 }

describe('session', () => {
  it('simulate + autopilot: finish runs the whole draft through the real controller', async () => {
    const s = await createSession(config({ autopilot: true }), DATA)
    s.finish()
    expect(s.done).toBe(true)
    expect(s.view.state.sales).toHaveLength(130)
    expect(s.view.state.sales.filter((x) => x.teamId === 1)).toHaveLength(13)
    expect(s.view.health).toBe('live')
    expect(s.view.alert).toBeNull()
    s.finish()
    expect(s.view.state.sales).toHaveLength(130)
  }, 60_000)

  it('manual: my bid goes through the sim and the panel sees me lead', async () => {
    const s = await createSession(config(), DATA)
    for (let i = 0; i < 100 && !s.block; i++) s.tick(250)
    expect(s.block).not.toBeNull()
    expect(s.myBid(s.block!.price)).toBe(`Bid must beat $${s.block!.price}`)
    const price = s.block!.price + 1
    expect(s.myBid(price)).toBeNull()
    expect(s.view.state.live).toMatchObject({ price, leaderId: 1 })
  })

  it('a manual draft still finishes: my turns time out and auto-nominate', async () => {
    const s = await createSession(config(), DATA)
    s.finish()
    expect(s.view.state.sales).toHaveLength(130)
  }, 60_000)

  it('step stops after exactly one more sale', async () => {
    const s = await createSession(config(), DATA)
    s.step()
    expect(s.view.state.sales).toHaveLength(1)
    s.step()
    expect(s.view.state.sales).toHaveLength(2)
  })

  it('speed scales the sim clock; pause stops it; instant finishes', async () => {
    const s = await createSession(config({ speed: 5 }), DATA)
    s.tick(1000)
    expect(s.time).toBe(5000)
    s.setSpeed(20)
    s.tick(100)
    expect(s.time).toBe(7000)
    s.setPaused(true)
    s.tick(1000)
    expect(s.time).toBe(7000)
    s.setPaused(false)
    s.setSpeed('instant')
    s.tick(16)
    expect(s.done).toBe(true)
  }, 60_000)

  it('notifies subscribers and stops after unsubscribe', async () => {
    const s = await createSession(config(), DATA)
    let calls = 0
    const off = s.subscribe(() => calls++)
    s.tick(100)
    expect(calls).toBe(1)
    off()
    s.tick(100)
    expect(calls).toBe(1)
  })

  it('replays the Josh mock: 156 sales on 12 teams, Josh is my team, no bidding', async () => {
    const s = await createSession(config({ mode: 'replay-josh' }), DATA)
    s.finish()
    expect(s.view.state.settings.teams).toHaveLength(12)
    expect(s.view.state.myTeamId).toBe(1)
    expect(s.view.state.sales).toHaveLength(156)
    expect(s.myBid(5)).toBe('Bidding works in simulate mode')
  })

  it('replays the recorded ESPN draft: 11 sales', async () => {
    const s = await createSession(config({ mode: 'replay-espn' }), DATA)
    s.finish()
    expect(s.view.state.sales).toHaveLength(11)
    expect(s.done).toBe(true)
  })

  it('standings: null without projections; ten H2H-scored teams with them', async () => {
    const plain = await createSession(config({ autopilot: true }), DATA)
    plain.finish()
    expect(plain.standings()).toBeNull()
    expect(plain.myResult().moneyLeft).toBeGreaterThanOrEqual(0)
    const scored = await createSession(config({ autopilot: true }), { ...DATA, projections: () => FLAT_LINE })
    scored.finish()
    const st = scored.standings()!
    expect(st).toHaveLength(10)
    expect(st.every((t) => t.missingProjections === 0)).toBe(true)
    // Equal projections, but each season's stats carry their own error: teams differ.
    expect(new Set(st.map((t) => t.winPct)).size).toBeGreaterThan(1)
    expect(st.reduce((s, t) => s + t.titlePct, 0)).toBeCloseTo(1, 9)
    expect(scored.standings()).toBe(st)
  }, 120_000)
})
