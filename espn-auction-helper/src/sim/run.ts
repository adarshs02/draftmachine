import { toSettings } from '../espn/league'
import type { PlayerValue } from '../values/types'
import { AuctionSim, runToEnd } from './auction'
import { createAgent, type PolicyName } from './policies'
import { scoreTeams, type ProjectionSource, type TeamScore } from './score'
import { defaultOptions, simLeague, simPlayers, simTeams, type SimOptions } from './setup'
import { createTracker } from './tracker'
import type { SimSale } from './types'

export interface DraftResult {
  policy: PolicyName
  seed: number
  sales: SimSale[]
  moneyLeft: number
  /** sum over my roster of projected value (PlayerValue.consensus) minus price paid */
  valueCaptured: number
  /** my team's projected H2H season, or null without projections */
  mine: TeamScore | null
  missingProjections: number
  standings: TeamScore[] | null
}

export interface DraftInput {
  seed: number
  policy: PolicyName
  values: PlayerValue[]
  projections: ProjectionSource | null
  options?: Partial<SimOptions>
}

/** One headless draft: my team plays `policy` against the bots; same seed = same bots and same draws. */
export function runDraft(input: DraftInput): DraftResult {
  const o: SimOptions = { ...defaultOptions(input.seed), ...input.options, seed: input.seed }
  const players = simPlayers(input.values)
  const tracker = createTracker(input.values, toSettings(simLeague(o, simTeams(o))), o.myTeamId)
  const sim = new AuctionSim(o, players, { onLine: (line) => tracker.push(line) }, createAgent(input.policy, tracker, players))
  runToEnd(sim)
  const me = sim.teams.find((t) => t.id === o.myTeamId)!
  const consensus = new Map(players.map((p) => [p.espnId, p.consensus]))
  const valueCaptured = sim.sales.filter((x) => x.teamId === me.id).reduce((s, x) => s + (consensus.get(x.espnId) ?? 0) - x.price, 0)
  const standings = input.projections ? scoreTeams(new Map(sim.teams.map((t) => [t.id, t.roster])), input.projections, input.seed) : null
  const mine = standings?.find((t) => t.teamId === me.id) ?? null
  return {
    policy: input.policy,
    seed: input.seed,
    sales: sim.sales,
    moneyLeft: me.budget,
    valueCaptured,
    mine,
    missingProjections: mine?.missingProjections ?? 0,
    standings,
  }
}

export interface Summary {
  label: string
  drafts: number
  /** my average title odds over the drafts */
  titlePct: number | null
  /** half-width of the 95% interval: 1.96 x sample sd / sqrt(n) */
  titleCi: number | null
  playoffPct: number | null
  avgSeed: number | null
  /** expected share of weekly categories won */
  winPct: number | null
  avgValueCaptured: number
  valueCi: number
  avgMoneyLeft: number
  avgMissingProjections: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
function ci95(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
  return (1.96 * sd) / Math.sqrt(xs.length)
}

export function summarize(label: string, results: DraftResult[]): Summary {
  const seasons = results.flatMap((r) => (r.mine === null ? [] : [r.mine]))
  const values = results.map((r) => r.valueCaptured)
  const avg = (f: (t: TeamScore) => number) => (seasons.length > 0 ? mean(seasons.map(f)) : null)
  return {
    label,
    drafts: results.length,
    titlePct: avg((t) => t.titlePct),
    titleCi: seasons.length > 0 ? ci95(seasons.map((t) => t.titlePct)) : null,
    playoffPct: avg((t) => t.playoffPct),
    avgSeed: avg((t) => t.avgSeed),
    winPct: avg((t) => t.winPct),
    avgValueCaptured: mean(values),
    valueCi: ci95(values),
    avgMoneyLeft: mean(results.map((r) => r.moneyLeft)),
    avgMissingProjections: mean(results.map((r) => r.missingProjections)),
  }
}

const NONE = '—'
const withCi = (m: number | null, ci: number | null, digits: number) => (m === null ? NONE : `${m.toFixed(digits)} ±${(ci ?? 0).toFixed(digits)}`)
const pct = (x: number | null) => (x === null ? NONE : `${(x * 100).toFixed(1)}%`)

export function formatTable(rows: Summary[]): string {
  const header = ['config · policy', 'drafts', 'title %', 'playoffs %', 'avg seed', 'weekly cats %', 'value captured', '$ left']
  const body = rows.map((r) => [
    r.label,
    String(r.drafts),
    r.titlePct === null ? NONE : `${pct(r.titlePct)} ±${((r.titleCi ?? 0) * 100).toFixed(1)}`,
    pct(r.playoffPct),
    r.avgSeed === null ? NONE : r.avgSeed.toFixed(2),
    pct(r.winPct),
    withCi(r.avgValueCaptured, r.valueCi, 1),
    r.avgMoneyLeft.toFixed(1),
  ])
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cols) => cols[i].length)))
  return [header, ...body].map((cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()).join('\n')
}
