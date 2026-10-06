import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createController, LIVE_WINDOW_MS, type ControllerDeps, type View } from '../src/controller'
import { parseLeague } from '../src/espn/league'
import { GRAMMAR } from '../src/capture/decoder'
import type { Recording } from '../src/capture/recording'
import { lineFor, memoryStore, nominated, pv, sold } from './helpers'

const LEAGUE = parseLeague(JSON.parse(readFileSync('test/fixtures/league-settings.json', 'utf8')))
const COOKIE = 'SWID={AAAAAAAA-0000-0000-0000-000000000001}'

async function make(over: Partial<ControllerDeps> = {}) {
  const views: View[] = []
  const deps: ControllerDeps = {
    leagueId: 7,
    storage: memoryStore(),
    backup: memoryStore(),
    values: [pv('Alpha', 30), pv('Bravo', 20)],
    cookie: COOKIE,
    loadLeague: async () => LEAGUE,
    render: (v) => views.push(v),
    ...over,
  }
  return { c: await createController(deps), views, deps }
}

describe('createController', () => {
  it('renders on start with league settings and my team', async () => {
    const { views } = await make()
    expect(views).toHaveLength(1)
    expect(views[0].state.settings.teams).toHaveLength(10)
    expect(views[0].state.myTeamId).toBe(1)
    expect(views[0]).toMatchObject({ health: 'manual', banner: null, alert: null, unknownVerbs: {}, frameCount: 0 })
  })

  it('falls back to a default league with a banner when ESPN fails', async () => {
    const { views } = await make({ loadLeague: async () => { throw new Error('ESPN returned 401: log in to ESPN in this browser') } })
    expect(views[0].banner).toContain('unavailable')
    expect(views[0].state.settings.teams).toHaveLength(10)
    expect(views[0].state.myTeamId).toBeNull()
  })

  it('warns when the league is not an auction', async () => {
    const { views } = await make({ loadLeague: async () => ({ ...LEAGUE, draftType: 'SNAKE' }) })
    expect(views[0].banner).toContain('SNAKE')
  })

  it('dispatch re-renders and persists; a reload restores the draft', async () => {
    const first = await make()
    first.c.dispatch(nominated('Alpha', 2, 1))
    first.c.dispatch(sold('Alpha', 2, 12))
    expect(first.views).toHaveLength(3)
    const second = await make({ storage: first.deps.storage })
    expect(second.c.getState().sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 2, price: 12 }])
  })

  it('starts clean from corrupt storage', async () => {
    const { c } = await make({ storage: memoryStore({ 'eah:7:events': '{oops' }) })
    expect(c.getState().sales).toEqual([])
  })

  it('skips null and unknown events in a stored log', async () => {
    const { c, views } = await make({ storage: memoryStore({ 'eah:7:events': '[null, {"type":"bogus"}]' }) })
    expect(c.getState().sales).toEqual([])
    expect(c.getState().live).toBeNull()
    expect(views[0].banner).toBeNull()
  })

  it('discards a stored log it cannot replay and says so', async () => {
    // A value that cannot be turned into a number makes Math.max throw inside reduce.
    const poison = '{"type":"setValue","playerKey":"alpha","b":{"valueOf":1,"toString":1}}'
    const storage = memoryStore({ 'eah:7:events': `[${JSON.stringify(sold('Alpha', 2, 12))}, ${poison}]` })
    const { c, views } = await make({ storage })
    expect(c.getState().sales).toEqual([])
    expect(views[0].banner).toBe('Saved draft could not be restored; starting fresh')
    expect(storage.data['eah:7:events']).toBeUndefined()
    c.dispatch(sold('Bravo', 3, 5))
    expect(JSON.parse(storage.data['eah:7:events'])).toEqual([sold('Bravo', 3, 5)])
  })

  it('treats a league with fewer than 2 teams as unavailable', async () => {
    const { views } = await make({ loadLeague: async () => ({ ...LEAGUE, teams: [] }) })
    expect(views[0].banner).toContain('unavailable')
    expect(views[0].state.settings.teams).toHaveLength(10)
  })

  it('falls back with a banner when the league has a shape it cannot read', async () => {
    const odd = { ...LEAGUE, teams: LEAGUE.teams.map((t) => ({ ...t, owners: null as unknown as string[] })) }
    const { views } = await make({ loadLeague: async () => odd })
    expect(views[0].banner).toContain('unavailable')
    expect(views[0].state.settings.teams).toHaveLength(10)
    expect(views[0].state.myTeamId).toBeNull()
  })
})

