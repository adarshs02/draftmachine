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

describe('settings', () => {
  it('toSettings keeps teams and roster shape, with a 2-slot flyer reserve', () => {
    const s = toSettings(parseLeague(RAW))
    expect(s.teams[0]).toEqual({ id: 1, name: 'Adarsh Ballers' })
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
