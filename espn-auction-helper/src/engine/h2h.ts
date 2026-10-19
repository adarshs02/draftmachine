// The weekly H2H each-category model, shared by the panel (category fit) and the simulator (standings).

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

const COUNTING = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'to'] as const
type Counting = (typeof COUNTING)[number]

// Weekly noise model (assumptions, not fitted): season totals are spread over the NBA season's weeks, a player's
// games swing game to game (variance = dispersion x mean per game) and he plays 2-4 games a week.
/** NBA regular season in weeks: weekly mean = season total / NBA_WEEKS. */
export const NBA_WEEKS = 23.4
/** Variance / mean of one game's count. Points swing most; steals are close to Poisson. */
export const GAME_DISPERSION: Readonly<Record<Counting, number>> = Object.freeze({ pts: 2.5, reb: 1.2, ast: 1.1, stl: 1, blk: 1.2, tpm: 1.1, to: 1 })
/** Variance / mean^2 of a player's games in a week. */
export const GAMES_CV2 = 0.037
/** Makes vary a little more than a coin flip per shot; attempts swing like a counting stat. */
const MAKE_DISPERSION = 1.2
const ATTEMPT_DISPERSION = 1.2

/** A team's expected week: mean and variance per category (percentages as a ratio of weekly sums). */
export interface WeeklyLine {
  mean: Record<Category, number>
  variance: Record<Category, number>
}

/** A team's expected week from its players' season lines. */
export function weeklyFromLines(lines: readonly SeasonLine[]): WeeklyLine {
  const mean = {} as Record<Category, number>
  const variance = {} as Record<Category, number>
  for (const c of COUNTING) {
    mean[c] = 0
    variance[c] = 0
    for (const l of lines) {
      const m = l[c] / NBA_WEEKS
      mean[c] += m
      variance[c] += GAME_DISPERSION[c] * m + GAMES_CV2 * m * m
    }
  }
  const pct = (made: 'fgm' | 'ftm', att: 'fga' | 'fta', c: 'fgPct' | 'ftPct') => {
    const attempts = lines.reduce((s, l) => s + l[att] / NBA_WEEKS, 0)
    const p = attempts > 0 ? lines.reduce((s, l) => s + l[made] / NBA_WEEKS, 0) / attempts : 0
    // Var(makes - p x attempts) / attempts^2: shot luck plus the mix of shooters taking the shots.
    let v = 0
    for (const l of lines) {
      const a = l[att] / NBA_WEEKS
      if (a <= 0) continue
      const pi = l[made] / l[att]
      v += a * pi * (1 - pi) * MAKE_DISPERSION + (pi - p) ** 2 * (ATTEMPT_DISPERSION * a + GAMES_CV2 * a * a)
    }
    mean[c] = p
    variance[c] = attempts > 0 ? v / (attempts * attempts) : 0
  }
  pct('fgm', 'fga', 'fgPct')
  pct('ftm', 'fta', 'ftPct')
  return { mean, variance }
}

export function weeklyLine(espnIds: readonly number[], proj: ProjectionSource): { week: WeeklyLine; missing: number } {
  const lines: SeasonLine[] = []
  for (const id of espnIds) {
    const l = proj(id)
    if (l) lines.push(l)
  }
  return { week: weeklyFromLines(lines), missing: espnIds.length - lines.length }
}

/** Standard normal CDF (Abramowitz-Stegun 26.2.17, error < 1e-7). */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const tail = 0.3989422804 * Math.exp((-z * z) / 2) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - tail : tail
}

/** Chance team `a` beats `b` in category `c` over a matchup of `weeks` weeks (normal approximation). */
export function categoryWinChance(a: WeeklyLine, b: WeeklyLine, c: Category, weeks = 1): number {
  const sd = Math.sqrt(a.variance[c] + b.variance[c])
  const gap = a.mean[c] - b.mean[c]
  if (gap === 0) return 0.5
  if (sd === 0) return (gap > 0) !== (c === 'to') ? 1 : 0
  const p = phi((Math.sqrt(weeks) * gap) / sd)
  return c === 'to' ? 1 - p : p
}

export const projectionsFrom = (rows: ReadonlyMap<number, SeasonLine>): ProjectionSource => (id) => rows.get(id) ?? null