describe('saved draft', () => {
  const KEY = 'eah:7:events'

  it('writes the log to both the tab session and the browser backup', async () => {
    const { c, deps } = await make()
    c.dispatch(sold('Alpha', 2, 12))
    expect(JSON.parse(deps.storage.getItem(KEY)!)).toEqual([sold('Alpha', 2, 12)])
    expect(JSON.parse(deps.backup.getItem(KEY)!)).toEqual([sold('Alpha', 2, 12)])
  })

  it('restores from the browser backup when the tab session is empty, with a banner', async () => {
    const backup = memoryStore({ [KEY]: JSON.stringify([nominated('Alpha', 2, 1), sold('Alpha', 2, 12), sold('Bravo', 3, 8)]) })
    const { c, views } = await make({ backup })
    expect(c.getState().sales.map((x) => x.playerKey)).toEqual(['alpha', 'bravo'])
    expect(views[0].banner).toBe('Restored 2 saved sales from this browser — use New draft to start over')
  })

  it('prefers the tab session over the backup', async () => {
    const storage = memoryStore({ [KEY]: JSON.stringify([sold('Alpha', 2, 12)]) })
    const backup = memoryStore({ [KEY]: JSON.stringify([sold('Bravo', 3, 8)]) })
    const { c, views } = await make({ storage, backup })
    expect(c.getState().sales.map((x) => x.playerKey)).toEqual(['alpha'])
    expect(views[0].banner).toBeNull()
  })

  it('reset clears both stores and the draft, keeping the league and my team', async () => {
    const backup = memoryStore({ [KEY]: JSON.stringify([sold('Alpha', 2, 12)]) })
    const { c, views, deps } = await make({ backup })
    c.dispatch(sold('Bravo', 3, 8))
    c.reset()
    expect(c.getState().sales).toEqual([])
    expect(c.getState()).toMatchObject({ myTeamId: 1, live: null })
    expect(c.getState().settings.teams).toHaveLength(10)
    expect(deps.storage.getItem(KEY)).toBeNull()
    expect(deps.backup.getItem(KEY)).toBeNull()
    expect(views.at(-1)!.state.sales).toEqual([])
    expect(views.at(-1)!.banner).toBeNull()
    c.dispatch(sold('Alpha', 4, 20))
    expect(JSON.parse(deps.backup.getItem(KEY)!)).toEqual([sold('Alpha', 4, 20)])
  })
})

describe('socket frames', () => {
  it('records frames and offers them as a recording', async () => {
    const { c, views } = await make()
    c.onFrame({ dir: 'in', data: 'CLOCK 6 85495 1', t: 1, url: 'wss://fantasydraft.espn.com/x' })
    expect(views.at(-1)!.frameCount).toBe(1)
    expect(JSON.parse(c.recordingJson())).toMatchObject({ leagueId: 7, frames: [{ data: 'CLOCK 6 85495 1' }] })
  })
})

describe('live decoding', () => {
  const bid = (dir: 'in' | 'out') => ({ dir, data: lineFor(GRAMMAR.bid, { team: 2, player: 3112335, amount: 1 }), t: 1, url: 'wss://fantasydraft.espn.com/x' })

  it('decodes incoming frames into draft events and goes live', async () => {
    const { c, views } = await make({ values: [pv('Alpha', 30, { espnId: 3112335 }), pv('Bravo', 20)] })
    c.onFrame(bid('in'))
    expect(views.at(-1)!.health).toBe('live')
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 1, leaderId: 2 })
  })

  it('records outgoing frames without decoding them', async () => {
    const { c, views } = await make({ values: [pv('Alpha', 30, { espnId: 3112335 })] })
    c.onFrame(bid('out'))
    expect(views.at(-1)!.health).toBe('manual')
    expect(c.getState().live).toBeNull()
    expect(views.at(-1)!.frameCount).toBe(1)
  })

  it('live events persist to the same log', async () => {
    const { c, deps } = await make({ values: [pv('Alpha', 30, { espnId: 3112335 })] })
    c.onFrame(bid('in'))
    expect(JSON.parse(deps.storage.getItem('eah:7:events')!)).toEqual([nominated('Alpha', 2, 1)])
  })
})

