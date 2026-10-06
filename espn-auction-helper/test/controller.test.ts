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
})

describe('socket frames', () => {
  it('records frames and offers them as a recording', async () => {
    const { c, views } = await make()
    c.onFrame({ dir: 'in', data: 'CLOCK 6 85495 1', t: 1, url: 'wss://fantasydraft.espn.com/x' })
    expect(views.at(-1)!.frameCount).toBe(1)
    expect(JSON.parse(c.recordingJson())).toMatchObject({ leagueId: 7, frames: [{ data: 'CLOCK 6 85495 1' }] })
  })
})
