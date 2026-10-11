import { describe, expect, it } from 'vitest'
import { verbStats } from '../../src/capture/analyze'
import type { Frame } from '../../src/capture/frames'

const f = (data: string, dir: Frame['dir'] = 'in'): Frame => ({ dir, data, t: 0, url: '' })

describe('verbStats', () => {
  const frames = [f('CLOCK 6 1 2\nCLOCK 6 1 3'), f('SELECTED 1 3112335 4'), f('PING PING%2012', 'out')]

  it('counts incoming verbs, most common first, with samples', () => {
    expect(verbStats(frames)).toEqual([
      { verb: 'CLOCK', count: 2, samples: ['CLOCK 6 1 2', 'CLOCK 6 1 3'] },
      { verb: 'SELECTED', count: 1, samples: ['SELECTED 1 3112335 4'] },
    ])
  })

  it('can look at outgoing frames and cap samples', () => {
    expect(verbStats(frames, 'out')).toEqual([{ verb: 'PING', count: 1, samples: ['PING PING%2012'] }])
    expect(verbStats(frames, 'in', 1)[0].samples).toEqual(['CLOCK 6 1 2'])
  })
})
