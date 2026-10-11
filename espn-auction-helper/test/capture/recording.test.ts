import { describe, expect, it } from 'vitest'
import { splitLines } from '../../src/capture/frames'
import { buildRecording } from '../../src/capture/recording'

describe('recording', () => {
  it('wraps frames with league and timestamps', () => {
    const frames = [{ dir: 'in' as const, data: 'STATE 1', t: 5, url: 'u' }]
    expect(buildRecording(7, new Date('2026-10-05T01:00:00Z'), frames, new Date('2026-10-05T02:00:00Z'))).toEqual({
      leagueId: 7,
      startedAt: '2026-10-05T01:00:00.000Z',
      savedAt: '2026-10-05T02:00:00.000Z',
      frames,
    })
  })

  it('splitLines trims and drops blank lines', () => {
    expect(splitLines('CLOCK 6 1 2\n\n  STATE 1 \n')).toEqual(['CLOCK 6 1 2', 'STATE 1'])
  })
})
