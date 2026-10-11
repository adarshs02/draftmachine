import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FetchLike } from '../../src/espn/common'
import { fallbackSettings, fetchLeague, findMyTeam, leagueUrl, parseLeague, swidFromCookie, toSettings } from '../../src/espn/league'

const RAW = JSON.parse(readFileSync('test/fixtures/league-settings.json', 'utf8'))
const SWID = '{AAAAAAAA-0000-0000-0000-000000000001}'

describe('parseLeague', () => {
  it('reads budget, roster size (IR excluded), slot counts and teams', () => {
    const l = parseLeague(RAW)
    expect(l).toMatchObject({ id: 123, draftType: 'AUCTION', budget: 200, rosterSize: 13 })
    expect(l.lineupSlotCounts).toEqual({ 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3, 13: 1 })
    expect(l.teams).toHaveLength(10)
    expect(l.teams[1].name).toBe('Team Two')
  })

  it('falls back to ESPN defaults when settings are missing', () => {
    expect(parseLeague({ teams: [] })).toMatchObject({ draftType: 'UNKNOWN', budget: 200, rosterSize: 13 })
  })
})

describe('my team', () => {
  it('reads SWID from the cookie string, URL-encoded or not', () => {
    expect(swidFromCookie(`a=1; SWID=${SWID}; espn_s2=x`)).toBe(SWID)
    expect(swidFromCookie(`SWID=${encodeURIComponent(SWID)}`)).toBe(SWID)
    expect(swidFromCookie('a=1')).toBeNull()
  })

  it('keeps a SWID that is not valid URL encoding as it is', () => {
    expect(swidFromCookie('SWID=%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('matches owners case-insensitively', () => {
    const l = parseLeague(RAW)
    expect(findMyTeam(l, SWID.toLowerCase())).toBe(1)
    expect(findMyTeam(l, '{BBBBBBBB-0000-0000-0000-000000000009}')).toBeNull()
  })

  it('skips owner entries that are not strings', () => {
    const l = parseLeague({ teams: [{ id: 4, name: 'Odd', owners: [{ id: 'x' }, SWID] }] })
    expect(findMyTeam(l, SWID)).toBe(4)
  })
})

describe('draft order', () => {
  it('parseLeague reads pickOrder, defaulting to empty', () => {
    expect(parseLeague(RAW).pickOrder).toEqual([2, 1, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(parseLeague({ teams: [] }).pickOrder).toEqual([])
  })

  it('keeps only integer team ids from pickOrder, and ignores a pickOrder that is not a list', () => {
    const order = (pickOrder: unknown) => parseLeague({ settings: { draftSettings: { pickOrder } }, teams: [] }).pickOrder
    expect(order('2,1,3')).toEqual([])
    expect(order({ 0: 2 })).toEqual([])
    expect(order(null)).toEqual([])
    expect(order([3, '1', null, 2.5, 1, { id: 4 }])).toEqual([3, 1])
  })

  it('toSettings lists teams in pickOrder', () => {
    expect(toSettings(parseLeague(RAW)).teams.map((t) => t.id)).toEqual([2, 1, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('keeps id order without pickOrder and puts unlisted teams last', () => {
    const teams = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    expect(toSettings(parseLeague({ teams })).teams.map((t) => t.id)).toEqual([1, 2, 3, 4])
    const partial = { settings: { draftSettings: { pickOrder: [3, 1] } }, teams }
    expect(toSettings(parseLeague(partial)).teams.map((t) => t.id)).toEqual([3, 1, 2, 4])
  })
})

describe('settings', () => {
  it('toSettings keeps teams and roster shape, with a 2-slot flyer reserve', () => {
    const s = toSettings(parseLeague(RAW))
    expect(s.teams[1]).toEqual({ id: 1, name: 'Adarsh Ballers' })
    expect(s).toMatchObject({ budget: 200, rosterSize: 13, flyerReserve: 2 })
  })

  it('fallbackSettings is a 10-team, $200, 13-spot league', () => {
    const s = fallbackSettings()
    expect(s.teams).toHaveLength(10)
    expect(s).toMatchObject({ budget: 200, rosterSize: 13, flyerReserve: 2 })
  })
})

describe('fetchLeague', () => {
  it('asks for mSettings + mTeam with the browser session', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const fake: FetchLike = async (url, init) => {
      seen = { url, init }
      return { ok: true, status: 200, json: async () => RAW }
    }
    expect((await fetchLeague(123, fake)).teams).toHaveLength(10)
    expect(seen!.url).toBe(leagueUrl(123))
    expect(seen!.url).toContain('/seasons/2027/segments/0/leagues/123?view=mSettings&view=mTeam')
    expect(seen!.init?.credentials).toBe('include')
  })

  it('explains a 401 and reports other failures', async () => {
    const status = (code: number): FetchLike => async () => ({ ok: false, status: code, json: async () => ({}) })
    await expect(fetchLeague(1, status(401))).rejects.toThrow(/log in/)
    await expect(fetchLeague(1, status(500))).rejects.toThrow(/HTTP 500/)
  })
})

describe('real league fixture', () => {
  const REAL = JSON.parse(readFileSync('test/fixtures/league-real.json', 'utf8'))

  it('parses a scrubbed real ESPN league', () => {
    const l = parseLeague(REAL)
    expect(l.draftType).toBe('AUCTION')
    expect(l.budget).toBeGreaterThan(0)
    expect(l.rosterSize).toBeGreaterThanOrEqual(10)
    expect(l.teams.length).toBeGreaterThanOrEqual(4)
    expect(l.budget).toBe(200)
    expect(l.rosterSize).toBe(13)
    expect(l.pickOrder).toEqual([7, 10, 5, 9, 1, 4, 8, 3, 6, 2])
  })

  it('orders teams in ESPN draft order', () => {
    expect(toSettings(parseLeague(REAL)).teams.map((t) => t.id)).toEqual([7, 10, 5, 9, 1, 4, 8, 3, 6, 2])
  })
})
