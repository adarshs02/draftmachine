import { describe, expect, it } from 'vitest'
import { scrubFrame, scrubLeagueJson, scrubRecording, ZERO_GUID } from '../../src/capture/recording'

const GUID = '{8398089B-19B2-4A9B-AD56-C97626BAD9B5}'

describe('scrubbing', () => {
  it('drops TOKEN lines, zeroes GUIDs and strips the join query', () => {
    const f = { dir: 'in' as const, data: `TOKEN 1:1:2:${GUID}:123\nJOINED 2 ${GUID}`, t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-1/JOIN?4=secret' }
    expect(scrubFrame(f)).toEqual({ dir: 'in', data: `JOINED 2 ${ZERO_GUID}`, t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-0/JOIN' })
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

  it('drops entire frame if any line starts with INIT', () => {
    const f = { dir: 'in' as const, data: `JOINED 2 ${GUID}\nINIT abc\ndef`, t: 1, url: '' }
    expect(scrubFrame(f)).toBeNull()
  })

  it('redacts names case-insensitively', () => {
    const f = { dir: 'in' as const, data: `NOMINATE 3 123 1 Secret Squad`, t: 1, url: '' }
    const result = scrubFrame(f, ['secret squad'])
    expect(result).not.toBeNull()
    expect(result!.data).toContain('REDACTED')
    expect(result!.data).not.toContain('Secret')
  })

  it('replaces league id in URL path with 0', () => {
    const f = { dir: 'in' as const, data: 'JOINED 2', t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-123456/JOIN?4=x' }
    expect(scrubFrame(f)).toEqual({ dir: 'in', data: 'JOINED 2', t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-0/JOIN' })
  })

  it('replaces a league id at the end of the URL path', () => {
    const f = { dir: 'in' as const, data: 'JOINED 2', t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-123456?4=x' }
    expect(scrubFrame(f)!.url).toBe('wss://fantasydraft.espn.com/game-1/league-0')
  })

  it('redacts longer names first so a shorter name cannot leave part of one', () => {
    const f = { dir: 'in' as const, data: 'NOMINATE 3 123 1 Secret Squad', t: 1, url: '' }
    expect(scrubFrame(f, ['Squad', 'Secret Squad'])!.data).toBe('NOMINATE 3 123 1 REDACTED')
  })

  it('zeroes two GUIDs on same line', () => {
    const f = { dir: 'in' as const, data: `JOINED ${GUID} ${GUID}`, t: 1, url: '' }
    const result = scrubFrame(f)
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(`JOINED ${ZERO_GUID} ${ZERO_GUID}`)
  })

  it('removes settings.name, settings.inviteCode, root code, and sets id to 0', () => {
    const text = JSON.stringify({
      id: 999,
      code: 'secret',
      inviteCode: 'invite123',
      settings: { name: 'My League', inviteCode: 'settings-invite' },
      teams: [{ id: 1 }]
    })
    const out = JSON.parse(scrubLeagueJson(text))
    expect(out.id).toBe(0)
    expect(out.code).toBeUndefined()
    expect(out.inviteCode).toBeUndefined()
    expect(out.settings?.name).toBeUndefined()
    expect(out.settings?.inviteCode).toBeUndefined()
  })

  it('scrubRecording sets leagueId to 0 and passes redact through', () => {
    const rec = {
      leagueId: 999,
      startedAt: '2026-01-01T00:00:00Z',
      savedAt: '2026-01-01T00:01:00Z',
      frames: [{ dir: 'in' as const, data: `NOMINATE 3 123 1 Secret Squad`, t: 1, url: '' }]
    }
    const result = scrubRecording(rec, ['secret squad'])
    expect(result.leagueId).toBe(0)
    expect(result.frames[0].data).toContain('REDACTED')
  })
})
