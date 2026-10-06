import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createController, type ControllerDeps, type View } from '../src/controller'
import { parseLeague } from '../src/espn/league'
import { memoryStore, nominated, pv, sold } from './helpers'

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
    expect(views[0]).toMatchObject({ health: 'manual', banner: null, frameCount: 0 })
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
