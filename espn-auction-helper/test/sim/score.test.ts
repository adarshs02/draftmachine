import { describe, expect, it } from 'vitest'
import { CATEGORIES, categoryWinChance, GAME_DISPERSION, GAMES_CV2, H2H, NBA_WEEKS, PROJECTION_ERROR, projectionsFrom, scoreTeams, truthFrom, weeklyLine, type SeasonLine } from '../../src/sim/score'

const line = (pts: number, reb: number, ast: number, stl: number, blk: number, tpm: number, to: number, fgm: number, fga: number, ftm: number, fta: number): SeasonLine => ({
  pts, reb, ast, stl, blk, tpm, to, fgm, fga, ftm, fta,
})
const scale = (l: SeasonLine, k: number): SeasonLine => Object.fromEntries(Object.entries(l).map(([f, x]) => [f, x * k])) as unknown as SeasonLine
/** A typical rotation player's season. */
const BASE = line(1300, 520, 300, 80, 50, 130, 150, 480, 1000, 210, 270)
const team = (id: number) => Array.from({ length: 13 }, () => id)

describe('weeklyLine', () => {
  it('weekly means are season totals over the NBA season in weeks; variance adds game-to-game and games-per-week swings', () => {
    const { week } = weeklyLine([1], projectionsFrom(new Map([[1, line(10 * NBA_WEEKS, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)]])))
    expect(week.mean.pts).toBeCloseTo(10, 9)
    expect(week.variance.pts).toBeCloseTo(GAME_DISPERSION.pts * 10 + GAMES_CV2 * 100, 9)
  })

  it('FG% and FT% come from summed makes and attempts, not averaged percentages', () => {
    const p = projectionsFrom(new Map([[1, line(0, 0, 0, 0, 0, 0, 0, 10, 10, 0, 0)], [2, line(0, 0, 0, 0, 0, 0, 0, 0, 30, 1, 4)]]))
    expect(weeklyLine([1, 2], p).week.mean).toMatchObject({ fgPct: 0.25, ftPct: 0.25 })
  })

  it('players without a projection count as missing and add nothing', () => {
    const p = projectionsFrom(new Map([[1, BASE]]))
    expect(weeklyLine([1, 99], p)).toEqual({ week: weeklyLine([1], p).week, missing: 1 })
    expect(weeklyLine([], p).week.mean.fgPct).toBe(0)
  })
})

describe('categoryWinChance', () => {
  const p = projectionsFrom(new Map([[1, BASE], [2, scale(BASE, 1.1)]]))
  const a = weeklyLine(team(1), p).week
  const b = weeklyLine(team(2), p).week

  it('is 50% between equal teams in every category', () => {
    for (const c of CATEGORIES) expect(categoryWinChance(a, a, c)).toBeCloseTo(0.5, 9)
  })

  it('favors more of a counting stat and fewer turnovers, and a 2-week matchup sharpens the edge', () => {
    expect(categoryWinChance(b, a, 'pts')).toBeGreaterThan(0.5)
    expect(categoryWinChance(b, a, 'to')).toBeLessThan(0.5)
    expect(categoryWinChance(b, a, 'pts') + categoryWinChance(a, b, 'pts')).toBeCloseTo(1, 9)
    expect(categoryWinChance(b, a, 'pts', 2)).toBeGreaterThan(categoryWinChance(b, a, 'pts'))
  })
})

describe('scoreTeams', () => {
  // Ten teams, team 1 far stronger: more of every counting stat, better shooting, fewer turnovers.
  const strong = { ...scale(BASE, 1.5), to: 0.8 * BASE.to, fgm: 1.5 * 560, ftm: 1.5 * 250 }
  const proj = projectionsFrom(new Map([[1, strong], ...Array.from({ length: 9 }, (_, i) => [i + 2, scale(BASE, 1 + i * 0.01)] as [number, SeasonLine])]))
  const rosters = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, team(i + 1)]))

  it('a much stronger team wins nearly every weekly category, makes the playoffs and usually the title', () => {
    const t = scoreTeams(rosters, proj).find((x) => x.teamId === 1)!
    expect(t.winPct).toBeGreaterThan(0.95)
    expect(t).toMatchObject({ rank: 1, playoffPct: 1, missingProjections: 0 })
    expect(t.titlePct).toBeGreaterThan(0.9)
    expect(t.avgSeed).toBeLessThan(1.1)
  })

  it(`every simulated season has ${H2H.playoffTeams} playoff teams, one champion and seeds 1 to 10`, () => {
    const s = scoreTeams(rosters, proj)
    const total = (f: (t: (typeof s)[number]) => number) => s.reduce((sum, t) => sum + f(t), 0)
    expect(total((t) => t.playoffPct)).toBeCloseTo(H2H.playoffTeams, 9)
    expect(total((t) => t.titlePct)).toBeCloseTo(1, 9)
    expect(total((t) => t.avgSeed)).toBeCloseTo(55, 9)
  })

  it('is sorted by expected record and deterministic for a seed', () => {
    const s = scoreTeams(rosters, proj, 7)
    expect(s.map((t) => t.winPct)).toEqual([...s.map((t) => t.winPct)].sort((x, y) => y - x))
    expect(scoreTeams(rosters, proj, 7)).toEqual(s)
  })

  it('equal teams share rank 1 with a 50% record', () => {
    const flat = projectionsFrom(new Map([[1, BASE]]))
    const s = scoreTeams(new Map(Array.from({ length: 4 }, (_, i) => [i + 1, team(1)])), flat)
    expect(s.every((t) => t.rank === 1 && Math.abs(t.winPct - 0.5) < 1e-9)).toBe(true)
  })
})

describe('truthFrom', () => {
  const ids = Array.from({ length: 3000 }, (_, i) => i + 1)
  const proj = projectionsFrom(new Map(ids.map((id) => [id, BASE])))
  const sd = (xs: number[]) => {
    const m = xs.reduce((s, x) => s + x, 0) / xs.length
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
  }

  it('is the same for a (seed, player) whatever order players are asked for, and differs by seed', () => {
    const a = truthFrom(proj, 5)
    const b = truthFrom(proj, 5)
    const first = a(7)
    b(9)
    b(3)
    expect(b(7)).toEqual(first)
    expect(truthFrom(proj, 6)(7)).not.toEqual(first)
    expect(truthFrom(proj, 5)(99999)).toBeNull()
  })

  it('draws errors of the configured size around the projection', () => {
    const t = truthFrom(proj, 1)
    const lines = ids.map((id) => t(id)!)
    const pts = lines.map((l) => l.pts / BASE.pts)
    expect(pts.reduce((s, x) => s + x, 0) / pts.length).toBeCloseTo(1, 1)
    const expected = Math.hypot(PROJECTION_ERROR.games, PROJECTION_ERROR.stat)
    expect(sd(pts)).toBeGreaterThan(expected * 0.85)
    expect(sd(pts)).toBeLessThan(expected * 1.15)
    const fg = lines.map((l) => l.fgm / l.fga - BASE.fgm / BASE.fga)
    expect(sd(fg)).toBeCloseTo(PROJECTION_ERROR.fgPct, 2)
    expect(lines.every((l) => l.ftm <= l.fta && l.fgm <= l.fga && l.ftm >= 0)).toBe(true)
  })
})
