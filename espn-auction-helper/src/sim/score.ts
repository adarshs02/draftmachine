/** Projected season totals for one player. */
export interface SeasonLine {
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tpm: number
  to: number
  fgm: number
  fga: number
  ftm: number
  fta: number
}

export const LINE_FIELDS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'to', 'fgm', 'fga', 'ftm', 'fta'] as const

export type ProjectionSource = (espnId: number) => SeasonLine | null

export const CATEGORIES = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fgPct', 'ftPct', 'to'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_LABELS: Record<Category, string> = {
  pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', fgPct: 'FG%', ftPct: 'FT%', to: 'TO',
}

export interface TeamScore {
  teamId: number
  totals: Record<Category, number>
  /** roto points per category: n for the best team, 1 for the worst, ties share the average */
  points: Record<Category, number>
  total: number
  /** 1 + teams with more points */
  rank: number
  /** rostered players with no projection (they add nothing) */
  missingProjections: number
}

export function teamTotals(espnIds: readonly number[], proj: ProjectionSource): { totals: Record<Category, number>; missing: number } {
  const sum: SeasonLine = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, to: 0, fgm: 0, fga: 0, ftm: 0, fta: 0 }
  let missing = 0
  for (const id of espnIds) {
    const line = proj(id)
    if (!line) {
      missing++
      continue
    }
    for (const f of LINE_FIELDS) sum[f] += line[f]
  }
  return {
    totals: {
      pts: sum.pts,
      reb: sum.reb,
      ast: sum.ast,
      stl: sum.stl,
      blk: sum.blk,
      tpm: sum.tpm,
      fgPct: sum.fga > 0 ? sum.fgm / sum.fga : 0,
      ftPct: sum.fta > 0 ? sum.ftm / sum.fta : 0,
      to: sum.to,
    },
    missing,
  }
}

const better = (c: Category, a: number, b: number) => (c === 'to' ? a < b : a > b)

export function scoreTeams(rosters: ReadonlyMap<number, readonly number[]>, proj: ProjectionSource): TeamScore[] {
  const teams = [...rosters].map(([teamId, ids]) => ({ teamId, ...teamTotals(ids, proj) }))
  const scored = teams.map((t) => {
    const points = {} as Record<Category, number>
    for (const c of CATEGORIES) {
      const worse = teams.filter((o) => better(c, t.totals[c], o.totals[c])).length
      const tied = teams.filter((o) => o.totals[c] === t.totals[c]).length
      points[c] = worse + (tied + 1) / 2
    }
    return { teamId: t.teamId, totals: t.totals, points, total: CATEGORIES.reduce((s, c) => s + points[c], 0), missingProjections: t.missing }
  })
  return scored
    .map((t) => ({ ...t, rank: 1 + scored.filter((o) => o.total > t.total).length }))
    .sort((a, b) => a.rank - b.rank || a.teamId - b.teamId)
}

export const projectionsFrom = (rows: ReadonlyMap<number, SeasonLine>): ProjectionSource => (id) => rows.get(id) ?? null
