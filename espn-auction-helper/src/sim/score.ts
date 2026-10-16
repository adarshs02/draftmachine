import { CATEGORIES, categoryWinChance, weeklyLine, type Category, type ProjectionSource, type SeasonLine } from '../engine/h2h'
import { mulberry32, normal, type Rng } from './rng'

export {
  CATEGORIES, CATEGORY_LABELS, categoryWinChance, GAME_DISPERSION, GAMES_CV2, LINE_FIELDS, NBA_WEEKS, projectionsFrom, weeklyFromLines, weeklyLine,
} from '../engine/h2h'
export type { Category, ProjectionSource, SeasonLine, WeeklyLine } from '../engine/h2h'

/** The league's H2H each-category format: 19 one-week matchups, then the top 4 play 2-week semifinals and a final. */
export const H2H = Object.freeze({ weeks: 19, playoffTeams: 4, playoffWeeks: 2, seasons: 400 })

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

/** How far a season lands from its projection (assumptions, not fitted). */
export const PROJECTION_ERROR = Object.freeze({ games: 0.15, gamesMin: 0.3, gamesMax: 1.3, stat: 0.1, fgPct: 0.015, ftPct: 0.03 })

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** One player's draw seed: the same (seed, id) gives the same season whatever order players are asked for. */
function playerSeed(seed: number, espnId: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ espnId
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Seasons as they turn out: each player's projection with error drawn once per (seed, player). Games
 * scale every counting stat and attempt total; each stat then varies on its own; FG% and FT% shift.
 */
export function truthFrom(proj: ProjectionSource, seed: number): ProjectionSource {
  const E = PROJECTION_ERROR
  const drawn = new Map<number, SeasonLine | null>()
  return (id) => {
    const hit = drawn.get(id)
    if (hit !== undefined) return hit
    const p = proj(id)
    let out: SeasonLine | null = null
    if (p) {
      const r = mulberry32(playerSeed(seed, id))
      const g = clamp(1 + E.games * normal(r), E.gamesMin, E.gamesMax)
      const vary = (x: number) => x * g * Math.exp(E.stat * normal(r) - (E.stat * E.stat) / 2)
      const made = (m: number, a: number, sd: number, att: number) => (a > 0 ? clamp(m / a + sd * normal(r), 0, 1) * att : 0)
      const pts = vary(p.pts)
      const reb = vary(p.reb)
      const ast = vary(p.ast)
      const stl = vary(p.stl)
      const blk = vary(p.blk)
      const tpm = vary(p.tpm)
      const to = vary(p.to)
      const fga = vary(p.fga)
      const fta = vary(p.fta)
      out = { pts, reb, ast, stl, blk, tpm, to, fga, fgm: made(p.fgm, p.fga, E.fgPct, fga), fta, ftm: made(p.ftm, p.fta, E.ftPct, fta) }
    }
    drawn.set(id, out)
    return out
  }
}