describe('live sequence against the panel state', () => {
  const ALPHA = 3112335
  const values = () => [pv('Alpha', 30, { espnId: ALPHA }), pv('Bravo', 20, { espnId: 42 })]
  const line = (team: number, amount: number, player = ALPHA) => ({ dir: 'in' as const, data: lineFor(GRAMMAR.bid, { team, player, amount }), t: 1, url: 'wss://fantasydraft.espn.com/x' })
  const soldLine = (team: number, amount: number) => ({ dir: 'in' as const, data: lineFor(GRAMMAR.sold, { team, player: ALPHA, amount }), t: 1, url: 'wss://fantasydraft.espn.com/x' })
  const KEY = 'eah:7:events'

  it('after a reload mid-auction a live bid raises the price and a stale lower bid is ignored', async () => {
    const first = await make({ values: values() })
    first.c.dispatch(nominated('Alpha', 2, 20))
    const { c, deps } = await make({ values: values(), storage: first.deps.storage })
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 20, leaderId: 2 })
    c.onFrame(line(3, 25))
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 25, leaderId: 3 })
    expect(JSON.parse(deps.storage.getItem(KEY)!).at(-1)).toEqual({ type: 'bid', teamId: 3, amount: 25 })
    c.onFrame(line(4, 15))
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 25, leaderId: 3 })
  })

  it('after a manual clearLive a live bid on the same player nominates it again', async () => {
    const { c } = await make({ values: values() })
    c.dispatch(nominated('Alpha', 2, 5))
    c.dispatch({ type: 'clearLive' })
    c.onFrame(line(3, 7))
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 7, leaderId: 3 })
  })

  it('BID(new) then BID then SOLD makes one sale with the SOLD price and the mapped key', async () => {
    const { c } = await make({ values: values() })
    c.onFrame(line(2, 1))
    c.onFrame(line(3, 9))
    c.onFrame(soldLine(3, 11))
    expect(c.getState().sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 3, price: 11 }])
    expect(c.getState().live).toBeNull()
  })

  it('a repeated identical BID frame does not grow the persisted log', async () => {
    const { c, deps } = await make({ values: values() })
    c.onFrame(line(2, 1))
    c.onFrame(line(3, 9))
    c.onFrame(line(3, 9))
    expect(JSON.parse(deps.storage.getItem(KEY)!)).toHaveLength(2)
    expect(JSON.parse(deps.backup.getItem(KEY)!)).toHaveLength(2)
  })

  it('manual dispatch of a no-op event is not logged either', async () => {
    const { c, deps } = await make({ values: values() })
    c.dispatch({ type: 'clearLive' })
    expect(deps.storage.getItem(KEY)).toBeNull()
  })

  it('dispatch says whether the event changed anything', async () => {
    const { c } = await make({ values: values() })
    expect(c.dispatch(nominated('Alpha', 2, 5))).toBe(true)
    expect(c.dispatch({ type: 'bid', teamId: 3, amount: 4 })).toBe(false)
    expect(c.dispatch({ type: 'bid', teamId: 3, amount: 6 })).toBe(true)
  })

  it("ESPN's SOLD corrects a manual sale with a different team or price, and says so", async () => {
    const { c, views, deps } = await make({ values: values() })
    c.dispatch(sold('Alpha', 3, 20))
    c.onFrame(soldLine(4, 24))
    expect(c.getState().sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 4, price: 24 }])
    expect(views.at(-1)!.alert).toBe('Corrected Alpha: ESPN says T4 $24')
    expect(JSON.parse(deps.storage.getItem(KEY)!).at(-1)).toEqual({ type: 'editSale', seq: 1, teamId: 4, price: 24 })
  })

  it("ESPN's SOLD matching a manual sale changes nothing", async () => {
    const { c, views, deps } = await make({ values: values() })
    c.dispatch(sold('Alpha', 4, 24))
    c.onFrame(soldLine(4, 24))
    expect(c.getState().sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 4, price: 24 }])
    expect(views.at(-1)!.alert).toBeNull()
    expect(JSON.parse(deps.storage.getItem(KEY)!)).toHaveLength(1)
  })
})

