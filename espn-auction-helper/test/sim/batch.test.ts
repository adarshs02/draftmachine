import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNABLES, TUNABLES } from '../../src/engine/constants'
import { runBatch } from '../../src/sim/batch'
import { parseBatchArgs } from '../../src/sim/batchArgs'
import type { ProjectionSource } from '../../src/sim/score'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const FLAT: ProjectionSource = (id) => ({ pts: id % 997, reb: 400, ast: 200, stl: 60, blk: 40, tpm: 100, to: 120, fgm: 400, fga: 850, ftm: 150, fta: 190 })

describe('parseBatchArgs', () => {
  it('defaults', () => {
    expect(parseBatchArgs([])).toEqual({ drafts: 100, seed: 1, room: 1, policies: ['autopilot', 'market', 'consensus'], set: {}, compare: false, json: false })
  })

  it('reads every flag', () => {
    const argv = ['--drafts', '5', '--seed', '9', '--room', 'hot', '--policies', 'autopilot,market', '--set', 'BID_GAP_FRACTION=0.1', '--set', 'HOT=1.1', '--compare', '--json']
    expect(parseBatchArgs(argv)).toEqual({ drafts: 5, seed: 9, room: 1.1, policies: ['autopilot', 'market'], set: { BID_GAP_FRACTION: 0.1, HOT: 1.1 }, compare: true, json: true })
    expect(parseBatchArgs(['--room', '0.95']).room).toBe(0.95)
  })

  it.each([
    [['--drafts', '0'], 'drafts must be a positive integer'],
    [['--seed', 'x'], 'seed must be an integer'],
    [['--room', 'warm'], 'room must be cold, neutral, hot or a positive number'],
    [['--policies', 'autopilot,foo'], 'unknown policy foo'],
    [['--set', 'NOPE=1'], 'unknown tunable NOPE'],
    [['--set', 'HOT=abc'], 'tunable HOT must be a finite number'],
    [['--set', 'HOT'], 'expected --set NAME=value'],
    [['--compare'], '--compare needs at least one --set'],
    [['--bogus'], 'unknown flag --bogus'],
    [['--drafts'], '--drafts needs a value'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseBatchArgs(argv)).toThrow(message)
  })
})

describe('runBatch', () => {
  it('runs every policy per config, is deterministic, and never leaks tunables', () => {
    const args = parseBatchArgs(['--drafts', '2', '--seed', '4', '--set', 'BID_GAP_FRACTION=0.1', '--compare'])
    const a = runBatch({ args, values: VALUES, projections: FLAT })
    expect(a.map((s) => s.label)).toEqual([
      'defaults · autopilot', 'defaults · market', 'defaults · consensus',
      'overrides · autopilot', 'overrides · market', 'overrides · consensus',
    ])
    expect(a.every((s) => s.drafts === 2)).toBe(true)
    expect(TUNABLES).toEqual(DEFAULT_TUNABLES)
    expect(runBatch({ args, values: VALUES, projections: FLAT })).toEqual(a)
    // Baselines ignore tunables, so they match across configs.
    expect(a[4]).toEqual({ ...a[1], label: 'overrides · market' })
    // A later defaults-only run is unaffected by the overrides that ran last.
    const plain = runBatch({ args: parseBatchArgs(['--drafts', '2', '--seed', '4', '--policies', 'autopilot']), values: VALUES, projections: FLAT })
    expect(plain).toEqual([a[0]])
  }, 180_000)
})
