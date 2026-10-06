import { describe, expect, it } from 'vitest'
import { scrubFrame, scrubLeagueJson, ZERO_GUID } from '../../src/capture/recording'

const GUID = '{8398089B-19B2-4A9B-AD56-C97626BAD9B5}'

describe('scrubbing', () => {
  it('drops TOKEN and INIT lines, zeroes GUIDs and strips the join query', () => {
    const f = { dir: 'in' as const, data: `TOKEN 1:1:2:${GUID}:123\nJOINED 2 ${GUID}\nINIT abc###`, t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-1/JOIN?4=secret' }
    expect(scrubFrame(f)).toEqual({ dir: 'in', data: `JOINED 2 ${ZERO_GUID}`, t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-1/JOIN' })
  })

  it('returns null when nothing is left', () => {
    expect(scrubFrame({ dir: 'in', data: `TOKEN 1:1:2:${GUID}:1`, t: 1, url: '' })).toBeNull()
  })

  it('strips league members, team names and owner ids', () => {
    const text = JSON.stringify({ members: [{ id: GUID, firstName: 'Real' }], teams: [{ id: 3, name: 'Secret Squad', abbrev: 'SS', owners: [GUID] }] })
    const out = JSON.parse(scrubLeagueJson(text))
    expect(out.members).toBeUndefined()
    expect(out.teams[0]).toEqual({ id: 3, name: 'Team 3', owners: [ZERO_GUID] })
  })
})