describe('missed end of an auction', () => {
  const ALPHA = 3112335
  const BRAVO = 42
  const KEY = 'eah:7:events'
  const values = () => [pv('Alpha', 30, { espnId: ALPHA }), pv('Bravo', 20, { espnId: BRAVO })]
  const frame = (data: string) => ({ dir: 'in' as const, data, t: 1, url: 'wss://fantasydraft.espn.com/x' })
  /** A reload whose saved log ends with Alpha still on the block at $25 by T3. */
  const reloaded = () => make({ values: values(), storage: memoryStore({ [KEY]: JSON.stringify([nominated('Alpha', 2, 1), { type: 'bid', teamId: 3, amount: 25 }]) }) })
  const MISSED_ALPHA = "Missed the end of Alpha's auction (last seen $25 by T3). If it sold, enter it with Sold."

  it('a NOMINATION turn while a player is still on the block clears the block and raises an alert', async () => {
    const { c, views, deps } = await reloaded()
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 25, leaderId: 3 })
    c.onFrame(frame('NOMINATION 4 30000'))
    expect(c.getState().live).toBeNull()
    expect(views.at(-1)!.alert).toBe(MISSED_ALPHA)
    expect(JSON.parse(deps.storage.getItem(KEY)!).slice(-2)).toEqual([{ type: 'clearLive' }, { type: 'turn', teamId: 4 }])
  })

  it('a NOMINATION turn is applied, logged and survives a reload', async () => {
    const { c, deps } = await make({ values: values() })
    c.onFrame(frame('NOMINATION 3 30000'))
    expect(c.getState().turnTeamId).toBe(3)
    expect(JSON.parse(deps.storage.getItem(KEY)!)).toEqual([{ type: 'turn', teamId: 3 }])
    c.onFrame(frame('NOMINATION 3 25000'))
    expect(JSON.parse(deps.storage.getItem(KEY)!)).toHaveLength(1)
    const again = await make({ values: values(), storage: deps.storage })
    expect(again.c.getState().turnTeamId).toBe(3)
  })

  it('a NOMINATION turn that clears a missed sale still applies the turn', async () => {
    const { c } = await reloaded()
    c.onFrame(frame('NOMINATION 4 30000'))
    expect(c.getState().live).toBeNull()
    expect(c.getState().turnTeamId).toBe(4)
  })

  it('a BID on another player while one is still on the block raises the alert and nominates the new player', async () => {
    const { c, views } = await reloaded()
    c.onFrame(frame(lineFor(GRAMMAR.bid, { team: 5, player: BRAVO, amount: 1 })))
    expect(c.getState().live).toEqual({ playerKey: 'bravo', price: 1, leaderId: 5 })
    expect(views.at(-1)!.alert).toBe(MISSED_ALPHA)
  })

  it('the real order (BID, SOLD, NOMINATION, BID) raises no alert', async () => {
    const { c, views } = await make({ values: values() })
    c.onFrame(frame(lineFor(GRAMMAR.bid, { team: 2, player: ALPHA, amount: 1 })))
    c.onFrame(frame(`${lineFor(GRAMMAR.sold, { team: 3, player: ALPHA, amount: 9 })}\nNOMINATION 4 30000`))
    c.onFrame(frame(lineFor(GRAMMAR.bid, { team: 4, player: BRAVO, amount: 1 })))
    expect(c.getState().sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 3, price: 9 }])
    expect(c.getState().live).toEqual({ playerKey: 'bravo', price: 1, leaderId: 4 })
    expect(views.at(-1)!.alert).toBeNull()
  })

  it('keeps the alert until it is dismissed', async () => {
    const { c, views } = await reloaded()
    c.onFrame(frame('NOMINATION 4 30000'))
    c.onFrame(frame('CLOCK 6 85495 1'))
    c.dispatch(nominated('Bravo', 4, 1))
    expect(views.at(-1)!.alert).toBe(MISSED_ALPHA)
    c.dismissAlert()
    expect(views.at(-1)!.alert).toBeNull()
  })
})

