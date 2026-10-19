import { describe, expect, it } from 'vitest'
import { projectionsFrom, weeklyFromLines, weeklyLine, type SeasonLine } from '../../src/engine/h2h'

const line = (k: number): SeasonLine => ({ pts: 1300 * k, reb: 520 * k, ast: 300 * k, stl: 80 * k, blk: 50 * k, tpm: 130 * k, to: 150 * k, fgm: 480 * k, fga: 1000 * k, ftm: 210 * k, fta: 270 * k })

describe('weeklyFromLines', () => {
  it('is the weekly line of the same players looked up by id', () => {
    const proj = projectionsFrom(new Map([[1, line(1)], [2, line(1.4)], [3, { ...line(0.8), ftm: 100 }]]))
    expect(weeklyFromLines([line(1), line(1.4), { ...line(0.8), ftm: 100 }])).toEqual(weeklyLine([1, 2, 3], proj).week)
  })

  it('an empty roster has zero means and variances', () => {
    const w = weeklyFromLines([])
    expect(w.mean.pts).toBe(0)
    expect(w.variance.fgPct).toBe(0)
  })
})
