import { describe, expect, it } from 'vitest'
import { projectionsFrom, scoreTeams, teamTotals, type SeasonLine } from '../../src/sim/score'

const line = (pts: number, reb: number, ast: number, stl: number, blk: number, tpm: number, to: number, fgm: number, fga: number, ftm: number, fta: number): SeasonLine => ({
  pts, reb, ast, stl, blk, tpm, to, fgm, fga, ftm, fta,
})
// A: FG 40/80 = .500, FT 18/20 = .900; B: 45/100 = .450, 16/20 = .800; C: 30/50 = .600, 9/10 = .900
const PROJ = projectionsFrom(
  new Map([
    [1, line(100, 50, 30, 10, 5, 20, 15, 40, 80, 18, 20)],
    [2, line(90, 60, 30, 8, 7, 25, 10, 45, 100, 16, 20)],
    [3, line(80, 40, 20, 12, 7, 10, 20, 30, 50, 9, 10)],
  ]),
)

describe('scoreTeams', () => {
  it('hand-computed 3-team roto: ties share points, TO is reversed, percentages from totals', () => {
    const s = scoreTeams(new Map([[1, [1]], [2, [2]], [3, [3]]]), PROJ)
    const by = (id: number) => s.find((t) => t.teamId === id)!
    expect(by(1).points).toEqual({ pts: 3, reb: 2, ast: 2.5, stl: 2, blk: 1, tpm: 2, fgPct: 2, ftPct: 2.5, to: 2 })
    expect(by(2).points).toEqual({ pts: 2, reb: 3, ast: 2.5, stl: 1, blk: 2.5, tpm: 3, fgPct: 1, ftPct: 1, to: 3 })
    expect(by(3).points).toEqual({ pts: 1, reb: 1, ast: 1, stl: 3, blk: 2.5, tpm: 1, fgPct: 3, ftPct: 2.5, to: 1 })
    expect(s.map((t) => [t.teamId, t.total, t.rank])).toEqual([[1, 19, 1], [2, 19, 1], [3, 16, 3]])
  })

  it('FG% and FT% come from summed makes and attempts, not averaged percentages', () => {
    const p = projectionsFrom(new Map([[1, line(0, 0, 0, 0, 0, 0, 0, 10, 10, 0, 0)], [2, line(0, 0, 0, 0, 0, 0, 0, 0, 30, 1, 4)]]))
    expect(teamTotals([1, 2], p).totals).toMatchObject({ fgPct: 0.25, ftPct: 0.25 })
  })

  it('players without a projection count as missing and add nothing', () => {
    expect(teamTotals([1, 99], PROJ)).toEqual({ totals: teamTotals([1], PROJ).totals, missing: 1 })
    expect(teamTotals([], PROJ).totals.fgPct).toBe(0)
  })
})
