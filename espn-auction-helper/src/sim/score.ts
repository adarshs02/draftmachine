import { mulberry32, type Rng } from './rng'

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

/** The league's H2H each-category format: 19 one-week matchups, then the top 4 play 2-week semifinals and a final. */
export const H2H = Object.freeze({ weeks: 19, playoffTeams: 4, playoffWeeks: 2, seasons: 400 })

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

export function weeklyLine(espnIds: readonly number[], proj: ProjectionSource): { week: WeeklyLine; missing: number } {
  const lines: SeasonLine[] = []
  for (const id of espnIds) {
    const l = proj(id)
    if (l) lines.push(l)
  }
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
  return { week: { mean, variance }, missing: espnIds.length - lines.length }
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

export interface TeamScore {
  teamId: number
  /** chance to win each category in a one-week matchup, averaged over the other teams */
  categoryWin: Record<Category, number>
  /** expected share of weekly categories won: the regular-season record */
  winPct: number
  /** 1 + teams with a better expected record */
  rank: number
  /** average regular-season finish over the simulated seasons (1 = first) */
  avgSeed: number
  /** share of simulated seasons in the top 4 */
  playoffPct: number
  /** share of simulated seasons won */
  titlePct: number
  /** rostered players with no projection (they add nothing) */
  missingProjections: number
}

/** Round-robin rounds by the circle method; teams.length must be even. */
function roundRobin(teams: number[]): Array<Array<[number, number]>> {
  const arr = [...teams]
  const n = arr.length
  const rounds: Array<Array<[number, number]>> = []
  for (let r = 0; r < n - 1; r++) {
    rounds.push(Array.from({ length: n / 2 }, (_, i) => [arr[i], arr[n - 1 - i]] as [number, number]))
    arr.splice(1, 0, arr.pop()!)
  }
  return rounds
}

function shuffled(r: Rng, xs: number[]): number[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Projected H2H each-category standings. Each season: a random schedule (every pair meets about twice
 * in 19 weeks; with an odd team count one team sits out each round), every category of every matchup
 * drawn from the weekly model, the top 4 by categories won go to 2-week semifinals (1 v 4, 2 v 3) and
 * a final, where more categories wins and a tie goes to the higher seed.
 */
export function scoreTeams(rosters: ReadonlyMap<number, readonly number[]>, proj: ProjectionSource, seed = 1): TeamScore[] {
  const ids = [...rosters.keys()]
  const n = ids.length
  const lines = ids.map((id) => weeklyLine(rosters.get(id)!, proj))
  const chances = (weeks: number) => lines.map((a) => lines.map((b) => CATEGORIES.map((c) => categoryWinChance(a.week, b.week, c, weeks))))
  const week1 = chances(1)
  const playoff = chances(H2H.playoffWeeks)

  const categoryWin = lines.map((_, i) => {
    const out = {} as Record<Category, number>
    CATEGORIES.forEach((c, k) => {
      let s = 0
      for (let j = 0; j < n; j++) if (j !== i) s += week1[i][j][k]
      out[c] = n > 1 ? s / (n - 1) : 0.5
    })
    return out
  })
  const winPct = categoryWin.map((cw) => CATEGORIES.reduce((s, c) => s + cw[c], 0) / CATEGORIES.length)

  const r = mulberry32(seed)
  const cats = CATEGORIES.length
  const won = (a: number, b: number, P: number[][][]) => P[a][b].reduce((w, p) => w + (r() < p ? 1 : 0), 0)
  const seedSum = new Array(n).fill(0)
  const playoffs = new Array(n).fill(0)
  const titles = new Array(n).fill(0)
  const slots = n % 2 === 0 ? [...Array(n).keys()] : [...Array(n).keys(), -1]
  const spots = Math.min(H2H.playoffTeams, n)
  for (let season = 0; season < H2H.seasons; season++) {
    const rounds = roundRobin(shuffled(r, slots))
    const record = new Array(n).fill(0)
    for (let w = 0; w < H2H.weeks; w++) {
      for (const [a, b] of rounds[w % rounds.length]) {
        if (a < 0 || b < 0) continue
        const x = won(a, b, week1)
        record[a] += x
        record[b] += cats - x
      }
    }
    const tiebreak = shuffled(r, [...Array(n).keys()])
    const order = [...Array(n).keys()].sort((a, b) => record[b] - record[a] || tiebreak.indexOf(a) - tiebreak.indexOf(b))
    order.forEach((t, i) => (seedSum[t] += i + 1))
    const seeds = order.slice(0, spots)
    seeds.forEach((t) => playoffs[t]++)
    // Higher seed (listed first) keeps a tied matchup.
    const play = (hi: number, lo: number) => (won(lo, hi, playoff) * 2 > cats ? lo : hi)
    let champion = seeds[0]
    if (seeds.length === 4) {
      const f1 = play(seeds[0], seeds[3])
      const f2 = play(seeds[1], seeds[2])
      champion = order.indexOf(f1) < order.indexOf(f2) ? play(f1, f2) : play(f2, f1)
    } else if (seeds.length >= 2) {
      champion = play(seeds[0], seeds[1])
    }
    if (champion !== undefined) titles[champion]++
  }

  const scored = ids.map((teamId, i) => ({
    teamId,
    categoryWin: categoryWin[i],
    winPct: winPct[i],
    rank: 1 + winPct.filter((w) => w > winPct[i] + 1e-12).length,
    avgSeed: seedSum[i] / H2H.seasons,
    playoffPct: playoffs[i] / H2H.seasons,
    titlePct: titles[i] / H2H.seasons,
    missingProjections: lines[i].missing,
  }))
  return scored.sort((a, b) => a.rank - b.rank || b.titlePct - a.titlePct || a.teamId - b.teamId)
}

export const projectionsFrom = (rows: ReadonlyMap<number, SeasonLine>): ProjectionSource => (id) => rows.get(id) ?? null
