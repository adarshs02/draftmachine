import { describe, expect, it } from 'vitest'
import type { FetchLike } from '../../src/espn/common'
import { fetchPlayers, PLAYERS_URL, trimPlayers } from '../../src/espn/players'

const RAW = {
  players: [
    {
      id: 3112335,
      player: {
        fullName: 'Nikola Jokic',
        eligibleSlots: [4, 9, 10, 11, 12, 13],
        draftRanksByRankType: { ROTO: { auctionValue: 68 }, STANDARD: { auctionValue: 65 } },
        ownership: { auctionValueAverage: 81.3247 },
      },
    },
    { id: 99, player: { fullName: 'No Ranks Guy', eligibleSlots: [0, 11, 12] } },
    { id: 100, player: {} },
  ],
}

describe('trimPlayers', () => {
  it('keeps id, name, lineup slots, ROTO value and market price', () => {
    expect(trimPlayers(RAW)).toEqual([
      { id: 3112335, name: 'Nikola Jokic', slots: [4, 9, 10, 11], roto: 68, market: 81.3 },
      { id: 99, name: 'No Ranks Guy', slots: [0, 11], roto: 0, market: 0 },
    ])
  })

  it('returns [] for junk', () => {
    expect(trimPlayers(null)).toEqual([])
    expect(trimPlayers({})).toEqual([])
  })
})

describe('fetchPlayers', () => {
  it('calls the public 2027 player endpoint with a filter header', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return { ok: true, status: 200, json: async () => RAW }
    }
    const players = await fetchPlayers(fake)
    expect(players).toHaveLength(2)
    expect(calls[0].url).toBe(PLAYERS_URL)
    expect(calls[0].url).toContain('/games/fba/seasons/2027/')
    const filter = JSON.parse((calls[0].init?.headers as Record<string, string>)['X-Fantasy-Filter'])
    expect(filter.players.limit).toBe(400)
  })

  it('throws on HTTP errors', async () => {
    const fake: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchPlayers(fake)).rejects.toThrow(/503/)
  })
})