describe('health', () => {
  const frame = (data: string, dir: 'in' | 'out' = 'in') => ({ dir, data, t: 1, url: 'wss://fantasydraft.espn.com/x' })
  /** A clock the test moves by hand. */
  const clock = () => {
    const box = { t: 1_000_000 }
    return { box, now: () => box.t }
  }

  it('is live while recognized lines arrive and drops to manual once none came for 20 s', async () => {
    const { box, now } = clock()
    const { c, views } = await make({ now })
    c.onFrame(frame('CLOCK 6 85495 1'))
    expect(views.at(-1)!.health).toBe('live')
    const shown = views.length
    box.t += LIVE_WINDOW_MS - 1
    c.tick()
    expect(views).toHaveLength(shown) // nothing changed: no re-render
    box.t += 1
    c.tick()
    expect(views).toHaveLength(shown + 1)
    expect(views.at(-1)!.health).toBe('manual')
    c.tick()
    expect(views).toHaveLength(shown + 1)
  })

  it('a decoded BID, a NOMINATION turn and PONG each keep it live', async () => {
    const { box, now } = clock()
    const { c, views } = await make({ now, values: [pv('Alpha', 30, { espnId: 3112335 })] })
    for (const data of [lineFor(GRAMMAR.bid, { team: 2, player: 3112335, amount: 1 }), 'NOMINATION 4 30000', 'PONG PING%201']) {
      box.t += LIVE_WINDOW_MS - 1
      c.tick()
      c.onFrame(frame(data))
      expect(views.at(-1)!.health).toBe('live')
    }
  })

  it('outgoing frames and unknown verbs do not count as live', async () => {
    const { now } = clock()
    const { c, views } = await make({ now })
    c.onFrame(frame('CLOCK 6 85495 1', 'out'))
    c.onFrame(frame('ZZZ_NEW 1 2'))
    expect(views.at(-1)!.health).toBe('manual')
  })

  it('counts unknown verbs per verb', async () => {
    const { c, views } = await make()
    c.onFrame(frame('ZZZ_NEW 1 2\nCLOCK 6 1 2\nZZZ_NEW 3'))
    c.onFrame(frame('QQQ'))
    expect(views.at(-1)!.unknownVerbs).toEqual({ ZZZ_NEW: 2, QQQ: 1 })
  })

  it('after a reload a CLOCK-only stream counts as live and keeps the restored block', async () => {
    const first = await make()
    first.c.dispatch(nominated('Alpha', 2, 20))
    const { c, views } = await make({ storage: first.deps.storage, now: clock().now })
    expect(views.at(-1)!.health).toBe('manual')
    c.onFrame(frame('CLOCK 6 85495 1'))
    expect(views.at(-1)!.health).toBe('live')
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 20, leaderId: 2 })
  })
})

describe('recorded ESPN draft through the controller', () => {
  const rec = JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording
  const notes = JSON.parse(readFileSync('test/fixtures/espn-auction-notes.json', 'utf8')) as { sales: [number, number, number][] }
  const [jokic, second, third] = notes.sales.map(([espnId]) => espnId)
  const values = () => [pv('Nikola Jokic', 60, { espnId: jokic }), pv('Second Pick', 50, { espnId: second }), pv('Third Pick', 45, { espnId: third })]

  it('survives dedupe and a reload, and its sales match the Draft Recap', async () => {
    const first = await make({ values: values() })
    for (const frame of rec.frames.filter((f) => f.dir === 'in')) first.c.onFrame(frame)
    const sales = first.c.getState().sales
    expect(sales.map((x) => [x.teamId, x.price])).toEqual(notes.sales.map(([, teamId, price]) => [teamId, price]))
    expect(sales.map((x) => x.playerKey)).toEqual(['nikola jokic', 'second pick', 'third pick', ...notes.sales.slice(3).map(([id]) => `espn:${id}`)])
    expect(first.c.getState().live).not.toBeNull() // the recording ends mid-auction
    expect(first.views.at(-1)!.alert).toBeNull() // the real stream order never looks like a missed sale

    const second = await make({ values: values(), storage: first.deps.storage, backup: first.deps.backup })
    expect(second.c.getState().sales).toEqual(sales)
    expect(second.c.getState().live).toEqual(first.c.getState().live)
  })
})
