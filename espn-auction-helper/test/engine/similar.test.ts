import { describe, expect, it } from 'vitest'
import { similar } from '../../src/engine/similar'
import type { DraftEvent } from '../../src/engine/types'
import { build, nominated, sold } from '../helpers'
import { FIT_S, FIT_V } from './fitFixture'

const at = (events: DraftEvent[], values = FIT_V) => build(FIT_S, values, events)
const keys = (events: DraftEvent[], values = FIT_V) => similar(at(events, values))!.rows.map((r) => r.key)

describe('similar', () => {
  it('lists the 5 available players whose category profile is closest to the one on the block', () => {
    const rows = similar(at([nominated('Wall1', 2, 1)]))!.rows
    expect(rows).toHaveLength(5)
    expect(rows.slice(0, 3).map((r) => r.key)).toEqual(['wall2', 'wall3', 'blocker'])
  })

  it('names the categories he and the similar player are both strong in', () => {
    expect(similar(at([nominated('Wall1', 2, 1)]))!.rows[0].cats).toEqual(['blk'])
  })

  it('gives my value and what the room usually pays, as Look for does', () => {
    const r = similar(at([nominated('Wall1', 2, 1)]))!.rows[0]
    expect(r).toMatchObject({ name: 'Wall2', market: 20 })
    expect(r.value).toBeGreaterThan(0)
  })

  it('leaves out the player on the block, sold players and avoided players', () => {
    const avoided = FIT_V.map((v) => (v.key === 'wall3' ? { ...v, avoid: true } : v))
    const k = keys([sold('Wall2', 3, 20), nominated('Wall1', 2, 1)], avoided)
    expect(k).not.toContain('wall1')
    expect(k).not.toContain('wall2')
    expect(k).not.toContain('wall3')
    expect(k[0]).toBe('blocker')
  })

  it('keeps to players near his value (within half of it, at least $3), even with the same stats', () => {
    // P26 ($20) projects exactly BASE_LINE, as does Cheapo ($3).
    const rows = similar(at([nominated('P26', 2, 1)]), 100)!.rows
    expect(rows.map((r) => r.key)).not.toContain('cheapo')
    for (const r of rows) expect(Math.abs(at([]).values[r.key].b - 20)).toBeLessThanOrEqual(10)
  })

  it('without a stat line for him, falls back to the nearest values', () => {
    const rows = similar(at([nominated('NoStats', 2, 1)]), 100)!.rows
    const gaps = rows.map((r) => Math.abs(at([]).values[r.key].b - 20))
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b))
    expect(rows.every((r) => r.cats.length === 0)).toBe(true)
  })

  it('is null with nobody on the block', () => {
    expect(similar(at([]))).toBeNull()
  })
})
