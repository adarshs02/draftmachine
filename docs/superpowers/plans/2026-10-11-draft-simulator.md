# Draft Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local simulator for the ESPN auction helper: an interactive page (`npm run sim`) where bot teams run a 10-team salary-cap auction against you while the real panel advises, and a headless batch runner (`npm run sim:batch`) that scores the helper's autopilot against simple baselines over many seeded drafts.

**Architecture:** A pure, seeded, event-driven auction core emits the exact ESPN socket lines (`NOMINATION`/`BID`/`SOLD`/`CLOCK`/`STATE`). The page feeds them to the real controller and Panel; the batch runner feeds them to a lightweight tracker (decoder → assembler → reducer) and an autopilot that mirrors the panel's BID/BID UP rules. Scoring uses projected 9-category roto standings from a projections file produced by separate work.

**Tech Stack:** TypeScript 7 strict, esbuild (bundle + serve + live reload), Preact 11 + htm, vitest 5 (+ jsdom), tsx.

**Spec:** `docs/superpowers/specs/2026-10-11-draft-simulator-design.md`

## Global Constraints

- **Work only in the worktree** `/Users/adarsh/myProjects/draftmachine-sim` (branch `feat/draft-simulator-impl`). All commands run from `/Users/adarsh/myProjects/draftmachine-sim/espn-auction-helper` unless a step says otherwise. **Never read from or write to `/Users/adarsh/myProjects/draftmachine`** — another session is working there.
- **Projections are owned by other work.** Do not fetch, generate or change player projections or `data/espn-players-2027.json` / `data/values.json`. The simulator only *reads* the optional file `data/projections-2027.json` with this contract: a JSON array of `{ "espnId": number, "pts", "reb", "ast", "stl", "blk", "tpm", "to", "fgm", "fga", "ftm", "fta": number }` season totals. Missing file ⇒ no standings (value captured + money left still reported).
- Defaults: 10 teams, $200, 13 roster spots (ESPN default lineup), draft order `[7, 10, 5, 9, 1, 4, 8, 3, 6, 2]`, my team id 1, 9 bots `stars, balanced, value, balanced, stars, balanced, value, balanced, stars`.
- ESPN line formats (from the real recording): `NOMINATION <team> 25000`; `BID <team> <espnId> <amount> 25000 <remainingMs>` (first BID on a player = nomination); `SOLD <team> <espnId> 0 <price> 0`; `CLOCK 6 <remainingMs> <team>`; `STATE 1` / `STATE 2`.
- Clock: 25 000 ms at nomination; after each bid remaining = max(remaining, 10 000 ms); expiry sells to the leader. My nomination times out after 25 000 ms (auto-nominates the top available player at $1).
- ESPN budget rule: max bid = budget − (open slots − 1); teams with full rosters never bid and are skipped for nominations.
- Bots: private value = market × lognormal(σ 0.15, mean 1) × room × personality (stars ×1.15 on market top-15 else ×0.85; balanced ×1; value ×0.9); rooms cold 0.92 / neutral 1 / hot 1.10; pacing: never more than 60% of budget while ≥ 4 slots open; reaction 300–3000 ms; jump bid +2…+5 with probability 0.3 when price < 60% of value; nominate top market 80% else a random player with market < $5; nominations open at $1 after 1000–4000 ms.
- Market price of a player = `market` if > 0 else `max(1, consensus)`.
- Policy names: `autopilot`, `market`, `consensus`. `consensus` is the spec's "espn-value" baseline: ESPN's ROTO value is `PlayerValue.consensus`.
- Batch smoke test: the spec asks for a snapshot of summary numbers. This plan asserts determinism instead (the same seeds give identical summaries), because `data/values.json` is being changed by the parallel projections work and a stored snapshot would break on merge.
- Tunable defaults are exactly today's values; `npm test` (incl. `test/replay.test.ts`) must stay green.
- Bounded commands (machine is often heavily loaded): `npx vitest run <file> --testTimeout=30000 --hookTimeout=30000`, Bash timeout ≤ 300000 ms; full suite + `npm run typecheck` once per task before committing.
- Commits: explicit `git add` paths; message ends with your own `Co-Authored-By:` line as a second `-m`.
- UI uses `htm` with Preact `h` (`src/ui/html.ts`); no JSX.

## Review Focus

1. **A draft must always finish** even with nobody acting for "me" (manual agent, no clicks): my nominations time out and auto-nominate; when bots are full my players sell at $1. Pinned in Task 3 (`completes with the manual agent`).
2. **No team ever breaks ESPN rules** — bots, autopilot and the user's own `myBid`/`myNominate` (max bid, full roster, beat the price, my turn). Pinned in Task 3 (budget-rule replay test and `myBid`/`myNominate` validation tests).
3. **Missing projections never crash** — scoring, batch and page fall back to value captured + money left. Pinned in Tasks 6, 7, 9 and 10 (`projections: null` paths).
4. **Tunables never leak between batch configurations** and the page's drawer edits are reversible. Pinned in Task 7 (`runBatch` resets before each config and in `finally`) and Task 10 (drawer Reset test).
5. **"Run to end" / instant speed can't hang the page** — bounded loop with an explicit guard. Pinned in Task 3 (`runToEnd` guard) and Task 9 (`FINISH_GUARD`, `finish()` and manual-draft tests).

---

### Task 1: Tunables object

**Files:**
- Modify: `src/engine/constants.ts` (rewrite)
- Modify: `src/engine/metrics.ts`, `src/engine/need.ts`, `src/engine/nominate.ts`, `src/engine/targets.ts`, `src/engine/verdict.ts` (imports + uses only)
- Test: `test/engine/tunables.test.ts`

**Interfaces:**
- Produces: `DEFAULT_TUNABLES` (frozen), `type Tunables`, `type TunableName`, `TUNABLES` (mutable, read by the engine at call time), `setTunables(overrides: Partial<Tunables>): void`, `resetTunables(): void`.

- [ ] **Step 1: Write the failing test**

`test/engine/tunables.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TUNABLES, resetTunables, setTunables, TUNABLES } from '../../src/engine/constants'
import { verdict } from '../../src/engine/verdict'
import { build, nominated, pv, settings } from '../helpers'

afterEach(() => resetTunables())

describe('tunables', () => {
  it('start at the validated defaults', () => {
    expect(TUNABLES).toEqual(DEFAULT_TUNABLES)
    expect(TUNABLES.HOT).toBe(1.05)
    expect(TUNABLES.BID_GAP_FRACTION).toBe(0.25)
  })

  it('setTunables changes the engine on the next call; resetTunables restores', () => {
    // All-bench lineup (no need boost); inflation pinned at 1.2 -> Alpha a = 35.8, ceiling 35.
    const s = build(settings(4, { lineupSlotCounts: { 12: 13 } }), [pv('Alpha', 30)], [nominated('Alpha', 2, 1), { type: 'bid', teamId: 3, amount: 30 }])
    expect(verdict(s)!.kind).toBe('BID_UP') // gap 5.8 < max(3, 0.25 * 35.8)
    setTunables({ BID_GAP_FRACTION: 0.1 }) // gap needed max(3, 3.58)
    expect(verdict(s)!.kind).toBe('BID')
    resetTunables()
    expect(verdict(s)!.kind).toBe('BID_UP')
  })

  it('rejects unknown names and non-numbers', () => {
    expect(() => setTunables({ NOPE: 1 } as never)).toThrow(/unknown tunable NOPE/)
    expect(() => setTunables({ HOT: Number.NaN })).toThrow(/finite/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/engine/tunables.test.ts --testTimeout=30000`
Expected: FAIL — `DEFAULT_TUNABLES` / `TUNABLES` not exported.

- [ ] **Step 3: Rewrite `src/engine/constants.ts`**

```ts
// Tunables. Defaults validated on the Josh Lloyd replay (helper spec §9).
export const DEFAULT_TUNABLES = Object.freeze({
  INFLATION_MIN: 0.8,
  INFLATION_MAX: 1.2,
  TEMP_WINDOW: 12,
  TEMP_MIN_SALES: 4,
  TEMP_MIN_VALUE: 5,
  HOT: 1.05,
  WARM: 1.02,
  COLD: 0.95,
  STAR_TIER_MAX: 2,
  BARGAIN_RATIO: 0.95,
  BID_GAP_MIN: 3,
  BID_GAP_FRACTION: 0.25,
  BID_UP_MARGIN: 2,
  NEED_BOOST: 1.1,
  THIN_FACTOR: 1.5,
  NEED_MIN_VALUE: 5,
  ONE_PLAYER_SHARE: 0.35,
  TWO_PLAYER_SHARE: 0.7,
  EARLY_MONEY: 0.6,
  DOLLAR_MONEY: 0.15,
  DECOY_MARKET_RATIO: 1.1,
  TARGET_BAND: 0.5,
  TARGET_LIMIT: 10,
})

export type Tunables = { -readonly [K in keyof typeof DEFAULT_TUNABLES]: number }
export type TunableName = keyof Tunables

/** Live values the engine reads on every call; the simulator's batch runner and tunables drawer change them. */
export const TUNABLES: Tunables = { ...DEFAULT_TUNABLES }

export function setTunables(overrides: Partial<Tunables>): void {
  for (const [name, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(DEFAULT_TUNABLES, name)) throw new Error(`unknown tunable ${name}`)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`tunable ${name} must be a finite number`)
    TUNABLES[name as TunableName] = value
  }
}

export function resetTunables(): void {
  Object.assign(TUNABLES, DEFAULT_TUNABLES)
}
```

- [ ] **Step 4: Point the engine at `TUNABLES`**

In each of `src/engine/metrics.ts`, `need.ts`, `nominate.ts`, `targets.ts`, `verdict.ts`:
- replace the `import { … } from './constants'` line with `import { TUNABLES } from './constants'`;
- replace every use of an imported constant `NAME` with `TUNABLES.NAME` (including default parameters, e.g. `limit = TUNABLES.TARGET_LIMIT` in `targetList`). Behavior must not change.

Verify nothing still uses the old names directly:

```bash
grep -nE "\b(INFLATION_MIN|INFLATION_MAX|TEMP_WINDOW|TEMP_MIN_SALES|TEMP_MIN_VALUE|HOT|WARM|COLD|STAR_TIER_MAX|BARGAIN_RATIO|BID_GAP_MIN|BID_GAP_FRACTION|BID_UP_MARGIN|NEED_BOOST|THIN_FACTOR|NEED_MIN_VALUE|ONE_PLAYER_SHARE|TWO_PLAYER_SHARE|EARLY_MONEY|DOLLAR_MONEY|DECOY_MARKET_RATIO|TARGET_BAND|TARGET_LIMIT)\b" src/engine/*.ts | grep -v "TUNABLES\.\|constants.ts"
```

Expected: no output.

- [ ] **Step 5: Run the new test, the full suite and typecheck**

Run: `npx vitest run test/engine/tunables.test.ts --testTimeout=30000` → PASS; then `npx vitest run --testTimeout=30000 --hookTimeout=30000` → all pass (295 + 3); `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/constants.ts src/engine/metrics.ts src/engine/need.ts src/engine/nominate.ts src/engine/targets.ts src/engine/verdict.ts test/engine/tunables.test.ts
git commit -m "refactor(helper): tunables object the engine reads at call time" -m "<your Co-Authored-By line>"
```

---

### Task 2: Seeded RNG, simulator types, bots

**Files:**
- Create: `src/sim/rng.ts`, `src/sim/types.ts`, `src/sim/bots.ts`
- Test: `test/sim/rng.test.ts`, `test/sim/bots.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = () => number`; `mulberry32(seed: number): Rng`; `uniform(r, lo, hi)`; `normal(r)`; `pick(r, xs)`
  - `interface SimPlayer { espnId: number; key: string; name: string; market: number; consensus: number }`
  - `type BotKind = 'stars' | 'balanced' | 'value'`
  - `interface SimTeam { id: number; name: string; bot: BotKind | null; budget: number; roster: number[] }`
  - `interface SimSale { espnId: number; teamId: number; price: number }`
  - `ROOMS = { cold: 0.92, neutral: 1, hot: 1.1 }`, `DEFAULT_BOT_MIX: BotKind[]`, `marketPrice(p)`, `personalityFactor(kind, isStar)`, `drawBotValues(r, kind, players, room): Map<number, number>`, `maxBid(budget, open)`, `botCap(value, budget, open)`, `botRaise(r, price, cap, value): number | null`, `botNominate(r, available): SimPlayer`

- [ ] **Step 1: Write the failing tests**

`test/sim/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mulberry32, normal, pick, uniform } from '../../src/sim/rng'

describe('rng', () => {
  it('is deterministic per seed and in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 1000 }, () => a())
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(mulberry32(43)()).not.toBe(mulberry32(42)())
  })

  it('normal has mean ~0 and sd ~1', () => {
    const r = mulberry32(7)
    const xs = Array.from({ length: 20000 }, () => normal(r))
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
    expect(Math.abs(mean)).toBeLessThan(0.03)
    expect(Math.abs(sd - 1)).toBeLessThan(0.03)
  })

  it('uniform and pick stay in range', () => {
    const r = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const u = uniform(r, 300, 3000)
      expect(u).toBeGreaterThanOrEqual(300)
      expect(u).toBeLessThan(3000)
    }
    expect(['a', 'b', 'c']).toContain(pick(r, ['a', 'b', 'c']))
  })
})
```

`test/sim/bots.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { botCap, botNominate, botRaise, drawBotValues, marketPrice, maxBid, personalityFactor } from '../../src/sim/bots'
import { mulberry32 } from '../../src/sim/rng'
import type { SimPlayer } from '../../src/sim/types'

const P = (espnId: number, market: number, consensus = market): SimPlayer => ({ espnId, key: `p${espnId}`, name: `P${espnId}`, market, consensus })

describe('bots', () => {
  it('market price falls back to consensus, never below $1', () => {
    expect(marketPrice(P(1, 20, 10))).toBe(20)
    expect(marketPrice(P(1, 0, 10))).toBe(10)
    expect(marketPrice(P(1, 0, 0))).toBe(1)
  })

  it('personalities', () => {
    expect(personalityFactor('stars', true)).toBe(1.15)
    expect(personalityFactor('stars', false)).toBe(0.85)
    expect(personalityFactor('balanced', true)).toBe(1)
    expect(personalityFactor('value', false)).toBe(0.9)
  })

  it('private values average to market x room for a balanced bot (lognormal noise has mean 1)', () => {
    const players = Array.from({ length: 4000 }, (_, i) => P(i + 1, 20))
    const values = drawBotValues(mulberry32(3), 'balanced', players, 1.1)
    const mean = [...values.values()].reduce((s, x) => s + x, 0) / values.size
    expect(mean).toBeGreaterThan(22 * 0.98)
    expect(mean).toBeLessThan(22 * 1.02)
  })

  it('caps follow ESPN max bid and the pacing rule', () => {
    expect(maxBid(100, 5)).toBe(96)
    expect(maxBid(100, 0)).toBe(0)
    expect(botCap(50, 100, 5)).toBe(50)
    expect(botCap(80, 100, 5)).toBe(60) // pacing: 60% of budget while >= 4 open
    expect(botCap(80, 100, 3)).toBe(80)
    expect(botCap(10, 5, 5)).toBe(1)
    expect(botCap(10, 50, 0)).toBe(0)
  })

  it('raises by $1, jumps only when far under value, never past the cap', () => {
    expect(botRaise(() => 0.99, 10, 10, 40)).toBeNull()
    expect(botRaise(() => 0.99, 5, 50, 40)).toBe(6)
    expect(botRaise(() => 0, 5, 50, 40)).toBe(7) // jump: +2 + floor(0 * 4)
    expect(botRaise(() => 0, 9, 10, 40)).toBe(10) // jump capped
    expect(botRaise(() => 0, 30, 50, 40)).toBe(31) // 30 >= 60% of 40: no jump
  })

  it('nominates the top player, or sometimes a cheap throwaway', () => {
    const available = [P(1, 60), P(2, 30), P(3, 2), P(4, 1)]
    expect(botNominate(() => 0.99, available)).toBe(available[0])
    expect(botNominate(() => 0, available)).toBe(available[2]) // cheap list [P3, P4], pick index 0
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/sim --testTimeout=30000` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/sim/rng.ts`:

```ts
export type Rng = () => number

/** Small, fast, seedable PRNG: the same seed gives the same draft. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const uniform = (r: Rng, lo: number, hi: number): number => lo + (hi - lo) * r()

/** Standard normal (Box-Muller). */
export function normal(r: Rng): number {
  const u = Math.max(r(), 1e-12)
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
```

`src/sim/types.ts`:

```ts
export interface SimPlayer {
  espnId: number
  key: string
  name: string
  /** ESPN average price paid */
  market: number
  /** consensus auction value (the values pipeline's consensus) */
  consensus: number
}

export type BotKind = 'stars' | 'balanced' | 'value'

export interface SimTeam {
  id: number
  name: string
  /** null = my team */
  bot: BotKind | null
  budget: number
  /** espnIds won, in order */
  roster: number[]
}

export interface SimSale {
  espnId: number
  teamId: number
  price: number
}
```

`src/sim/bots.ts`:

```ts
import { normal, pick, type Rng } from './rng'
import type { BotKind, SimPlayer } from './types'

export const ROOMS = { cold: 0.92, neutral: 1, hot: 1.1 } as const
export const DEFAULT_BOT_MIX: BotKind[] = ['stars', 'balanced', 'value', 'balanced', 'stars', 'balanced', 'value', 'balanced', 'stars']
export const VALUE_SIGMA = 0.15
export const STAR_COUNT = 15
export const PACING_SHARE = 0.6
export const PACING_MIN_OPEN = 4
export const JUMP_CHANCE = 0.3
export const JUMP_BELOW = 0.6
export const CHEAP_MARKET = 5
export const THROWAWAY_CHANCE = 0.2

export const marketPrice = (p: SimPlayer): number => (p.market > 0 ? p.market : Math.max(1, p.consensus))

export function personalityFactor(kind: BotKind, isStar: boolean): number {
  if (kind === 'stars') return isStar ? 1.15 : 0.85
  if (kind === 'value') return 0.9
  return 1
}

/** A bot's private dollar value for every player, drawn once per draft (lognormal noise with mean 1). */
export function drawBotValues(r: Rng, kind: BotKind, players: readonly SimPlayer[], room: number): Map<number, number> {
  const stars = new Set([...players].sort((a, b) => marketPrice(b) - marketPrice(a)).slice(0, STAR_COUNT).map((p) => p.espnId))
  const values = new Map<number, number>()
  for (const p of players) {
    const noise = Math.exp(VALUE_SIGMA * normal(r) - VALUE_SIGMA ** 2 / 2)
    values.set(p.espnId, marketPrice(p) * noise * room * personalityFactor(kind, stars.has(p.espnId)))
  }
  return values
}

/** ESPN rule: keep $1 for every other open slot. */
export const maxBid = (budget: number, open: number): number => (open > 0 ? Math.max(0, budget - (open - 1)) : 0)

/** Highest price this bot will pay right now, after ESPN's limit and its own pacing. */
export function botCap(value: number, budget: number, open: number): number {
  let cap = Math.min(Math.floor(value), maxBid(budget, open))
  if (open >= PACING_MIN_OPEN) cap = Math.min(cap, Math.floor(budget * PACING_SHARE))
  return Math.max(0, cap)
}

/** The bot's next bid at this price, or null to stay out. */
export function botRaise(r: Rng, price: number, cap: number, value: number): number | null {
  if (price + 1 > cap) return null
  let next = price + 1
  if (price < JUMP_BELOW * value && r() < JUMP_CHANCE) next = price + 2 + Math.floor(r() * 4)
  return Math.min(next, cap)
}

/** `available` must be sorted by market price, highest first. */
export function botNominate(r: Rng, available: readonly SimPlayer[]): SimPlayer {
  if (r() < THROWAWAY_CHANCE) {
    const cheap = available.filter((p) => marketPrice(p) < CHEAP_MARKET)
    if (cheap.length) return pick(r, cheap)
  }
  return available[0]
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/sim --testTimeout=30000` → PASS; `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts src/sim/types.ts src/sim/bots.ts test/sim/rng.test.ts test/sim/bots.test.ts
git commit -m "feat(sim): seeded rng and bot personalities" -m "<your Co-Authored-By line>"
```

---

### Task 3: Simulation setup and the auction core

**Files:**
- Create: `src/sim/setup.ts`, `src/sim/auction.ts`
- Test: `test/sim/auction.test.ts`

**Interfaces:**
- Consumes: Task 2 (`bots`, `rng`, `types`); `LeagueInfo` from `src/espn/league.ts`; `ESPN_DEFAULT_COUNTS` from `src/espn/slots.ts`; `PlayerValue` from `src/values/types.ts`.
- Produces:
  - `USER_PICK_ORDER`, `USER_TEAM_ID`, `ROSTER_SIZE = 13`, `SIM_SWID`, `interface SimOptions { seed; room; botKinds; pickOrder; myTeamId; budget; emitClock }`, `defaultOptions(seed?)`, `simPlayers(values): SimPlayer[]`, `simTeams(o): SimTeam[]`, `simLeague(o, teams): LeagueInfo`
  - `START_MS`, `MIN_AFTER_BID_MS`, `NOMINATE_TIMEOUT_MS`, `CLOCK_EVERY_MS`, `interface Block { espnId; price; leaderId; endsAt }`, `interface AuctionView`, `interface MyAgent { reactionMs; nominate(view); bidCap(view) }`, `MANUAL_AGENT`, `interface SimHooks { onLine(line, time) }`
  - `class AuctionSim implements AuctionView` with `time`, `teams`, `block`, `onClock`, `available`, `sales`, `done`, `myTeamId`, `setAgent(agent)`, `nextEventAt(): number | null`, `advanceTo(t)`, `myBid(amount): string | null`, `myNominate(espnId, amount): string | null`
  - `runToEnd(sim: AuctionSim, guard?: number): void`

- [ ] **Step 1: Write the failing tests**

`test/sim/auction.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AuctionSim, MANUAL_AGENT, MIN_AFTER_BID_MS, NOMINATE_TIMEOUT_MS, runToEnd, START_MS, type MyAgent } from '../../src/sim/auction'
import { maxBid } from '../../src/sim/bots'
import { defaultOptions, ROSTER_SIZE, simPlayers, type SimOptions } from '../../src/sim/setup'
import type { PlayerValue } from '../../src/values/types'

const PLAYERS = simPlayers(JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[])

function runAll(o: SimOptions = defaultOptions(7), agent: MyAgent = MANUAL_AGENT) {
  const lines: Array<{ t: number; line: string }> = []
  const sim = new AuctionSim(o, PLAYERS, { onLine: (line, t) => lines.push({ t, line }) }, agent)
  runToEnd(sim)
  return { sim, lines }
}
const tokens = (line: string) => line.split(' ')

describe('AuctionSim', () => {
  it('completes with the manual agent: every roster full, budgets >= 0', () => {
    const { sim, lines } = runAll()
    expect(sim.done).toBe(true)
    expect(lines[0].line).toBe('STATE 1')
    expect(lines.at(-1)!.line).toBe('STATE 2')
    expect(sim.sales).toHaveLength(10 * ROSTER_SIZE)
    for (const t of sim.teams) {
      expect(t.roster).toHaveLength(ROSTER_SIZE)
      expect(t.budget).toBeGreaterThanOrEqual(0)
    }
  })

  it('never breaks the ESPN max-bid rule and never lets a full roster bid', () => {
    const { lines } = runAll(defaultOptions(11))
    const budget = new Map<number, number>()
    const count = new Map<number, number>()
    for (const { line } of lines) {
      const [verb, team, , a, b] = tokens(line)
      const id = Number(team)
      if (verb === 'BID') {
        const open = ROSTER_SIZE - (count.get(id) ?? 0)
        expect(open).toBeGreaterThan(0)
        expect(Number(a)).toBeLessThanOrEqual(maxBid(budget.get(id) ?? 200, open))
      }
      if (verb === 'SOLD') {
        budget.set(id, (budget.get(id) ?? 200) - Number(b))
        count.set(id, (count.get(id) ?? 0) + 1)
      }
    }
  })

  it('rotates nominations in draft order, skipping full rosters', () => {
    const o = defaultOptions(5)
    const { lines } = runAll(o)
    const count = new Map<number, number>()
    let last: number | null = null
    for (const { line } of lines) {
      const [verb, team] = tokens(line)
      if (verb === 'NOMINATION') {
        const order = o.pickOrder
        const start = last === null ? -1 : order.indexOf(last)
        const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          .map((step) => order[(start + step + order.length) % order.length])
          .find((id) => (count.get(id) ?? 0) < ROSTER_SIZE)
        expect(Number(team)).toBe(expected)
        last = Number(team)
      }
      if (verb === 'SOLD') count.set(Number(team), (count.get(Number(team)) ?? 0) + 1)
    }
  })

  it('runs the ESPN clock: 25 s to start, at least 10 s after the last bid', () => {
    const { lines } = runAll(defaultOptions(9))
    let opened = 0
    let lastBid = 0
    let afterNomination = false
    for (const { t, line } of lines) {
      const [verb, , , , , remaining] = tokens(line)
      if (verb === 'NOMINATION') afterNomination = true
      if (verb === 'BID') {
        if (afterNomination) {
          expect(Number(remaining)).toBe(START_MS)
          opened = t
          afterNomination = false
        }
        lastBid = t
      }
      if (verb === 'SOLD') {
        expect(t).toBeGreaterThanOrEqual(opened + START_MS)
        expect(t).toBeGreaterThanOrEqual(lastBid + MIN_AFTER_BID_MS)
      }
    }
  })

  it('my nomination times out to the top available player at $1', () => {
    const { lines } = runAll(defaultOptions(3))
    const i = lines.findIndex(({ line }) => line === `NOMINATION 1 ${NOMINATE_TIMEOUT_MS}`)
    const bid = lines[i + 1]
    expect(bid.t - lines[i].t).toBe(NOMINATE_TIMEOUT_MS)
    expect(tokens(bid.line).slice(0, 2)).toEqual(['BID', '1'])
    expect(tokens(bid.line)[3]).toBe('1')
  })

  it('is deterministic per seed', () => {
    expect(runAll(defaultOptions(21)).lines).toEqual(runAll(defaultOptions(21)).lines)
    expect(runAll(defaultOptions(21)).lines).not.toEqual(runAll(defaultOptions(22)).lines)
  })

  it('validates my bids and nominations against ESPN rules', () => {
    const sim = new AuctionSim(defaultOptions(4), PLAYERS, { onLine: () => {} })
    expect(sim.myBid(5)).toBe('Nothing is on the block')
    expect(sim.myNominate(PLAYERS[0].espnId, 1)).toBe('Not your turn to nominate')
    while (!sim.block) sim.advanceTo(sim.nextEventAt()!)
    const b = sim.block
    expect(sim.myBid(b.price)).toBe(`Bid must beat $${b.price}`)
    expect(sim.myBid(500)).toBe('Your max bid is $188')
    expect(sim.myBid(b.price + 1)).toBeNull()
    expect(sim.block!.leaderId).toBe(1)
    expect(sim.myBid(b.price + 2)).toBe('You already lead')
  })

  it('an agent that bids follows its cap', () => {
    const greedy: MyAgent = { reactionMs: 500, nominate: () => null, bidCap: () => 3 }
    const { sim } = runAll(defaultOptions(8), greedy)
    expect(sim.sales.filter((x) => x.teamId === 1).every((x) => x.price <= 3)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/sim/auction.test.ts --testTimeout=30000` → FAIL (modules missing).

- [ ] **Step 3: Implement `src/sim/setup.ts`**

```ts
import type { LeagueInfo } from '../espn/league'
import { ESPN_DEFAULT_COUNTS } from '../espn/slots'
import type { PlayerValue } from '../values/types'
import { DEFAULT_BOT_MIX, marketPrice, ROOMS } from './bots'
import type { BotKind, SimPlayer, SimTeam } from './types'

/** The user's league: ESPN nomination order of the test league; the user is team 1, nominating 5th. */
export const USER_PICK_ORDER = [7, 10, 5, 9, 1, 4, 8, 3, 6, 2]
export const USER_TEAM_ID = 1
export const ROSTER_SIZE = 13
/** The simulated user's ESPN member id, so the controller's normal SWID match finds "my team". */
export const SIM_SWID = '{51A10000-0000-0000-0000-000000000001}'

export interface SimOptions {
  seed: number
  room: number
  /** one per bot, assigned in draft order skipping my team */
  botKinds: BotKind[]
  pickOrder: number[]
  myTeamId: number
  budget: number
  /** CLOCK lines every 2 s (the page needs them for the live light; the batch doesn't) */
  emitClock: boolean
}

export const defaultOptions = (seed = 1): SimOptions => ({
  seed,
  room: ROOMS.neutral,
  botKinds: [...DEFAULT_BOT_MIX],
  pickOrder: [...USER_PICK_ORDER],
  myTeamId: USER_TEAM_ID,
  budget: 200,
  emitClock: false,
})

/** Players the room can draft: those with an ESPN id (frames carry ids), most expensive first. */
export function simPlayers(values: readonly PlayerValue[]): SimPlayer[] {
  return values
    .filter((v): v is PlayerValue & { espnId: number } => v.espnId !== null)
    .map((v) => ({ espnId: v.espnId, key: v.key, name: v.name, market: v.market, consensus: v.consensus }))
    .sort((a, b) => marketPrice(b) - marketPrice(a))
}

export function simTeams(o: SimOptions): SimTeam[] {
  const kinds = [...o.botKinds]
  if (kinds.length < o.pickOrder.length - 1) throw new Error(`need ${o.pickOrder.length - 1} bot kinds, got ${kinds.length}`)
  return o.pickOrder.map((id) => {
    const bot = id === o.myTeamId ? null : kinds.shift()!
    return { id, name: bot === null ? 'You' : `Bot ${id} (${bot})`, bot, budget: o.budget, roster: [] }
  })
}

/** The league as the controller sees it: draft order, ESPN default lineup, the sim user owning my team. */
export function simLeague(o: SimOptions, teams: readonly SimTeam[]): LeagueInfo {
  return {
    id: 0,
    draftType: 'AUCTION',
    budget: o.budget,
    rosterSize: ROSTER_SIZE,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    teams: teams.map((t) => ({ id: t.id, name: t.name, owners: t.id === o.myTeamId ? [SIM_SWID] : [] })),
    pickOrder: [...o.pickOrder],
  }
}
```

- [ ] **Step 4: Implement `src/sim/auction.ts`**

```ts
import { botCap, botNominate, botRaise, drawBotValues, marketPrice, maxBid } from './bots'
import { mulberry32, uniform, type Rng } from './rng'
import { ROSTER_SIZE, simTeams, type SimOptions } from './setup'
import type { SimPlayer, SimSale, SimTeam } from './types'

// From the real ESPN recording.
export const START_MS = 25000
export const MIN_AFTER_BID_MS = 10000
export const NOMINATE_TIMEOUT_MS = 25000
export const CLOCK_EVERY_MS = 2000
export const BOT_REACT_MS: readonly [number, number] = [300, 3000]
export const BOT_NOMINATE_MS: readonly [number, number] = [1000, 4000]

export interface Block {
  espnId: number
  price: number
  leaderId: number
  /** sim time the clock runs out */
  endsAt: number
}

export interface AuctionView {
  readonly time: number
  readonly myTeamId: number
  readonly teams: readonly SimTeam[]
  readonly block: Block | null
  readonly onClock: number | null
  readonly available: readonly SimPlayer[]
  readonly sales: readonly SimSale[]
  readonly done: boolean
}

/** How "my team" plays: autopilot, a baseline, or nobody (the page's buttons call myBid / myNominate). */
export interface MyAgent {
  reactionMs: number
  /** My nomination, or null to keep waiting (the sim auto-nominates when my clock runs out). */
  nominate(view: AuctionView): { espnId: number; amount: number } | null
  /** Highest price I'll go to for the player on the block; null or <= price = stay out. */
  bidCap(view: AuctionView): number | null
}

export const MANUAL_AGENT: MyAgent = { reactionMs: 0, nominate: () => null, bidCap: () => null }

export interface SimHooks {
  onLine(line: string, time: number): void
}

type Action =
  | { kind: 'botBid'; teamId: number }
  | { kind: 'myBid' }
  | { kind: 'botNominate'; teamId: number }
  | { kind: 'myNominate' }
  | { kind: 'nominateTimeout' }
  | { kind: 'expire' }
  | { kind: 'clock' }

interface Scheduled {
  at: number
  seq: number
  action: Action
}

/** Event-driven ESPN salary-cap auction: no real waiting, deterministic per seed. */
export class AuctionSim implements AuctionView {
  time = 0
  readonly myTeamId: number
  readonly teams: SimTeam[]
  block: Block | null = null
  onClock: number | null = null
  available: SimPlayer[]
  readonly sales: SimSale[] = []
  done = false

  private readonly rng: Rng
  private readonly botValues = new Map<number, Map<number, number>>()
  private queue: Scheduled[] = []
  private seq = 0
  private lastNominator: number | null = null
  private nominateDeadline = 0

  constructor(
    private readonly o: SimOptions,
    players: readonly SimPlayer[],
    private readonly hooks: SimHooks,
    private agent: MyAgent = MANUAL_AGENT,
  ) {
    this.rng = mulberry32(o.seed)
    this.myTeamId = o.myTeamId
    this.teams = simTeams(o)
    this.available = [...players].sort((a, b) => marketPrice(b) - marketPrice(a))
    for (const t of this.teams) if (t.bot) this.botValues.set(t.id, drawBotValues(this.rng, t.bot, this.available, o.room))
    this.emit('STATE 1')
    if (o.emitClock) this.schedule(CLOCK_EVERY_MS, { kind: 'clock' })
    this.startTurn()
  }

  setAgent(agent: MyAgent): void {
    this.agent = agent
    if (this.onClock === this.myTeamId && !this.block) this.schedule(agent.reactionMs, { kind: 'myNominate' })
    this.replan()
  }

  nextEventAt(): number | null {
    if (this.done || !this.queue.length) return null
    return Math.min(...this.queue.map((q) => q.at))
  }

  /** Runs every event due at or before `t` in order, then moves the clock to `t`. */
  advanceTo(t: number): void {
    for (let next = this.popDue(t); next && !this.done; next = this.popDue(t)) {
      this.time = next.at
      this.run(next.action)
    }
    if (!this.done) this.time = Math.max(this.time, t)
  }

  myBid(amount: number): string | null {
    const b = this.block
    if (!b) return 'Nothing is on the block'
    const me = this.team(this.myTeamId)
    if (b.leaderId === me.id) return 'You already lead'
    if (!Number.isInteger(amount) || amount <= b.price) return `Bid must beat $${b.price}`
    if (amount > this.maxBidOf(me)) return `Your max bid is $${this.maxBidOf(me)}`
    this.placeBid(me.id, amount)
    return null
  }

  myNominate(espnId: number, amount: number): string | null {
    if (this.onClock !== this.myTeamId || this.block) return 'Not your turn to nominate'
    const player = this.available.find((p) => p.espnId === espnId)
    if (!player) return 'That player is not available'
    const me = this.team(this.myTeamId)
    if (!Number.isInteger(amount) || amount < 1 || amount > this.maxBidOf(me)) return `Opening bid must be $1-$${this.maxBidOf(me)}`
    this.openBlock(me.id, player, amount)
    return null
  }

  private team(id: number): SimTeam {
    return this.teams.find((t) => t.id === id)!
  }

  private open(t: SimTeam): number {
    return ROSTER_SIZE - t.roster.length
  }

  private maxBidOf(t: SimTeam): number {
    return maxBid(t.budget, this.open(t))
  }

  private emit(line: string): void {
    this.hooks.onLine(line, this.time)
  }

  private schedule(delay: number, action: Action): void {
    this.queue.push({ at: this.time + delay, seq: this.seq++, action })
  }

  private cancel(kinds: Array<Action['kind']>): void {
    this.queue = this.queue.filter((q) => !kinds.includes(q.action.kind))
  }

  private popDue(t: number): Scheduled | null {
    let best = -1
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i]
      if (q.at > t) continue
      const b = this.queue[best]
      if (best === -1 || q.at < b.at || (q.at === b.at && q.seq < b.seq)) best = i
    }
    return best === -1 ? null : this.queue.splice(best, 1)[0]
  }

  private startTurn(): void {
    const order = this.o.pickOrder
    const hasRoom = (id: number) => this.open(this.team(id)) > 0
    if (!this.available.length || !order.some(hasRoom)) return this.finish()
    const start = this.lastNominator === null ? -1 : order.indexOf(this.lastNominator)
    let teamId = order[0]
    for (let step = 1; step <= order.length; step++) {
      const id = order[(start + step + order.length) % order.length]
      if (hasRoom(id)) {
        teamId = id
        break
      }
    }
    this.onClock = teamId
    this.nominateDeadline = this.time + NOMINATE_TIMEOUT_MS
    this.emit(`NOMINATION ${teamId} ${NOMINATE_TIMEOUT_MS}`)
    if (teamId === this.myTeamId) {
      this.schedule(this.agent.reactionMs, { kind: 'myNominate' })
      this.schedule(NOMINATE_TIMEOUT_MS, { kind: 'nominateTimeout' })
    } else {
      this.schedule(uniform(this.rng, BOT_NOMINATE_MS[0], BOT_NOMINATE_MS[1]), { kind: 'botNominate', teamId })
    }
  }

  private openBlock(teamId: number, player: SimPlayer, amount: number): void {
    this.cancel(['myNominate', 'nominateTimeout', 'botNominate'])
    this.available = this.available.filter((p) => p.espnId !== player.espnId)
    this.onClock = null
    this.lastNominator = teamId
    this.block = { espnId: player.espnId, price: amount, leaderId: teamId, endsAt: this.time + START_MS }
    this.emit(`BID ${teamId} ${player.espnId} ${amount} ${START_MS} ${START_MS}`)
    this.replan()
  }

  private placeBid(teamId: number, amount: number): void {
    const b = this.block!
    b.price = amount
    b.leaderId = teamId
    b.endsAt = Math.max(b.endsAt, this.time + MIN_AFTER_BID_MS)
    this.emit(`BID ${teamId} ${b.espnId} ${amount} ${START_MS} ${b.endsAt - this.time}`)
    this.replan()
  }

  private botCapFor(t: SimTeam): number {
    return botCap(this.botValues.get(t.id)!.get(this.block!.espnId) ?? 0, t.budget, this.open(t))
  }

  private myCap(): number {
    const cap = this.agent.bidCap(this)
    return cap === null ? 0 : Math.min(Math.floor(cap), this.maxBidOf(this.team(this.myTeamId)))
  }

  /** After any change on the block: who wants to raise, and when. */
  private replan(): void {
    this.cancel(['botBid', 'myBid', 'expire'])
    const b = this.block
    if (!b) return
    this.queue.push({ at: b.endsAt, seq: this.seq++, action: { kind: 'expire' } })
    for (const t of this.teams) {
      if (t.id === b.leaderId || this.open(t) === 0) continue
      if (t.bot) {
        if (this.botCapFor(t) > b.price) this.schedule(uniform(this.rng, BOT_REACT_MS[0], BOT_REACT_MS[1]), { kind: 'botBid', teamId: t.id })
      } else if (this.myCap() > b.price) {
        this.schedule(this.agent.reactionMs, { kind: 'myBid' })
      }
    }
  }

  private run(a: Action): void {
    switch (a.kind) {
      case 'clock': {
        const remaining = this.block ? this.block.endsAt - this.time : Math.max(0, this.nominateDeadline - this.time)
        this.emit(`CLOCK 6 ${remaining} ${this.block?.leaderId ?? this.onClock ?? 0}`)
        this.schedule(CLOCK_EVERY_MS, { kind: 'clock' })
        return
      }
      case 'botNominate':
        this.openBlock(a.teamId, botNominate(this.rng, this.available), 1)
        return
      case 'myNominate': {
        const pick = this.agent.nominate(this)
        if (pick) this.myNominate(pick.espnId, pick.amount)
        return
      }
      case 'nominateTimeout':
        // ESPN nominates for a team whose clock runs out.
        if (this.onClock === this.myTeamId && !this.block) this.openBlock(this.myTeamId, this.available[0], 1)
        return
      case 'botBid': {
        const t = this.team(a.teamId)
        const b = this.block!
        const next = botRaise(this.rng, b.price, this.botCapFor(t), this.botValues.get(t.id)!.get(b.espnId) ?? 0)
        if (next !== null) this.placeBid(t.id, next)
        return
      }
      case 'myBid':
        if (this.block && this.myCap() > this.block.price) this.placeBid(this.myTeamId, this.block.price + 1)
        return
      case 'expire':
        this.sell()
        return
    }
  }

  private sell(): void {
    const b = this.block!
    const t = this.team(b.leaderId)
    t.budget -= b.price
    t.roster.push(b.espnId)
    this.sales.push({ espnId: b.espnId, teamId: t.id, price: b.price })
    this.emit(`SOLD ${t.id} ${b.espnId} 0 ${b.price} 0`)
    this.block = null
    this.cancel(['botBid', 'myBid', 'expire'])
    this.startTurn()
  }

  private finish(): void {
    this.done = true
    this.onClock = null
    this.queue = []
    this.emit('STATE 2')
  }
}

/** Runs a draft to the end without waiting; the guard stops a runaway loop instead of hanging. */
export function runToEnd(sim: AuctionSim, guard = 1_000_000): void {
  for (let i = 0; !sim.done; i++) {
    if (i >= guard) throw new Error('simulation did not finish')
    const next = sim.nextEventAt()
    if (next === null) throw new Error('simulation stalled with nothing scheduled')
    sim.advanceTo(next)
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/sim/auction.test.ts --testTimeout=30000` → PASS (8 tests). If `Your max bid is $188` differs, check the max-bid rule (200 − 12) before changing the test. Then full suite + `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/setup.ts src/sim/auction.ts test/sim/auction.test.ts
git commit -m "feat(sim): event-driven ESPN auction core with bots" -m "<your Co-Authored-By line>"
```

---

### Task 4: Tracker and the round-trip proof

**Files:**
- Create: `src/sim/tracker.ts`
- Test: `test/sim/tracker.test.ts`

**Interfaces:**
- Consumes: `decodeLine` (`src/capture/decoder.ts`), `createAssembler` (`src/capture/assembler.ts`), `initialState`/`reduce` (`src/engine/reducer.ts`), `rescaleToLeague` (`src/values/rescale.ts`), `toSettings` (`src/espn/league.ts`), Task 3.
- Produces: `interface Tracker { readonly state: DraftState; keyOf(espnId: number): string; push(line: string): void }`, `createTracker(values: PlayerValue[], settings: Settings, myTeamId: number): Tracker`

- [ ] **Step 1: Write the failing test**

`test/sim/tracker.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toSettings } from '../../src/espn/league'
import { AuctionSim, runToEnd } from '../../src/sim/auction'
import { defaultOptions, simLeague, simPlayers, simTeams } from '../../src/sim/setup'
import { createTracker } from '../../src/sim/tracker'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]

describe('tracker', () => {
  it.each([1, 2, 3])('round trip (seed %i): the real decoder + engine rebuild the sim ledger exactly', (seed) => {
    const o = defaultOptions(seed)
    const tracker = createTracker(VALUES, toSettings(simLeague(o, simTeams(o))), o.myTeamId)
    const sim = new AuctionSim(o, simPlayers(VALUES), { onLine: (line) => tracker.push(line) })
    runToEnd(sim)
    expect(tracker.state.sales.map((x) => [x.playerKey, x.teamId, x.price])).toEqual(
      sim.sales.map((x) => [tracker.keyOf(x.espnId), x.teamId, x.price]),
    )
    expect(tracker.state.live).toBeNull()
  })

  it('follows the block and the nominating team as lines arrive', () => {
    const o = defaultOptions(1)
    const tracker = createTracker(VALUES, toSettings(simLeague(o, simTeams(o))), o.myTeamId)
    const sim = new AuctionSim(o, simPlayers(VALUES), { onLine: (line) => tracker.push(line) })
    expect(tracker.state.turnTeamId).toBe(7)
    while (!sim.block) sim.advanceTo(sim.nextEventAt()!)
    expect(tracker.state.live).toEqual({ playerKey: tracker.keyOf(sim.block.espnId), price: sim.block.price, leaderId: sim.block.leaderId })
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/sim/tracker.test.ts --testTimeout=30000` → FAIL (module missing).

- [ ] **Step 3: Implement `src/sim/tracker.ts`**

```ts
import { createAssembler } from '../capture/assembler'
import { decodeLine } from '../capture/decoder'
import { initialState, reduce } from '../engine/reducer'
import type { DraftState, Settings } from '../engine/types'
import { rescaleToLeague } from '../values/rescale'
import type { PlayerValue } from '../values/types'

export interface Tracker {
  readonly state: DraftState
  keyOf(espnId: number): string
  push(line: string): void
}

/** The panel's draft state built from socket lines exactly as the controller does, minus storage, alerts and rendering. */
export function createTracker(values: PlayerValue[], settings: Settings, myTeamId: number): Tracker {
  const scaled = rescaleToLeague(values, { teams: settings.teams.length, budget: settings.budget, rosterSize: settings.rosterSize })
  let state = initialState(settings, scaled, myTeamId)
  const byEspnId = new Map(scaled.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, v.key] as const])))
  const keyOf = (espnId: number) => byEspnId.get(espnId) ?? `espn:${espnId}`
  const assembler = createAssembler(keyOf, () => state.live)
  return {
    get state() {
      return state
    },
    keyOf,
    push(line) {
      const raw = decodeLine(line)
      if (!raw || raw.kind === 'unknown') return
      if (raw.kind === 'turn') {
        state = reduce(state, { type: 'turn', teamId: raw.teamId })
        return
      }
      for (const ev of assembler.push(raw)) state = reduce(state, ev)
    },
  }
}
```

- [ ] **Step 4: Run tests** — the file passes; full suite + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tracker.ts test/sim/tracker.test.ts
git commit -m "feat(sim): tracker; sim lines round-trip through the real decoder and engine" -m "<your Co-Authored-By line>"
```

---

### Task 5: My-team policies (autopilot + baselines)

**Files:**
- Create: `src/sim/policies.ts`
- Test: `test/sim/policies.test.ts`

**Interfaces:**
- Consumes: `adjustedValue`, `inflation`, `temperature`, `valueOf` (`metrics.ts`), `ceilingFor` (`verdict.ts`), `suggestNomination` (`nominate.ts`), `TUNABLES`, Tasks 2-4.
- Produces:
  - `type PolicyName = 'autopilot' | 'market' | 'consensus'`, `POLICIES: PolicyName[]`
  - `autopilotCap(s: DraftState, key: string): number` — highest price the panel's BID/BID UP rules would bid to
  - `interface StateSource { readonly state: DraftState; keyOf(espnId: number): string }`
  - `createAgent(name: PolicyName, source: StateSource, players: readonly SimPlayer[]): MyAgent`
  - `AUTOPILOT_REACTION_MS = 1000`

- [ ] **Step 1: Write the failing tests**

`test/sim/policies.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reduce } from '../../src/engine/reducer'
import { verdict } from '../../src/engine/verdict'
import { toSettings } from '../../src/espn/league'
import { AuctionSim, runToEnd } from '../../src/sim/auction'
import { marketPrice } from '../../src/sim/bots'
import { autopilotCap, createAgent } from '../../src/sim/policies'
import { defaultOptions, simLeague, simPlayers, simTeams } from '../../src/sim/setup'
import { createTracker } from '../../src/sim/tracker'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const PLAYERS = simPlayers(VALUES)
const O = defaultOptions(1)
const SETTINGS = toSettings(simLeague(O, simTeams(O)))

/** A tracker after `sales` sales of a market-baseline draft, to test on mid-draft states too. */
function trackerAfter(sales: number) {
  const tracker = createTracker(VALUES, SETTINGS, O.myTeamId)
  const sim = new AuctionSim(O, PLAYERS, { onLine: (line) => tracker.push(line) }, createAgent('market', tracker, PLAYERS))
  while (!sim.done && sim.sales.length < sales) sim.advanceTo(sim.nextEventAt()!)
  return { tracker, sim }
}

describe('autopilotCap', () => {
  it.each([0, 40, 90])('matches the panel exactly: BID or BID UP <=> price + 1 <= cap (after %i sales)', (sales) => {
    const { tracker, sim } = trackerAfter(sales)
    const base = { ...tracker.state, live: null }
    for (const p of sim.available.slice(0, 25)) {
      const key = tracker.keyOf(p.espnId)
      const at = (price: number) => reduce(base, { type: 'nominated', playerKey: key, teamId: 7, amount: price })
      // The agent computes the cap once, when the player opens at $1.
      const cap = autopilotCap(at(1), key)
      for (let price = 1; price <= 60; price++) {
        const kind = verdict(at(price))!.kind
        expect([price, kind, price + 1 <= cap]).toEqual([price, kind, kind === 'BID' || kind === 'BID_UP'])
      }
    }
  })
})

describe('agents', () => {
  it('market bids to the market price; consensus to the consensus value', () => {
    const { tracker, sim } = trackerAfter(0)
    while (!sim.block) sim.advanceTo(sim.nextEventAt()!)
    const p = PLAYERS.find((x) => x.espnId === sim.block!.espnId)!
    expect(createAgent('market', tracker, PLAYERS).bidCap(sim)).toBe(Math.round(marketPrice(p)))
    expect(createAgent('consensus', tracker, PLAYERS).bidCap(sim)).toBe(Math.round(p.consensus))
  })

  it('autopilot nominates an available player and plays a whole draft within ESPN rules', () => {
    const tracker = createTracker(VALUES, SETTINGS, O.myTeamId)
    const agent = createAgent('autopilot', tracker, PLAYERS)
    const sim = new AuctionSim(O, PLAYERS, { onLine: (line) => tracker.push(line) }, agent)
    runToEnd(sim)
    const me = sim.teams.find((t) => t.id === 1)!
    expect(me.roster).toHaveLength(13)
    expect(me.budget).toBeGreaterThanOrEqual(0)
    expect(sim.sales.filter((x) => x.teamId === 1).length).toBe(13)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/sim/policies.test.ts --testTimeout=60000` → FAIL (module missing).

- [ ] **Step 3: Implement `src/sim/policies.ts`**

```ts
import { TUNABLES } from '../engine/constants'
import { adjustedValue, inflation, temperature, valueOf } from '../engine/metrics'
import { suggestNomination } from '../engine/nominate'
import type { DraftState } from '../engine/types'
import { ceilingFor } from '../engine/verdict'
import type { AuctionView, MyAgent } from './auction'
import { marketPrice } from './bots'
import type { SimPlayer } from './types'

export type PolicyName = 'autopilot' | 'market' | 'consensus'
export const POLICIES: PolicyName[] = ['autopilot', 'market', 'consensus']
export const AUTOPILOT_REACTION_MS = 1000

export interface StateSource {
  readonly state: DraftState
  keyOf(espnId: number): string
}

/**
 * Highest price the panel's verdict would keep bidding to for `key` with a rival leading:
 * BID while price < ceiling and (target or a - price >= gap); BID UP while price < pushTo.
 * Depends only on sales, values and tunables, so it is computed once per block.
 */
export function autopilotCap(s: DraftState, key: string): number {
  if (valueOf(s, key).avoid) return 0
  const a = adjustedValue(s, key, inflation(s), temperature(s).label)
  const ceiling = ceilingFor(s, key, a)
  if (s.targets.includes(key)) return ceiling
  const gap = Math.max(TUNABLES.BID_GAP_MIN, TUNABLES.BID_GAP_FRACTION * a)
  const bidTo = Math.min(ceiling, Math.floor(a - gap) + 1)
  const pushTo = Math.min(ceiling, Math.floor(a - TUNABLES.BID_UP_MARGIN))
  return Math.max(0, bidTo, pushTo)
}

export function createAgent(name: PolicyName, source: StateSource, players: readonly SimPlayer[]): MyAgent {
  const byId = new Map(players.map((p) => [p.espnId, p]))
  const byKey = new Map(players.map((p) => [p.key, p.espnId]))
  const topAvailable = (view: AuctionView) => (view.available.length ? { espnId: view.available[0].espnId, amount: 1 } : null)
  const blockPlayer = (view: AuctionView) => (view.block ? byId.get(view.block.espnId) ?? null : null)

  if (name === 'autopilot') {
    let capFor: { espnId: number; cap: number } | null = null
    return {
      reactionMs: AUTOPILOT_REACTION_MS,
      nominate(view) {
        const pick = suggestNomination(source.state)
        const espnId = pick ? byKey.get(pick.playerKey) : undefined
        if (espnId !== undefined && view.available.some((p) => p.espnId === espnId)) return { espnId, amount: 1 }
        return topAvailable(view)
      },
      bidCap(view) {
        if (!view.block) return null
        if (capFor?.espnId !== view.block.espnId) capFor = { espnId: view.block.espnId, cap: autopilotCap(source.state, source.keyOf(view.block.espnId)) }
        return capFor.cap
      },
    }
  }
  return {
    reactionMs: AUTOPILOT_REACTION_MS,
    nominate: topAvailable,
    bidCap(view) {
      const p = blockPlayer(view)
      if (!p) return null
      return Math.round(name === 'market' ? marketPrice(p) : p.consensus)
    },
  }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run test/sim/policies.test.ts --testTimeout=60000` passes; full suite + typecheck clean. If the equivalence test fails, print `{ price, kind, cap, a, ceiling }` for the first mismatch and fix `autopilotCap` — never loosen the test.

- [ ] **Step 5: Commit**

```bash
git add src/sim/policies.ts test/sim/policies.test.ts
git commit -m "feat(sim): autopilot mirrors the panel's calls; market and consensus baselines" -m "<your Co-Authored-By line>"
```

---

### Task 6: Projected 9-category roto scoring

**Files:**
- Create: `src/sim/score.ts`
- Test: `test/sim/score.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure).
- Produces:
  - `interface SeasonLine { pts; reb; ast; stl; blk; tpm; to; fgm; fga; ftm; fta: number }`
  - `type ProjectionSource = (espnId: number) => SeasonLine | null`
  - `CATEGORIES` (`'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tpm' | 'fgPct' | 'ftPct' | 'to'`), `type Category`, `CATEGORY_LABELS: Record<Category, string>`
  - `interface TeamScore { teamId; totals: Record<Category, number>; points: Record<Category, number>; total; rank; missingProjections }`
  - `teamTotals(espnIds, proj): { totals: Record<Category, number>; missing: number }`
  - `scoreTeams(rosters: ReadonlyMap<number, readonly number[]>, proj): TeamScore[]` (sorted by rank, then team id)
  - `PROJECTIONS_PATH = 'data/projections-2027.json'`, `parseProjectionFile(json: unknown): Map<number, SeasonLine>`, `projectionsFrom(rows): ProjectionSource`

- [ ] **Step 1: Write the failing tests**

`test/sim/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseProjectionFile, projectionsFrom, scoreTeams, teamTotals, type SeasonLine } from '../../src/sim/score'

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

describe('projections file', () => {
  it('reads the contract, ignores extra fields, rejects malformed rows', () => {
    const rows = parseProjectionFile([{ espnId: 7, name: 'Extra fields are fine', ...line(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) }])
    expect(rows.get(7)).toEqual(line(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11))
    expect(() => parseProjectionFile({})).toThrow('projections file must be a JSON array')
    expect(() => parseProjectionFile([{ espnId: 1, pts: 'x' }])).toThrow('projections row 0: pts must be a number')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/sim/score.test.ts --testTimeout=30000` → FAIL (module missing).

- [ ] **Step 3: Implement `src/sim/score.ts`**

```ts
/** Season totals for one player (ESPN 2026-27 projection), from data/projections-2027.json. */
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

export type ProjectionSource = (espnId: number) => SeasonLine | null

export const CATEGORIES = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'fgPct', 'ftPct', 'to'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_LABELS: Record<Category, string> = {
  pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', fgPct: 'FG%', ftPct: 'FT%', to: 'TO',
}

/** Written by the projections work (not the simulator). */
export const PROJECTIONS_PATH = 'data/projections-2027.json'
const LINE_FIELDS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'to', 'fgm', 'fga', 'ftm', 'fta'] as const

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

export function parseProjectionFile(json: unknown): Map<number, SeasonLine> {
  if (!Array.isArray(json)) throw new Error('projections file must be a JSON array')
  const rows = new Map<number, SeasonLine>()
  json.forEach((row: unknown, i) => {
    const r = (row ?? {}) as Record<string, unknown>
    const bad = ['espnId', ...LINE_FIELDS].find((f) => typeof r[f] !== 'number' || !Number.isFinite(r[f]))
    if (bad) throw new Error(`projections row ${i}: ${bad} must be a number`)
    rows.set(r.espnId as number, Object.fromEntries(LINE_FIELDS.map((f) => [f, r[f] as number])) as unknown as SeasonLine)
  })
  return rows
}

export const projectionsFrom = (rows: ReadonlyMap<number, SeasonLine>): ProjectionSource => (id) => rows.get(id) ?? null
```

- [ ] **Step 4: Run tests** — file passes; full suite + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/score.ts test/sim/score.test.ts
git commit -m "feat(sim): projected 9-category roto scoring and the projections contract" -m "<your Co-Authored-By line>"
```

---

### Task 7: Headless batch runner

**Files:**
- Create: `src/sim/run.ts`, `src/sim/batchArgs.ts`, `src/sim/batch.ts`, `scripts/sim-batch.ts`
- Modify: `package.json` (add `"sim:batch": "tsx scripts/sim-batch.ts"` after `"analyze"`)
- Test: `test/sim/run.test.ts`, `test/sim/batch.test.ts`

**Interfaces:**
- Consumes: Tasks 1-6 (`TUNABLES`, `DEFAULT_TUNABLES`, `setTunables`, `resetTunables`, `Tunables`, `TunableName`; `AuctionSim`, `runToEnd`; `createTracker`; `createAgent`, `POLICIES`, `PolicyName`; `scoreTeams`, `ProjectionSource`, `TeamScore`, `Category`, `parseProjectionFile`, `projectionsFrom`, `PROJECTIONS_PATH`; `ROOMS`; `defaultOptions`, `simLeague`, `simPlayers`, `simTeams`), `toSettings`.
- Produces:
  - `interface DraftResult { policy; seed; sales: SimSale[]; moneyLeft; valueCaptured; myRank: number | null; myPoints: number | null; myCategoryPoints: Record<Category, number> | null; missingProjections; standings: TeamScore[] | null }`
  - `interface DraftInput { seed; policy: PolicyName; values: PlayerValue[]; projections: ProjectionSource | null; options?: Partial<SimOptions> }`, `runDraft(input): DraftResult`
  - `interface Summary { label; drafts; avgRank; rankCi; avgPoints; firstPct; avgValueCaptured; valueCi; avgMoneyLeft; avgMissingProjections }` (rank/points/firstPct/rankCi are `number | null`), `summarize(label, results): Summary`, `formatTable(rows: Summary[]): string`
  - `interface BatchArgs { drafts; seed; room; policies: PolicyName[]; set: Partial<Tunables>; compare; json }`, `parseBatchArgs(argv: string[]): BatchArgs`, `BATCH_USAGE`
  - `interface BatchInput { args; values; projections; onDraft?(done, total) }`, `runBatch(input): Summary[]`

- [ ] **Step 1: Write the failing tests**

`test/sim/run.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { resetTunables, setTunables } from '../../src/engine/constants'
import { formatTable, runDraft, summarize, type DraftResult } from '../../src/sim/run'
import type { ProjectionSource } from '../../src/sim/score'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
/** Stand-in projections until data/projections-2027.json exists: better players project proportionally more. */
const STRENGTH = new Map(VALUES.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, Math.max(1, v.consensus)] as const])))
const FAKE: ProjectionSource = (id) => {
  const c = STRENGTH.get(id)
  return c === undefined ? null : { pts: 30 * c, reb: 12 * c, ast: 7 * c, stl: 2 * c, blk: 1.5 * c, tpm: 3 * c, to: 4 * c, fgm: 11 * c, fga: 23 * c, ftm: 5 * c, fta: 6.5 * c }
}
const CONSENSUS = new Map(VALUES.map((v) => [v.espnId, v.consensus]))

afterEach(() => resetTunables())

describe('runDraft', () => {
  it('scores a full autopilot draft when projections exist', () => {
    const r = runDraft({ seed: 3, policy: 'autopilot', values: VALUES, projections: FAKE })
    expect(r.sales).toHaveLength(130)
    expect(r.standings).toHaveLength(10)
    expect(r.myRank).toBeGreaterThanOrEqual(1)
    expect(r.myRank).toBeLessThanOrEqual(10)
    expect(r.myPoints).toBe(r.standings!.find((t) => t.teamId === 1)!.total)
    expect(r.moneyLeft).toBeGreaterThanOrEqual(0)
    const mine = r.sales.filter((x) => x.teamId === 1)
    expect(r.valueCaptured).toBeCloseTo(mine.reduce((s, x) => s + (CONSENSUS.get(x.espnId) ?? 0) - x.price, 0), 6)
  })

  it('missing projections: no standings, still money left and value captured', () => {
    const r = runDraft({ seed: 3, policy: 'market', values: VALUES, projections: null })
    expect(r).toMatchObject({ standings: null, myRank: null, myPoints: null, myCategoryPoints: null, missingProjections: 0 })
    expect(Number.isFinite(r.valueCaptured)).toBe(true)
  })

  it('is deterministic and fast enough for the batch (one draft < 5 s)', () => {
    const t0 = performance.now()
    const a = runDraft({ seed: 5, policy: 'autopilot', values: VALUES, projections: null })
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(runDraft({ seed: 5, policy: 'autopilot', values: VALUES, projections: null }).sales).toEqual(a.sales)
  })

  it('a tunable changes what autopilot buys', () => {
    const base = runDraft({ seed: 6, policy: 'autopilot', values: VALUES, projections: null })
    setTunables({ BID_GAP_FRACTION: 1, BID_UP_MARGIN: 50 })
    const timid = runDraft({ seed: 6, policy: 'autopilot', values: VALUES, projections: null })
    expect(timid.sales.filter((x) => x.teamId === 1)).not.toEqual(base.sales.filter((x) => x.teamId === 1))
  })
})

describe('summarize', () => {
  const result = (myRank: number | null, i: number): DraftResult => ({
    policy: 'market', seed: i, sales: [], moneyLeft: 2 * i, valueCaptured: 10 * i, myRank,
    myPoints: myRank === null ? null : 50 - myRank, myCategoryPoints: null, missingProjections: 0, standings: null,
  })

  it('averages with a 95% interval and counts first places', () => {
    const s = summarize('x', [1, 3, 2, 1].map(result))
    expect(s).toMatchObject({ label: 'x', drafts: 4, avgRank: 1.75, firstPct: 0.5, avgPoints: 48.25, avgMoneyLeft: 3, avgValueCaptured: 15 })
    // sample sd of 1, 3, 2, 1 = sqrt(2.75 / 3)
    expect(s.rankCi).toBeCloseTo((1.96 * Math.sqrt(2.75 / 3)) / 2, 6)
  })

  it('reports no rank without projections, and the table shows a dash', () => {
    const s = summarize('y', [null, null].map(result))
    expect(s).toMatchObject({ avgRank: null, rankCi: null, avgPoints: null, firstPct: null, avgValueCaptured: 5 })
    const table = formatTable([s])
    expect(table.split('\n')[0]).toContain('avg rank')
    expect(table.split('\n')[1]).toContain('—')
  })
})
```

`test/sim/batch.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/sim/run.test.ts test/sim/batch.test.ts --testTimeout=180000` → FAIL (modules missing).

- [ ] **Step 3: Implement `src/sim/run.ts`**

```ts
import { toSettings } from '../espn/league'
import type { PlayerValue } from '../values/types'
import { AuctionSim, runToEnd } from './auction'
import { createAgent, type PolicyName } from './policies'
import { scoreTeams, type Category, type ProjectionSource, type TeamScore } from './score'
import { defaultOptions, simLeague, simPlayers, simTeams, type SimOptions } from './setup'
import { createTracker } from './tracker'
import type { SimSale } from './types'

export interface DraftResult {
  policy: PolicyName
  seed: number
  sales: SimSale[]
  moneyLeft: number
  /** sum over my roster of ESPN ROTO value minus price paid */
  valueCaptured: number
  myRank: number | null
  myPoints: number | null
  myCategoryPoints: Record<Category, number> | null
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
  const standings = input.projections ? scoreTeams(new Map(sim.teams.map((t) => [t.id, t.roster])), input.projections) : null
  const mine = standings?.find((t) => t.teamId === me.id) ?? null
  return {
    policy: input.policy,
    seed: input.seed,
    sales: sim.sales,
    moneyLeft: me.budget,
    valueCaptured,
    myRank: mine?.rank ?? null,
    myPoints: mine?.total ?? null,
    myCategoryPoints: mine?.points ?? null,
    missingProjections: mine?.missingProjections ?? 0,
    standings,
  }
}

export interface Summary {
  label: string
  drafts: number
  avgRank: number | null
  /** half-width of the 95% interval: 1.96 x sample sd / sqrt(n) */
  rankCi: number | null
  avgPoints: number | null
  /** share of drafts I finished first (ties included) */
  firstPct: number | null
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
  const ranks = results.flatMap((r) => (r.myRank === null ? [] : [r.myRank]))
  const points = results.flatMap((r) => (r.myPoints === null ? [] : [r.myPoints]))
  const values = results.map((r) => r.valueCaptured)
  const scored = ranks.length > 0
  return {
    label,
    drafts: results.length,
    avgRank: scored ? mean(ranks) : null,
    rankCi: scored ? ci95(ranks) : null,
    avgPoints: scored ? mean(points) : null,
    firstPct: scored ? ranks.filter((r) => r === 1).length / ranks.length : null,
    avgValueCaptured: mean(values),
    valueCi: ci95(values),
    avgMoneyLeft: mean(results.map((r) => r.moneyLeft)),
    avgMissingProjections: mean(results.map((r) => r.missingProjections)),
  }
}

const NONE = '—'
const withCi = (m: number | null, ci: number | null, digits: number) => (m === null ? NONE : `${m.toFixed(digits)} ±${(ci ?? 0).toFixed(digits)}`)

export function formatTable(rows: Summary[]): string {
  const header = ['config · policy', 'drafts', 'avg rank', 'roto pts', '1st %', 'value captured', '$ left']
  const body = rows.map((r) => [
    r.label,
    String(r.drafts),
    withCi(r.avgRank, r.rankCi, 2),
    r.avgPoints === null ? NONE : r.avgPoints.toFixed(1),
    r.firstPct === null ? NONE : `${Math.round(r.firstPct * 100)}%`,
    withCi(r.avgValueCaptured, r.valueCi, 1),
    r.avgMoneyLeft.toFixed(1),
  ])
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((cols) => cols[i].length)))
  return [header, ...body].map((cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()).join('\n')
}
```

- [ ] **Step 4: Implement `src/sim/batchArgs.ts`**

```ts
import { DEFAULT_TUNABLES, type Tunables } from '../engine/constants'
import { ROOMS } from './bots'
import { POLICIES, type PolicyName } from './policies'

export interface BatchArgs {
  drafts: number
  /** draft i uses seed + i */
  seed: number
  room: number
  policies: PolicyName[]
  set: Partial<Tunables>
  /** run defaults and the --set overrides on the same seeds */
  compare: boolean
  json: boolean
}

export const BATCH_USAGE = `Usage: npm run sim:batch -- [--drafts 100] [--seed 1] [--room cold|neutral|hot|<number>]
  [--policies autopilot,market,consensus] [--set NAME=value ...] [--compare] [--json]`

function parseSet(text: string): [keyof Tunables, number] {
  const eq = text.indexOf('=')
  if (eq < 1) throw new Error('expected --set NAME=value')
  const name = text.slice(0, eq)
  const raw = text.slice(eq + 1)
  if (!Object.hasOwn(DEFAULT_TUNABLES, name)) throw new Error(`unknown tunable ${name}`)
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(n)) throw new Error(`tunable ${name} must be a finite number`)
  return [name as keyof Tunables, n]
}

function parseRoom(text: string): number {
  if (Object.hasOwn(ROOMS, text)) return ROOMS[text as keyof typeof ROOMS]
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) throw new Error('room must be cold, neutral, hot or a positive number')
  return n
}

export function parseBatchArgs(argv: string[]): BatchArgs {
  const args: BatchArgs = { drafts: 100, seed: 1, room: ROOMS.neutral, policies: [...POLICIES], set: {}, compare: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${flag} needs a value`)
      return v
    }
    switch (flag) {
      case '--drafts': {
        const n = Number(value())
        if (!Number.isInteger(n) || n < 1) throw new Error('drafts must be a positive integer')
        args.drafts = n
        break
      }
      case '--seed': {
        const n = Number(value())
        if (!Number.isInteger(n)) throw new Error('seed must be an integer')
        args.seed = n
        break
      }
      case '--room':
        args.room = parseRoom(value())
        break
      case '--policies': {
        const names = value().split(',').map((s) => s.trim()).filter(Boolean)
        const bad = names.find((n) => !POLICIES.includes(n as PolicyName))
        if (bad !== undefined) throw new Error(`unknown policy ${bad}`)
        args.policies = names as PolicyName[]
        break
      }
      case '--set': {
        const [name, n] = parseSet(value())
        args.set[name] = n
        break
      }
      case '--compare':
        args.compare = true
        break
      case '--json':
        args.json = true
        break
      default:
        throw new Error(`unknown flag ${flag}`)
    }
  }
  if (args.compare && Object.keys(args.set).length === 0) throw new Error('--compare needs at least one --set')
  return args
}
```

- [ ] **Step 5: Implement `src/sim/batch.ts`**

```ts
import { resetTunables, setTunables, type Tunables } from '../engine/constants'
import type { PlayerValue } from '../values/types'
import type { BatchArgs } from './batchArgs'
import { runDraft, summarize, type DraftResult, type Summary } from './run'
import type { ProjectionSource } from './score'

export interface BatchInput {
  args: BatchArgs
  values: PlayerValue[]
  projections: ProjectionSource | null
  onDraft?: (done: number, total: number) => void
}

/** Every policy over the same seeds, once per tunables config; tunables always end at their defaults. */
export function runBatch(input: BatchInput): Summary[] {
  const { args } = input
  const overrides = Object.keys(args.set).length > 0
  const configs: Array<{ label: string; set: Partial<Tunables> }> = args.compare
    ? [{ label: 'defaults', set: {} }, { label: 'overrides', set: args.set }]
    : [{ label: overrides ? 'overrides' : 'defaults', set: args.set }]
  const total = configs.length * args.policies.length * args.drafts
  let done = 0
  const out: Summary[] = []
  try {
    for (const config of configs) {
      resetTunables()
      setTunables(config.set)
      for (const policy of args.policies) {
        const results: DraftResult[] = []
        for (let i = 0; i < args.drafts; i++) {
          results.push(runDraft({ seed: args.seed + i, policy, values: input.values, projections: input.projections, options: { room: args.room } }))
          input.onDraft?.(++done, total)
        }
        out.push(summarize(`${config.label} · ${policy}`, results))
      }
    }
  } finally {
    resetTunables()
  }
  return out
}
```

- [ ] **Step 6: Implement `scripts/sim-batch.ts`** and add `"sim:batch": "tsx scripts/sim-batch.ts"` to `package.json` scripts

```ts
import { existsSync, readFileSync } from 'node:fs'
import { runBatch } from '../src/sim/batch'
import { BATCH_USAGE, parseBatchArgs, type BatchArgs } from '../src/sim/batchArgs'
import { formatTable } from '../src/sim/run'
import { parseProjectionFile, PROJECTIONS_PATH, projectionsFrom } from '../src/sim/score'
import type { PlayerValue } from '../src/values/types'

function argsOrExit(): BatchArgs {
  try {
    return parseBatchArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    console.error(BATCH_USAGE)
    process.exit(1)
  }
}

const args = argsOrExit()
const values = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const projections = existsSync(PROJECTIONS_PATH) ? projectionsFrom(parseProjectionFile(JSON.parse(readFileSync(PROJECTIONS_PATH, 'utf8')))) : null
if (!projections) console.warn(`No ${PROJECTIONS_PATH} yet: skipping projected standings (value captured and money left only).`)

const started = performance.now()
let drafts = 0
const summaries = runBatch({
  args,
  values,
  projections,
  onDraft: (done, total) => {
    drafts = total
    if (!args.json && (done % 10 === 0 || done === total)) process.stderr.write(`\r${done}/${total} drafts`)
  },
})
const seconds = (performance.now() - started) / 1000
if (args.json) {
  console.log(JSON.stringify({ args, seconds, summaries }, null, 2))
} else {
  process.stderr.write('\n')
  console.log(formatTable(summaries))
  console.log(`\n${drafts} drafts in ${seconds.toFixed(1)} s · seeds ${args.seed}-${args.seed + args.drafts - 1} · room ${args.room}`)
}
```

- [ ] **Step 7: Run tests and the script**

Run: `npx vitest run test/sim/run.test.ts test/sim/batch.test.ts --testTimeout=180000` → PASS. Then:
- `npm run sim:batch -- --drafts 3` → a 3-row table plus the projections warning (if the file is absent) and the timing line.
- `npm run sim:batch -- --drafts 2 --set BID_GAP_FRACTION=0.1 --compare --json | head -30` → JSON with 6 summaries.
- `npm run sim:batch -- --bogus` → exit 1, prints `unknown flag --bogus` and the usage.
- `npm run sim:batch -- --drafts 20 --policies autopilot` → note seconds per draft in your report. The spec targets ≥ 1 draft/s overall (200 drafts × 3 policies in about 4 min = ≈ 0.4 s per draft). If slower, profile once with `npx tsx --cpu-prof scripts/sim-batch.ts --drafts 5` and report the top functions; do not optimize the engine without asking.

Then full suite + typecheck.

- [ ] **Step 8: Commit**

```bash
git add src/sim/run.ts src/sim/batchArgs.ts src/sim/batch.ts scripts/sim-batch.ts package.json test/sim/run.test.ts test/sim/batch.test.ts
git commit -m "feat(sim): headless batch runner with policies, roto standings and tunables overrides" -m "<your Co-Authored-By line>"
```

---

### Task 8: Controller hooks for the simulator, and replay sources

**Files:**
- Modify: `src/controller.ts` (`ControllerDeps.persist`, `onFrame(frame, options?)`, `refresh()`)
- Create: `src/sim/replay.ts`
- Test: `test/controller.test.ts` (2 new tests), `test/sim/replay.test.ts`

**Interfaces:**
- Consumes: `Recording` (`src/capture/recording.ts`), `splitLines` (`src/capture/frames.ts`), `LeagueInfo`, `ESPN_DEFAULT_COUNTS`, `normalizeName`, `PlayerValue`; Task 3 `USER_PICK_ORDER`, `USER_TEAM_ID`, `ROSTER_SIZE`, `SIM_SWID`.
- Produces:
  - `ControllerDeps.persist?: boolean` — `false` keeps the event log in memory only
  - `Controller.onFrame(frame: Frame, options?: { quiet?: boolean }): void` — `quiet` applies without rendering
  - `Controller.refresh(): void` — renders the current state now
  - `interface ReplayLine { t: number; line: string }`, `interface Replay { league: LeagueInfo; values: PlayerValue[] | null; lines: ReplayLine[] }`
  - `interface JoshFixture { teams: string[]; settings: { teams: number; budget: number; rosterSize: number }; sales: Array<{ player: string; team: string; price: number }> }`
  - `espnRecordingReplay(rec: Recording): Replay`, `joshReplay(f: JoshFixture, values: readonly PlayerValue[]): Replay`, `PLACEHOLDER_ID_BASE = 900000`, `JOSH_SALE_MS = 4000`, `JOSH_SOLD_AFTER_MS = 3000`

Why the controller changes: the simulator emits thousands of lines per draft. Rendering on each one runs `advise()` every time, and saving the whole log to storage on each event costs O(n²). The simulator applies lines quietly and renders once per animation frame with `refresh()`. `refresh()` also re-renders after a tunables edit. The extension's behavior doesn't change: `persist` defaults to true and `quiet` to false.

- [ ] **Step 1: Write the failing tests**

Append to `test/controller.test.ts`, inside `describe('createController', ...)`. Add `memoryStore` to the existing `./helpers` import if it isn't already there:

```ts
  it('quiet frames apply without rendering; refresh renders the current state', async () => {
    const { c, views } = await make()
    c.onFrame({ dir: 'in', data: lineFor(GRAMMAR.bid, { team: 2, player: 4242, amount: 5 }), t: 1, url: 'wss://x' }, { quiet: true })
    expect(views).toHaveLength(1)
    expect(c.getState().live).toMatchObject({ playerKey: 'espn:4242', price: 5, leaderId: 2 })
    c.refresh()
    expect(views).toHaveLength(2)
    expect(views[1].state.live).toMatchObject({ playerKey: 'espn:4242', price: 5 })
    expect(views[1].frameCount).toBe(1)
  })

  it('persist: false keeps the event log out of storage', async () => {
    const storage = memoryStore()
    const backup = memoryStore()
    const { c } = await make({ persist: false, storage, backup })
    expect(c.dispatch(sold('Alpha', 2, 30))).toBe(true)
    expect(c.getState().sales).toHaveLength(1)
    expect(storage.data).toEqual({})
    expect(backup.data).toEqual({})
  })
```

`test/sim/replay.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Recording } from '../../src/capture/recording'
import { espnRecordingReplay, joshReplay, PLACEHOLDER_ID_BASE, type JoshFixture } from '../../src/sim/replay'
import { SIM_SWID } from '../../src/sim/setup'
import { normalizeName } from '../../src/values/names'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const JOSH = JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as JoshFixture
const REC = JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording

describe('joshReplay', () => {
  it('one BID then one SOLD per sale, in time order, with Josh as my team', () => {
    const r = joshReplay(JOSH, VALUES)
    expect(r.lines).toHaveLength(JOSH.sales.length * 2 + 2)
    expect(r.lines[0].line).toBe('STATE 1')
    expect(r.lines.at(-1)!.line).toBe('STATE 2')
    const first = JOSH.sales[0]
    const team = JOSH.teams.indexOf(first.team) + 1
    expect(r.lines[1].line).toMatch(new RegExp(`^BID ${team} \\d+ ${first.price} 25000 10000$`))
    expect(r.lines[2].line).toMatch(new RegExp(`^SOLD ${team} \\d+ 0 ${first.price} 0$`))
    expect(r.lines.map((l) => l.t)).toEqual(r.lines.map((l) => l.t).sort((a, b) => a - b))
    expect(r.league.teams).toHaveLength(12)
    expect(r.league.pickOrder).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(r.league.teams.find((t) => t.name === 'Josh')!.owners).toEqual([SIM_SWID])
  })

  it('every sold id maps to its player in the replay values; unmatched names get placeholder ids', () => {
    const before = JSON.stringify(VALUES)
    const r = joshReplay(JOSH, VALUES)
    expect(JSON.stringify(VALUES)).toBe(before)
    const byId = new Map(r.values!.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, v] as const])))
    const soldKeys = r.lines.filter((l) => l.line.startsWith('SOLD ')).map((l) => byId.get(Number(l.line.split(' ')[2]))?.key)
    expect(soldKeys).toEqual(JOSH.sales.map((s) => normalizeName(s.player)))
    expect(r.values!.some((v) => v.espnId !== null && v.espnId >= PLACEHOLDER_ID_BASE)).toBe(true)
  })
})

describe('espnRecordingReplay', () => {
  it('replays the recording from t = 0 in the user league shape', () => {
    const r = espnRecordingReplay(REC)
    expect(r.lines[0].t).toBe(0)
    expect(r.lines.filter((l) => l.line.startsWith('SOLD '))).toHaveLength(11)
    expect(r.values).toBeNull()
    expect(r.league.pickOrder).toEqual([7, 10, 5, 9, 1, 4, 8, 3, 6, 2])
    expect(r.league.teams.find((t) => t.id === 1)!.owners).toEqual([SIM_SWID])
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/controller.test.ts test/sim/replay.test.ts --testTimeout=30000` → the 2 new controller tests FAIL (`refresh` is not a function, storage not empty) and the replay file fails (module missing).

- [ ] **Step 3: Change `src/controller.ts`**

In `ControllerDeps`, after `now?`:

```ts
  /** false: keep the event log in memory only (the simulator); default true */
  persist?: boolean
```

In `interface Controller`, replace the `onFrame` line and add `refresh` after `tick`:

```ts
  /** Decodes a socket frame; `quiet` applies it without rendering (the simulator renders once per tick with refresh). */
  onFrame(frame: Frame, options?: { quiet?: boolean }): void
```

```ts
  /** Renders the current state now: after quiet frames, or when tunables changed the advice. */
  refresh(): void
```

In `apply`, guard the save:

```ts
    if (deps.persist !== false) for (const store of stores) saveEvents(store, deps.leagueId, log)
```

In the returned object, replace `onFrame` and add `refresh`:

```ts
    onFrame(frame, options) {
      frames.push(frame)
      if (frame.dir === 'in') for (const line of splitLines(frame.data)) onLine(line)
      if (!options?.quiet) publish()
    },
```

```ts
    refresh: publish,
```

- [ ] **Step 4: Implement `src/sim/replay.ts`**

```ts
import { splitLines } from '../capture/frames'
import type { Recording } from '../capture/recording'
import type { LeagueInfo } from '../espn/league'
import { ESPN_DEFAULT_COUNTS } from '../espn/slots'
import { normalizeName } from '../values/names'
import type { PlayerValue } from '../values/types'
import { ROSTER_SIZE, SIM_SWID, USER_PICK_ORDER, USER_TEAM_ID } from './setup'

export interface ReplayLine {
  /** ms from the start of the replay */
  t: number
  line: string
}

export interface Replay {
  league: LeagueInfo
  /** values to use instead of data/values.json, or null to use it as is */
  values: PlayerValue[] | null
  lines: ReplayLine[]
}

/** test/fixtures/josh-mock-sales.json */
export interface JoshFixture {
  teams: string[]
  settings: { teams: number; budget: number; rosterSize: number }
  sales: Array<{ player: string; team: string; price: number }>
}

/** Josh players with no ESPN id get ids from here, so their frames still decode to the right player. */
export const PLACEHOLDER_ID_BASE = 900000
export const JOSH_SALE_MS = 4000
export const JOSH_SOLD_AFTER_MS = 3000

function replayLeague(teams: Array<{ id: number; name: string }>, myTeamId: number, pickOrder: number[], budget: number, rosterSize: number): LeagueInfo {
  return {
    id: 0,
    draftType: 'AUCTION',
    budget,
    rosterSize,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    teams: teams.map((t) => ({ ...t, owners: t.id === myTeamId ? [SIM_SWID] : [] })),
    pickOrder,
  }
}

/** The recorded ESPN draft (scrubbed fixture), timed from its first incoming frame. */
export function espnRecordingReplay(rec: Recording): Replay {
  const frames = rec.frames.filter((f) => f.dir === 'in')
  const t0 = frames[0]?.t ?? 0
  return {
    league: replayLeague(USER_PICK_ORDER.map((id) => ({ id, name: `Team ${id}` })), USER_TEAM_ID, [...USER_PICK_ORDER], 200, ROSTER_SIZE),
    values: null,
    lines: frames.flatMap((f) => splitLines(f.data).map((line) => ({ t: f.t - t0, line }))),
  }
}

/** Josh Lloyd's 12-team mock as ESPN lines: each sale is one BID (nomination at the final price) then its SOLD. */
export function joshReplay(f: JoshFixture, values: readonly PlayerValue[]): Replay {
  const out = values.map((v) => ({ ...v }))
  const byKey = new Map(out.map((v) => [v.key, v]))
  const ids = new Map<string, number>()
  f.sales.forEach((sale, i) => {
    const key = normalizeName(sale.player)
    const v = byKey.get(key)
    if (v && v.espnId !== null) {
      ids.set(key, v.espnId)
      return
    }
    const id = PLACEHOLDER_ID_BASE + i
    ids.set(key, id)
    if (v) {
      v.espnId = id
    } else {
      const placeholder: PlayerValue = { key, espnId: id, name: sale.player, slots: [11], b: 1, consensus: 0, market: 0, josh: null, avoid: false, tier: 5 }
      out.push(placeholder)
      byKey.set(key, placeholder)
    }
  })
  const teamId = (name: string) => {
    const i = f.teams.indexOf(name)
    if (i < 0) throw new Error(`Josh fixture: unknown team ${name}`)
    return i + 1
  }
  const lines: ReplayLine[] = [{ t: 0, line: 'STATE 1' }]
  f.sales.forEach((sale, i) => {
    const team = teamId(sale.team)
    const id = ids.get(normalizeName(sale.player))!
    lines.push({ t: i * JOSH_SALE_MS, line: `BID ${team} ${id} ${sale.price} 25000 10000` })
    lines.push({ t: i * JOSH_SALE_MS + JOSH_SOLD_AFTER_MS, line: `SOLD ${team} ${id} 0 ${sale.price} 0` })
  })
  lines.push({ t: f.sales.length * JOSH_SALE_MS, line: 'STATE 2' })
  const teams = f.teams.map((name, i) => ({ id: i + 1, name }))
  return {
    league: replayLeague(teams, teamId('Josh'), teams.map((t) => t.id), f.settings.budget, f.settings.rosterSize),
    values: out,
    lines,
  }
}
```

- [ ] **Step 5: Run tests** — both files pass, and the existing controller tests still pass (default behavior unchanged). Then run the full suite and typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/controller.ts test/controller.test.ts src/sim/replay.ts test/sim/replay.test.ts
git commit -m "feat(sim): quiet frames, refresh and in-memory log for the simulator; ESPN and Josh replays" -m "<your Co-Authored-By line>"
```

---

### Task 9: Session (sim + real controller, one clock)

**Files:**
- Create: `src/sim/session.ts`
- Test: `test/sim/session.test.ts`

**Interfaces:**
- Consumes:
  - Task 8: `createController` with `persist` and `onFrame(…, { quiet })`, `refresh`, `View`, and the replays.
  - Task 3: `AuctionSim`, `MANUAL_AGENT`, `Block`.
  - Task 5: `createAgent`.
  - Task 6: `scoreTeams`, `ProjectionSource`, `TeamScore`.
  - Also: `defaultOptions`, `simLeague`, `simPlayers`, `simTeams`, `SIM_SWID`, `teamSummary`, `valueOf`, `KeyValueStore`.
- Produces:
  - `type Speed = 1 | 5 | 20 | 'instant'`, `SPEEDS`; `type Mode = 'simulate' | 'replay-espn' | 'replay-josh'`, `MODES`
  - `interface SessionConfig { mode; options: SimOptions; speed: Speed; autopilot: boolean }`, `defaultConfig(): SessionConfig`
  - `interface SessionData { values: PlayerValue[]; projections: ProjectionSource | null; recording: Recording; josh: JoshFixture }`
  - `interface MyResult { moneyLeft: number; valueCaptured: number }`
  - `interface Session`. Getters: `config`, `time`, `paused`, `done`, `view: View`, `block: Block | null`, `myTurn`, `speed`, `autopilot`. Methods: `available(): readonly SimPlayer[]`, `tick(realMs)`, `step()`, `finish()`, `setPaused(p)`, `setSpeed(s)`, `setAutopilot(on)`, `myBid(amount): string | null`, `myNominate(espnId, amount): string | null`, `dispatch(ev): boolean`, `dismissAlert()`, `refresh()`, `recordingJson(): string`, `subscribe(fn): () => void`, `standings(): TeamScore[] | null`, `myResult(): MyResult`.
  - `createSession(config, data): Promise<Session>`, `FINISH_GUARD`

- [ ] **Step 1: Write the failing tests**

`test/sim/session.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Recording } from '../../src/capture/recording'
import type { JoshFixture } from '../../src/sim/replay'
import { createSession, defaultConfig, type SessionConfig, type SessionData } from '../../src/sim/session'
import type { PlayerValue } from '../../src/values/types'

const DATA: SessionData = {
  values: JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[],
  projections: null,
  recording: JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording,
  josh: JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as JoshFixture,
}
const config = (over: Partial<SessionConfig> = {}): SessionConfig => ({ ...defaultConfig(), ...over })
const FLAT_LINE = { pts: 1000, reb: 400, ast: 200, stl: 60, blk: 40, tpm: 100, to: 120, fgm: 400, fga: 850, ftm: 150, fta: 190 }

describe('session', () => {
  it('simulate + autopilot: finish runs the whole draft through the real controller', async () => {
    const s = await createSession(config({ autopilot: true }), DATA)
    s.finish()
    expect(s.done).toBe(true)
    expect(s.view.state.sales).toHaveLength(130)
    expect(s.view.state.sales.filter((x) => x.teamId === 1)).toHaveLength(13)
    expect(s.view.health).toBe('live')
    expect(s.view.alert).toBeNull()
    expect(s.view.unknownVerbs).toEqual({})
    s.finish()
    expect(s.view.state.sales).toHaveLength(130)
  }, 60_000)

  it('manual: my bid goes through the sim and the panel sees me lead', async () => {
    const s = await createSession(config(), DATA)
    for (let i = 0; i < 100 && !s.block; i++) s.tick(250)
    expect(s.block).not.toBeNull()
    expect(s.myBid(s.block!.price)).toBe(`Bid must beat $${s.block!.price}`)
    const price = s.block!.price + 1
    expect(s.myBid(price)).toBeNull()
    expect(s.view.state.live).toMatchObject({ price, leaderId: 1 })
  })

  it('a manual draft still finishes: my turns time out and auto-nominate', async () => {
    const s = await createSession(config(), DATA)
    s.finish()
    expect(s.view.state.sales).toHaveLength(130)
  }, 60_000)

  it('step stops after exactly one more sale', async () => {
    const s = await createSession(config(), DATA)
    s.step()
    expect(s.view.state.sales).toHaveLength(1)
    s.step()
    expect(s.view.state.sales).toHaveLength(2)
  })

  it('speed scales the sim clock; pause stops it; instant finishes', async () => {
    const s = await createSession(config({ speed: 5 }), DATA)
    s.tick(1000)
    expect(s.time).toBe(5000)
    s.setSpeed(20)
    s.tick(100)
    expect(s.time).toBe(7000)
    s.setPaused(true)
    s.tick(1000)
    expect(s.time).toBe(7000)
    s.setPaused(false)
    s.setSpeed('instant')
    s.tick(16)
    expect(s.done).toBe(true)
  }, 60_000)

  it('notifies subscribers and stops after unsubscribe', async () => {
    const s = await createSession(config(), DATA)
    let calls = 0
    const off = s.subscribe(() => calls++)
    s.tick(100)
    expect(calls).toBe(1)
    off()
    s.tick(100)
    expect(calls).toBe(1)
  })

  it('replays the Josh mock: 156 sales on 12 teams, Josh is my team, no bidding', async () => {
    const s = await createSession(config({ mode: 'replay-josh' }), DATA)
    s.finish()
    expect(s.view.state.settings.teams).toHaveLength(12)
    expect(s.view.state.myTeamId).toBe(1)
    expect(s.view.state.sales).toHaveLength(156)
    expect(s.myBid(5)).toBe('Bidding works in simulate mode')
  })

  it('replays the recorded ESPN draft: 11 sales', async () => {
    const s = await createSession(config({ mode: 'replay-espn' }), DATA)
    s.finish()
    expect(s.view.state.sales).toHaveLength(11)
    expect(s.done).toBe(true)
  })

  it('standings: null without projections; ten scored teams with them', async () => {
    const plain = await createSession(config({ autopilot: true }), DATA)
    plain.finish()
    expect(plain.standings()).toBeNull()
    expect(plain.myResult().moneyLeft).toBeGreaterThanOrEqual(0)
    const scored = await createSession(config({ autopilot: true }), { ...DATA, projections: () => FLAT_LINE })
    scored.finish()
    const st = scored.standings()!
    expect(st).toHaveLength(10)
    expect(st.every((t) => t.rank === 1 && t.missingProjections === 0)).toBe(true)
  }, 120_000)
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/sim/session.test.ts --testTimeout=120000` → FAIL (module missing).

- [ ] **Step 3: Implement `src/sim/session.ts`**

```ts
import type { Recording } from '../capture/recording'
import { createController, type View } from '../controller'
import { teamSummary, valueOf } from '../engine/metrics'
import type { DraftEvent } from '../engine/types'
import type { KeyValueStore } from '../storage'
import type { PlayerValue } from '../values/types'
import { AuctionSim, MANUAL_AGENT, type Block } from './auction'
import { createAgent } from './policies'
import { espnRecordingReplay, joshReplay, type JoshFixture, type ReplayLine } from './replay'
import { scoreTeams, type ProjectionSource, type TeamScore } from './score'
import { defaultOptions, SIM_SWID, simLeague, simPlayers, simTeams, type SimOptions } from './setup'
import type { SimPlayer } from './types'

export type Speed = 1 | 5 | 20 | 'instant'
export const SPEEDS: readonly Speed[] = [1, 5, 20, 'instant']
export type Mode = 'simulate' | 'replay-espn' | 'replay-josh'
export const MODES: readonly Mode[] = ['simulate', 'replay-espn', 'replay-josh']

export interface SessionConfig {
  mode: Mode
  options: SimOptions
  speed: Speed
  /** simulate mode: my team follows the panel's calls */
  autopilot: boolean
}

export interface SessionData {
  values: PlayerValue[]
  projections: ProjectionSource | null
  recording: Recording
  josh: JoshFixture
}

export interface MyResult {
  moneyLeft: number
  /** sum over my roster of ESPN ROTO value minus price paid */
  valueCaptured: number
}

export interface Session {
  readonly config: SessionConfig
  /** sim ms since the draft started */
  readonly time: number
  readonly paused: boolean
  readonly done: boolean
  /** what the real panel shows */
  readonly view: View
  /** simulate mode: the block with its clock, for the countdown */
  readonly block: Block | null
  /** simulate mode: my turn to nominate */
  readonly myTurn: boolean
  readonly speed: Speed
  readonly autopilot: boolean
  available(): readonly SimPlayer[]
  /** Advances sim time by real ms x speed (instant: to the end) and renders once. */
  tick(realMs: number): void
  /** Runs until one more player is sold (or the draft ends). */
  step(): void
  /** Runs to the end of the draft. */
  finish(): void
  setPaused(paused: boolean): void
  setSpeed(speed: Speed): void
  setAutopilot(on: boolean): void
  myBid(amount: number): string | null
  myNominate(espnId: number, amount: number): string | null
  /** the Panel's manual entry */
  dispatch(ev: DraftEvent): boolean
  dismissAlert(): void
  refresh(): void
  recordingJson(): string
  subscribe(fn: () => void): () => void
  /** projected roto standings, or null without projections */
  standings(): TeamScore[] | null
  myResult(): MyResult
}

export const defaultConfig = (): SessionConfig => ({ mode: 'simulate', options: { ...defaultOptions(1), emitClock: true }, speed: 5, autopilot: false })

const SIM_LEAGUE_ID = 0
const SIM_URL = 'wss://simulator.local/draft'
const SIM_ONLY = 'Bidding works in simulate mode'
/** Events a finish or step may run before giving up: far above a real draft (a few thousand). */
export const FINISH_GUARD = 1_000_000

interface Driver {
  done(): boolean
  nextAt(): number | null
  advanceTo(t: number): void
}

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

function lineDriver(lines: readonly ReplayLine[], push: (line: string, t: number) => void): Driver {
  let i = 0
  return {
    done: () => i >= lines.length,
    nextAt: () => (i < lines.length ? lines[i].t : null),
    advanceTo(t) {
      for (; i < lines.length && lines[i].t <= t; i++) push(lines[i].line, lines[i].t)
    },
  }
}

/** One draft on the page: the auction (or a replay) feeds the real controller line by line on one sim clock. */
export async function createSession(config: SessionConfig, data: SessionData): Promise<Session> {
  const replay = config.mode === 'replay-espn' ? espnRecordingReplay(data.recording) : config.mode === 'replay-josh' ? joshReplay(data.josh, data.values) : null
  const values = replay?.values ?? data.values
  const options: SimOptions = { ...config.options, emitClock: true }
  const league = replay?.league ?? simLeague(options, simTeams(options))
  let time = 0
  let view: View | null = null
  let dirty = false
  let paused = false
  let speed = config.speed
  let autopilot = !replay && config.autopilot
  const listeners = new Set<() => void>()

  const controller = await createController({
    leagueId: SIM_LEAGUE_ID,
    storage: memoryStore(),
    backup: memoryStore(),
    persist: false,
    values,
    cookie: `SWID=${SIM_SWID}`,
    loadLeague: async () => league,
    render: (v) => {
      view = v
    },
    now: () => time,
  })
  const push = (line: string, t: number) => {
    time = t
    controller.onFrame({ dir: 'in', data: line, t, url: SIM_URL }, { quiet: true })
    dirty = true
  }

  const keyToEspn = new Map(values.flatMap((v) => (v.espnId === null ? [] : [[v.key, v.espnId] as const])))
  const espnToKey = new Map([...keyToEspn].map(([key, id]) => [id, key] as const))
  const source = {
    get state() {
      return controller.getState()
    },
    keyOf: (id: number) => espnToKey.get(id) ?? `espn:${id}`,
  }

  let sim: AuctionSim | null = null
  let players: SimPlayer[] = []
  const agentFor = (on: boolean) => (on ? createAgent('autopilot', source, players) : MANUAL_AGENT)
  let driver: Driver
  if (replay) {
    driver = lineDriver(replay.lines, push)
  } else {
    players = simPlayers(values)
    const s = new AuctionSim(options, players, { onLine: push }, agentFor(autopilot))
    sim = s
    driver = { done: () => s.done, nextAt: () => s.nextEventAt(), advanceTo: (t) => s.advanceTo(t) }
  }

  const notify = () => listeners.forEach((fn) => fn())
  const settle = () => {
    if (dirty) {
      dirty = false
      controller.refresh()
    } else {
      controller.tick()
    }
    notify()
  }
  const advanceTo = (t: number) => {
    driver.advanceTo(t)
    // A finished draft keeps its clock at the last line, so the panel stays live.
    if (!driver.done()) time = Math.max(time, t)
  }
  const salesCount = () => controller.getState().sales.length
  /** Runs events until `stop()` or the end; the guard turns a runaway loop into an error instead of a hung tab. */
  const runUntil = (stop: () => boolean) => {
    for (let i = 0; !driver.done() && !stop(); i++) {
      if (i >= FINISH_GUARD) throw new Error('simulation did not finish')
      const next = driver.nextAt()
      if (next === null) break
      advanceTo(next)
    }
    settle()
  }

  const session: Session = {
    config,
    get time() {
      return time
    },
    get paused() {
      return paused
    },
    get done() {
      return driver.done()
    },
    get view() {
      return view!
    },
    get block() {
      return sim?.block ?? null
    },
    get myTurn() {
      return sim !== null && !sim.done && !sim.block && sim.onClock === sim.myTeamId
    },
    get speed() {
      return speed
    },
    get autopilot() {
      return autopilot
    },
    available: () => sim?.available ?? [],
    tick(realMs) {
      if (paused || driver.done()) return
      const s = speed
      if (s === 'instant') return session.finish()
      advanceTo(time + realMs * s)
      settle()
    },
    step() {
      const target = salesCount() + 1
      runUntil(() => salesCount() >= target)
    },
    finish() {
      runUntil(() => false)
    },
    setPaused(p) {
      paused = p
      notify()
    },
    setSpeed(s) {
      speed = s
      notify()
    },
    setAutopilot(on) {
      if (!sim) return
      autopilot = on
      sim.setAgent(agentFor(on))
      settle()
    },
    myBid(amount) {
      if (!sim) return SIM_ONLY
      const error = sim.myBid(amount)
      settle()
      return error
    },
    myNominate(espnId, amount) {
      if (!sim) return SIM_ONLY
      const error = sim.myNominate(espnId, amount)
      settle()
      return error
    },
    dispatch(ev) {
      const changed = controller.dispatch(ev)
      notify()
      return changed
    },
    dismissAlert() {
      controller.dismissAlert()
      notify()
    },
    refresh() {
      controller.refresh()
      notify()
    },
    recordingJson: () => controller.recordingJson(),
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    standings() {
      if (!data.projections) return null
      const state = controller.getState()
      const rosters = new Map(state.settings.teams.map((t) => [t.id, [] as number[]]))
      // -1: a player with no ESPN id counts as missing a projection.
      for (const x of state.sales) rosters.get(x.teamId)?.push(keyToEspn.get(x.playerKey) ?? -1)
      return scoreTeams(rosters, data.projections)
    },
    myResult() {
      const state = controller.getState()
      const me = state.myTeamId
      if (me === null) return { moneyLeft: 0, valueCaptured: 0 }
      const mine = state.sales.filter((x) => x.teamId === me)
      return {
        moneyLeft: teamSummary(state, me).budgetLeft,
        valueCaptured: mine.reduce((sum, x) => sum + valueOf(state, x.playerKey).consensus - x.price, 0),
      }
    },
  }
  return session
}
```

- [ ] **Step 4: Run tests** — `npx vitest run test/sim/session.test.ts --testTimeout=120000` → PASS. Then the full suite and typecheck. If `finish()` in the autopilot test takes more than ~5 s, profile it (`npx vitest run test/sim/session.test.ts -t autopilot` with `--reporter=verbose`) and report what's slow. Don't change the engine.

- [ ] **Step 5: Commit**

```bash
git add src/sim/session.ts test/sim/session.test.ts
git commit -m "feat(sim): session drives the real controller from the auction or a replay on one clock" -m "<your Co-Authored-By line>"
```

---

### Task 10: Simulator page, dev server, README

**Files:**
- Create: `src/sim/ui/styles.ts`, `src/sim/ui/Room.ts`, `src/sim/ui/Controls.ts`, `src/sim/ui/TunablesDrawer.ts`, `src/sim/ui/App.ts`, `src/sim/page.ts`, `sim/index.html`, `sim.mjs`
- Modify: `package.json` (add `"sim": "node sim.mjs"` before `"sim:batch"`), `.gitignore` (add `sim/dist/`), `README.md` (new "Simulator" section)
- Test: `test/sim/ui.test.ts` (jsdom), `test/sim/page-build.test.ts` (node: esbuild breaks under jsdom)

**Interfaces:**
- Consumes:
  - Task 9: `Session`, `SessionConfig`, `SessionData`, `createSession`, `defaultConfig`, `SPEEDS`, `MODES`, `Mode`.
  - Task 1: `TUNABLES`, `DEFAULT_TUNABLES`, `setTunables`, `resetTunables`, `Tunables`, `TunableName`.
  - Task 2: `ROOMS`, `marketPrice`, `BotKind`.
  - Task 6: `CATEGORIES`, `CATEGORY_LABELS`, `parseProjectionFile`, `projectionsFrom`.
  - Also: `teamSummary`, `valueOf`; `Panel`, `mountPanel`, `html`, `downloadText`.
- Produces:
  - `App`, `Room`, `Controls`, `TunablesDrawer`
  - `flagsFor(t: Readonly<Tunables>): string`
  - `configFromForm(base, form: RestartForm): SessionConfig | string`, `interface RestartForm { mode; seed: string; room: RoomName; bots: string }`, `BOT_KINDS`, `MODE_LABELS`
  - `SIM_CSS`
  - the `npm run sim` dev server on `http://127.0.0.1:5173` (`--open` opens it)

- [ ] **Step 1: Write the failing tests**

`test/sim/ui.test.ts`:

```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Recording } from '../../src/capture/recording'
import { DEFAULT_TUNABLES, resetTunables, setTunables, TUNABLES } from '../../src/engine/constants'
import type { JoshFixture } from '../../src/sim/replay'
import { createSession, defaultConfig, type SessionData } from '../../src/sim/session'
import { App } from '../../src/sim/ui/App'
import { configFromForm } from '../../src/sim/ui/Controls'
import { flagsFor, TunablesDrawer } from '../../src/sim/ui/TunablesDrawer'
import { html } from '../../src/ui/html'
import { mountPanel } from '../../src/ui/mount'
import { Panel } from '../../src/ui/Panel'
import type { PlayerValue } from '../../src/values/types'

const DATA: SessionData = {
  values: JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[],
  projections: null,
  recording: JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording,
  josh: JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as JoshFixture,
}

afterEach(() => {
  resetTunables()
  document.body.innerHTML = ''
})

async function mountApp() {
  const session = await createSession(defaultConfig(), DATA)
  const root = document.createElement('div')
  document.body.append(root)
  const draw = () => render(html`<${App} session=${session} onRestart=${() => {}} />`, root)
  session.subscribe(draw)
  draw()
  return { session, root }
}

describe('simulator page', () => {
  it('shows the 10 teams in draft order with mine marked', async () => {
    const { root } = await mountApp()
    const ids = [...root.querySelectorAll('[data-team]')].map((e) => Number(e.getAttribute('data-team')))
    expect(ids).toEqual([7, 10, 5, 9, 1, 4, 8, 3, 6, 2])
    expect(root.querySelector('.team.mine')!.textContent).toContain('You')
  })

  it('a step completes an auction and the feed shows it', async () => {
    const { session, root } = await mountApp()
    session.step()
    expect(session.view.state.sales).toHaveLength(1)
    expect(root.querySelector('.feed')!.textContent).toContain('Sales (1)')
  })

  it('the real Panel shows a call while a player is on the block', async () => {
    const { session } = await mountApp()
    for (let i = 0; i < 100 && !session.view.state.live; i++) session.tick(250)
    expect(session.view.state.live).not.toBeNull()
    const container = mountPanel(document)
    render(
      html`<${Panel} ...${session.view} onEvent=${() => true} onDownloadRecording=${() => {}} onReset=${() => {}} onDismissAlert=${() => {}} />`,
      container,
    )
    expect(container.textContent).toMatch(/BID|PASS|LET THEM|You lead/)
  })

  it('restart form: valid config, or a message', () => {
    const base = defaultConfig()
    const bots = base.options.botKinds.join(',')
    const ok = configFromForm(base, { mode: 'replay-josh', seed: '42', room: 'hot', bots })
    expect(ok).toMatchObject({ mode: 'replay-josh', options: { seed: 42, room: 1.1 } })
    expect(configFromForm(base, { mode: 'simulate', seed: '4.5', room: 'neutral', bots })).toBe('Seed must be a whole number')
    expect(configFromForm(base, { mode: 'simulate', seed: '1', room: 'neutral', bots: bots.replace('value', 'vale') })).toBe('Unknown bot "vale": use stars, balanced, value')
    expect(configFromForm(base, { mode: 'simulate', seed: '1', room: 'neutral', bots: 'stars,value' })).toBe('Bot mix needs 9 bots, got 2')
  })
})

describe('tunables drawer', () => {
  it('Copy as flags lists only changed tunables', () => {
    expect(flagsFor(TUNABLES)).toBe('')
    setTunables({ BID_GAP_FRACTION: 0.1, HOT: 1.1 })
    expect(flagsFor(TUNABLES)).toBe('--set HOT=1.1 --set BID_GAP_FRACTION=0.1')
  })

  it('edits change TUNABLES and refresh; Reset restores defaults', () => {
    const onChange = vi.fn()
    const root = document.createElement('div')
    document.body.append(root)
    act(() => render(html`<${TunablesDrawer} onChange=${onChange} />`, root))
    act(() => root.querySelector<HTMLButtonElement>('button.toggle')!.click())
    const input = root.querySelector<HTMLInputElement>('input[name="BID_GAP_FRACTION"]')!
    act(() => {
      input.value = '0.1'
      input.dispatchEvent(new Event('change'))
    })
    expect(TUNABLES.BID_GAP_FRACTION).toBe(0.1)
    expect(onChange).toHaveBeenCalledTimes(1)
    act(() => {
      input.value = 'abc'
      input.dispatchEvent(new Event('change'))
    })
    expect(TUNABLES.BID_GAP_FRACTION).toBe(0.1)
    act(() => root.querySelector<HTMLButtonElement>('button.reset')!.click())
    expect(TUNABLES).toEqual(DEFAULT_TUNABLES)
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
```

In the flags test, keys come out in `DEFAULT_TUNABLES` order (HOT comes before BID_GAP_FRACTION).

`test/sim/page-build.test.ts`:

```ts
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('simulator page bundle', () => {
  it('bundles src/sim/page.ts with its JSON data', async () => {
    const result = await build({ entryPoints: ['src/sim/page.ts'], bundle: true, write: false, format: 'esm', target: 'es2022', logLevel: 'silent' })
    expect(result.errors).toHaveLength(0)
    expect(result.outputFiles[0].text).toContain('Draft simulator')
  }, 60_000)
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/sim/ui.test.ts test/sim/page-build.test.ts --testTimeout=60000` → FAIL (modules missing).

- [ ] **Step 3: Implement `src/sim/ui/styles.ts`**

```ts
/** Page styles; the panel keeps its own (Shadow DOM, 340 px wide, fixed top right). */
export const SIM_CSS = `
:root { color-scheme: dark; }
body { margin: 0; background: #0b1020; color: #e5e7eb; font: 13px/1.45 system-ui, sans-serif; }
.sim { margin-right: 372px; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
header { font-size: 15px; }
.muted { color: #9ca3af; }
.error { color: #fca5a5; }
button { background: #1f2937; color: inherit; border: 1px solid #374151; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
button.on { background: #2563eb; border-color: #2563eb; }
button:disabled { opacity: .5; cursor: default; }
input, select { background: #111827; color: inherit; border: 1px solid #374151; border-radius: 6px; padding: 3px 6px; }
input[type=number] { width: 72px; }
input.bots { width: 380px; }
.controls .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
.strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.team { display: flex; flex-direction: column; padding: 6px 8px; border: 1px solid #1f2937; border-radius: 8px; background: #111827; }
.team.mine { border-color: #2563eb; }
.team.clock { box-shadow: 0 0 0 2px #f59e0b; }
.block { padding: 12px; border-radius: 10px; background: #111827; min-height: 90px; }
.player { font-size: 18px; font-weight: 600; }
.price { font-size: 22px; margin: 4px 0; }
.countdown { font-size: 14px; color: #f59e0b; margin-left: 8px; }
.actions { display: flex; gap: 6px; align-items: center; }
.nominate ul { list-style: none; padding: 0; margin: 6px 0 0; }
.nominate li { margin: 3px 0; }
.feed .mine, .standings .mine { color: #93c5fd; }
.tunables { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 12px; margin-top: 6px; }
.tunables label { display: flex; justify-content: space-between; gap: 6px; }
.tunables label.changed { color: #fbbf24; }
code { display: block; margin-top: 6px; padding: 6px; background: #111827; border-radius: 6px; word-break: break-all; }
table.standings { border-collapse: collapse; }
.standings th, .standings td { padding: 2px 6px; text-align: right; }
.standings td:nth-child(2), .standings th:nth-child(2) { text-align: left; }
h3 { margin: 8px 0 4px; font-size: 13px; }
`
```

- [ ] **Step 4: Implement `src/sim/ui/Room.ts`**

```ts
import { useState } from 'preact/hooks'
import { teamSummary, valueOf } from '../../engine/metrics'
import { html } from '../../ui/html'
import { marketPrice } from '../bots'
import { CATEGORIES, CATEGORY_LABELS } from '../score'
import type { Session } from '../session'

const NOMINATE_RESULTS = 8
const FEED_ROWS = 12
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
const inputValue = (e: Event) => (e.currentTarget as HTMLInputElement).value
const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`
const positions = (slots: number[]) => slots.filter((s) => s < POSITIONS.length).map((s) => POSITIONS[s]).join('/')

/** The draft room: teams, the block (with my buttons), my nomination, the sales feed and the end-of-draft results. */
export function Room({ session }: { session: Session }) {
  const { state } = session.view
  const [amount, setAmount] = useState('')
  const [query, setQuery] = useState('')
  const [passedOn, setPassedOn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const me = state.myTeamId
  const live = state.live
  const simulate = session.config.mode === 'simulate'
  const teamName = (id: number) => teamSummary(state, id).name
  const nameOf = (key: string) => valueOf(state, key).name

  const strip = html`<div class="strip">
    ${state.settings.teams.map((t) => {
      const s = teamSummary(state, t.id)
      const onClock = !live && !session.done && state.turnTeamId === t.id
      return html`<div class=${['team', t.id === me ? 'mine' : '', onClock ? 'clock' : ''].join(' ').trim()} data-team=${t.id}>
        <b>#${t.id} ${t.name}</b><span>$${s.budgetLeft}</span><span class="muted">${s.open} open</span>
      </div>`
    })}
  </div>`

  const blockView = () => {
    if (!live) return null
    const v = valueOf(state, live.playerKey)
    const block = session.block
    const canBid = simulate && live.leaderId !== me && passedOn !== live.playerKey
    return html`<div class="block">
      <div class="player">${v.name} <span class="muted">${positions(v.slots)}</span></div>
      <div class="muted">ESPN $${Math.round(v.consensus)} · market $${Math.round(v.market)}</div>
      <div class="price">
        $${live.price} <span class="muted">${teamName(live.leaderId)}</span>
        ${block ? html`<span class="countdown">${seconds(block.endsAt - session.time)}</span>` : null}
      </div>
      ${canBid
        ? html`<div class="actions">
            <button onClick=${() => setError(session.myBid(live.price + 1))}>+$1</button>
            <button onClick=${() => setError(session.myBid(live.price + 5))}>+$5</button>
            <input type="number" min="1" placeholder="$" value=${amount} onInput=${(e: Event) => setAmount(inputValue(e))} />
            <button onClick=${() => setError(session.myBid(Number(amount)))}>Bid</button>
            <button onClick=${() => setPassedOn(live.playerKey)}>Pass</button>
          </div>`
        : null}
    </div>`
  }

  const nominateView = () => {
    const q = query.trim().toLowerCase()
    const matches = session.available().filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, NOMINATE_RESULTS)
    const opening = Number(amount || '1')
    return html`<div class="block nominate">
      <div class="player">Your turn to nominate</div>
      <input placeholder="Search players" value=${query} onInput=${(e: Event) => setQuery(inputValue(e))} />
      <input type="number" min="1" placeholder="$1" value=${amount} onInput=${(e: Event) => setAmount(inputValue(e))} />
      <ul>
        ${matches.map(
          (p) => html`<li>
            <button onClick=${() => setError(session.myNominate(p.espnId, opening))}>Nominate</button>
            ${p.name} <span class="muted">market $${Math.round(marketPrice(p))}</span>
          </li>`,
        )}
      </ul>
    </div>`
  }

  const waiting = html`<div class="block muted">
    ${session.done ? 'Draft complete' : state.turnTeamId !== null ? `${teamName(state.turnTeamId)} is nominating…` : 'Waiting for the next nomination…'}
  </div>`

  const feed = html`<div class="feed">
    <h3>Sales (${state.sales.length})</h3>
    ${state.sales
      .slice(-FEED_ROWS)
      .reverse()
      .map((x) => html`<div class=${x.teamId === me ? 'mine' : ''}>${nameOf(x.playerKey)} → ${teamName(x.teamId)} $${x.price}</div>`)}
  </div>`

  const results = () => {
    const standings = session.standings()
    const r = session.myResult()
    const mine = me === null ? [] : state.sales.filter((x) => x.teamId === me)
    return html`<div class="results">
      <h3>Results</h3>
      <div>Value captured <b>$${Math.round(r.valueCaptured)}</b> (ESPN value − price) · <b>$${r.moneyLeft}</b> left unspent</div>
      ${standings
        ? html`<table class="standings">
            <thead><tr><th>#</th><th>Team</th><th>Pts</th>${CATEGORIES.map((c) => html`<th>${CATEGORY_LABELS[c]}</th>`)}<th>No proj.</th></tr></thead>
            <tbody>
              ${standings.map(
                (t) => html`<tr class=${t.teamId === me ? 'mine' : ''}>
                  <td>${t.rank}</td><td>${teamName(t.teamId)}</td><td>${t.total}</td>
                  ${CATEGORIES.map((c) => html`<td>${t.points[c]}</td>`)}
                  <td>${t.missingProjections}</td>
                </tr>`,
              )}
            </tbody>
          </table>`
        : html`<div class="muted">Projected standings need data/projections-2027.json; restart npm run sim once it exists.</div>`}
      <h3>My roster</h3>
      ${mine.map((x) => html`<div>${nameOf(x.playerKey)} $${x.price}</div>`)}
    </div>`
  }

  return html`<div class="room">
    ${strip}
    ${live ? blockView() : simulate && session.myTurn ? nominateView() : waiting}
    ${error ? html`<div class="error">${error}</div>` : null}
    ${session.done ? results() : feed}
  </div>`
}
```

- [ ] **Step 5: Implement `src/sim/ui/Controls.ts`**

```ts
import { useState } from 'preact/hooks'
import { html } from '../../ui/html'
import { ROOMS } from '../bots'
import { MODES, SPEEDS, type Mode, type Session, type SessionConfig } from '../session'
import type { BotKind } from '../types'

export const BOT_KINDS: readonly BotKind[] = ['stars', 'balanced', 'value']
export type RoomName = keyof typeof ROOMS
const ROOM_NAMES = Object.keys(ROOMS) as RoomName[]
export const MODE_LABELS: Record<Mode, string> = {
  simulate: 'Simulate vs bots',
  'replay-espn': 'Replay recorded ESPN draft',
  'replay-josh': "Replay Josh Lloyd's mock",
}
const roomName = (room: number): RoomName => ROOM_NAMES.find((n) => ROOMS[n] === room) ?? 'neutral'
const inputValue = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value

export interface RestartForm {
  mode: Mode
  seed: string
  room: RoomName
  /** comma-separated bot kinds, one per bot in draft order */
  bots: string
}

/** The config a Restart would use, or the message to show instead. */
export function configFromForm(base: SessionConfig, form: RestartForm): SessionConfig | string {
  const seed = Number(form.seed)
  if (form.seed.trim() === '' || !Number.isInteger(seed)) return 'Seed must be a whole number'
  const kinds = form.bots.split(',').map((k) => k.trim()).filter(Boolean)
  const bad = kinds.find((k) => !BOT_KINDS.includes(k as BotKind))
  if (bad !== undefined) return `Unknown bot "${bad}": use ${BOT_KINDS.join(', ')}`
  const need = base.options.pickOrder.length - 1
  if (kinds.length !== need) return `Bot mix needs ${need} bots, got ${kinds.length}`
  return { ...base, mode: form.mode, options: { ...base.options, seed, room: ROOMS[form.room], botKinds: kinds as BotKind[] } }
}

export function Controls({ session, onRestart }: { session: Session; onRestart: (config: SessionConfig) => void }) {
  const c = session.config
  const [form, setForm] = useState<RestartForm>({ mode: c.mode, seed: String(c.options.seed), room: roomName(c.options.room), bots: c.options.botKinds.join(',') })
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<RestartForm>) => setForm({ ...form, ...patch })
  const restart = () => {
    const next = configFromForm({ ...c, speed: session.speed, autopilot: session.autopilot }, form)
    if (typeof next === 'string') return setError(next)
    setError(null)
    onRestart(next)
  }
  const simulate = c.mode === 'simulate'
  return html`<div class="controls">
    <div class="row">
      ${SPEEDS.map((s) => html`<button class=${session.speed === s ? 'on' : ''} onClick=${() => session.setSpeed(s)}>${s === 'instant' ? 'Instant' : `${s}×`}</button>`)}
      <button onClick=${() => session.setPaused(!session.paused)}>${session.paused ? 'Play' : 'Pause'}</button>
      <button disabled=${session.done} onClick=${() => session.step()}>Step to next sale</button>
      <button disabled=${session.done} onClick=${() => session.finish()}>Run to end</button>
      <label class=${simulate ? '' : 'muted'}>
        <input type="checkbox" disabled=${!simulate} checked=${session.autopilot} onChange=${(e: Event) => session.setAutopilot((e.currentTarget as HTMLInputElement).checked)} />
        Autopilot
      </label>
    </div>
    <div class="row">
      <select value=${form.mode} onChange=${(e: Event) => set({ mode: inputValue(e) as Mode })}>
        ${MODES.map((m) => html`<option value=${m}>${MODE_LABELS[m]}</option>`)}
      </select>
      <label>Seed <input type="number" value=${form.seed} onInput=${(e: Event) => set({ seed: inputValue(e) })} /></label>
      <label>Room
        <select value=${form.room} onChange=${(e: Event) => set({ room: inputValue(e) as RoomName })}>
          ${ROOM_NAMES.map((n) => html`<option value=${n}>${n}</option>`)}
        </select>
      </label>
      <label>Bots <input class="bots" value=${form.bots} onInput=${(e: Event) => set({ bots: inputValue(e) })} /></label>
      <button onClick=${restart}>Restart</button>
    </div>
    ${error ? html`<div class="error">${error}</div>` : null}
  </div>`
}
```

- [ ] **Step 6: Implement `src/sim/ui/TunablesDrawer.ts`**

```ts
import { useReducer, useState } from 'preact/hooks'
import { DEFAULT_TUNABLES, resetTunables, setTunables, TUNABLES, type TunableName, type Tunables } from '../../engine/constants'
import { html } from '../../ui/html'

const NAMES = Object.keys(DEFAULT_TUNABLES) as TunableName[]

/** The batch flags that reproduce these tunables (only the ones that differ from the defaults). */
export function flagsFor(t: Readonly<Tunables>): string {
  return NAMES.filter((k) => t[k] !== DEFAULT_TUNABLES[k])
    .map((k) => `--set ${k}=${t[k]}`)
    .join(' ')
}

/** Edits the engine's tunables in place; onChange re-renders the panel's advice. */
export function TunablesDrawer({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [flags, setFlags] = useState<string | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const changed = NAMES.filter((k) => TUNABLES[k] !== DEFAULT_TUNABLES[k]).length
  const edit = (name: TunableName, text: string) => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) return redraw(0)
    setTunables({ [name]: n })
    redraw(0)
    onChange()
  }
  const reset = () => {
    resetTunables()
    setFlags(null)
    redraw(0)
    onChange()
  }
  const copy = () => {
    const text = flagsFor(TUNABLES)
    setFlags(text || '(all defaults)')
    navigator.clipboard?.writeText(text).catch(() => {})
  }
  return html`<div class="drawer">
    <button class="toggle" onClick=${() => setOpen(!open)}>${open ? 'Hide tunables' : 'Tunables'}${changed ? ` (${changed} changed)` : ''}</button>
    ${open
      ? html`<div>
          <div class="tunables">
            ${NAMES.map(
              (k) => html`<label class=${TUNABLES[k] !== DEFAULT_TUNABLES[k] ? 'changed' : ''}>
                ${k}
                <input type="number" step="any" name=${k} value=${TUNABLES[k]} onChange=${(e: Event) => edit(k, (e.currentTarget as HTMLInputElement).value)} />
              </label>`,
            )}
          </div>
          <div class="row">
            <button class="reset" onClick=${reset}>Reset</button>
            <button onClick=${copy}>Copy as flags</button>
          </div>
          ${flags ? html`<code>${flags}</code>` : null}
        </div>`
      : null}
  </div>`
}
```

- [ ] **Step 7: Implement `src/sim/ui/App.ts`**

```ts
import { html } from '../../ui/html'
import type { Session, SessionConfig } from '../session'
import { Controls, MODE_LABELS } from './Controls'
import { Room } from './Room'
import { TunablesDrawer } from './TunablesDrawer'

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function App({ session, onRestart }: { session: Session; onRestart: (config: SessionConfig) => void }) {
  return html`<div class="sim">
    <header>
      <b>Draft simulator</b>
      <span class="muted"> · ${MODE_LABELS[session.config.mode]} · seed ${session.config.options.seed} · ${clock(session.time)}${session.paused ? ' · paused' : ''}</span>
    </header>
    <${Controls} session=${session} onRestart=${onRestart} />
    <${TunablesDrawer} onChange=${() => session.refresh()} />
    <${Room} session=${session} />
  </div>`
}
```

- [ ] **Step 8: Implement `src/sim/page.ts`**

```ts
import { render } from 'preact'
import valuesJson from '../../data/values.json'
import recordingJson from '../../test/fixtures/espn-auction-recording.json'
import joshJson from '../../test/fixtures/josh-mock-sales.json'
import { downloadText, type Recording } from '../capture/recording'
import type { View } from '../controller'
import type { DraftEvent } from '../engine/types'
import { html } from '../ui/html'
import { mountPanel } from '../ui/mount'
import { Panel } from '../ui/Panel'
import type { PlayerValue } from '../values/types'
import type { JoshFixture } from './replay'
import { parseProjectionFile, projectionsFrom, type ProjectionSource } from './score'
import { createSession, defaultConfig, type Session, type SessionConfig, type SessionData } from './session'
import { App } from './ui/App'
import { SIM_CSS } from './ui/styles'

/** A background tab or a breakpoint must not fast-forward the draft. */
const MAX_FRAME_MS = 250

async function loadProjections(): Promise<ProjectionSource | null> {
  try {
    const res = await fetch('dist/projections-2027.json')
    if (!res.ok) return null
    return projectionsFrom(parseProjectionFile(await res.json()))
  } catch (e) {
    console.warn('Projections unavailable:', e)
    return null
  }
}

async function main(): Promise<void> {
  const style = document.createElement('style')
  style.textContent = SIM_CSS
  document.head.append(style)
  const app = document.getElementById('app')!
  const panel = mountPanel(document)
  const data: SessionData = {
    values: valuesJson as unknown as PlayerValue[],
    projections: await loadProjections(),
    recording: recordingJson as unknown as Recording,
    josh: joshJson as unknown as JoshFixture,
  }
  let session!: Session
  let generation = 0
  let unsubscribe = () => {}
  let shown: View | null = null

  const draw = () => {
    render(html`<${App} key=${generation} session=${session} onRestart=${restart} />`, app)
    // The panel only re-renders when the controller published a new view.
    if (session.view === shown) return
    shown = session.view
    render(
      html`<${Panel}
        ...${session.view}
        onEvent=${(ev: DraftEvent) => session.dispatch(ev)}
        onDownloadRecording=${() => downloadText(document, `sim-draft-${Date.now()}.json`, session.recordingJson())}
        onReset=${() => void restart({ ...session.config, speed: session.speed, autopilot: session.autopilot })}
        onDismissAlert=${() => session.dismissAlert()}
      />`,
      panel,
    )
  }

  async function restart(config: SessionConfig): Promise<void> {
    const next = await createSession(config, data)
    unsubscribe()
    session = next
    generation++
    shown = null
    unsubscribe = session.subscribe(draw)
    draw()
  }

  await restart(defaultConfig())
  let last = performance.now()
  const frame = (now: number) => {
    const dt = Math.min(MAX_FRAME_MS, now - last)
    last = now
    session.tick(dt)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e: unknown) => {
  document.body.textContent = `Draft simulator failed to start: ${e instanceof Error ? e.message : String(e)}`
})
```

- [ ] **Step 9: Create `sim/index.html`, `sim.mjs`, scripts and ignore**

`sim/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Draft simulator</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="dist/page.js"></script>
  </body>
</html>
```

`sim.mjs`:

```js
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import * as esbuild from 'esbuild'

// Dev server for the simulator page: rebuilds on save and reloads the page.
const PORT = Number(process.env.SIM_PORT ?? 5173)
const PROJECTIONS = 'data/projections-2027.json'

mkdirSync('sim/dist', { recursive: true })
if (existsSync(PROJECTIONS)) copyFileSync(PROJECTIONS, 'sim/dist/projections-2027.json')
else console.warn(`No ${PROJECTIONS} yet: the page will skip projected standings.`)

const ctx = await esbuild.context({
  entryPoints: ['src/sim/page.ts'],
  outfile: 'sim/dist/page.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'info',
  banner: { js: "new EventSource('/esbuild').addEventListener('change', () => location.reload());" },
})
await ctx.watch()
const { port } = await ctx.serve({ servedir: 'sim', host: '127.0.0.1', port: PORT })
const url = `http://127.0.0.1:${port}/`
console.log(`Draft simulator: ${url}`)
if (process.argv.includes('--open')) spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
```

`package.json` scripts: add `"sim": "node sim.mjs"` before `"sim:batch"`. `.gitignore`: add a line `sim/dist/`.

- [ ] **Step 10: Run tests** — `npx vitest run test/sim/ui.test.ts test/sim/page-build.test.ts --testTimeout=60000` → PASS. Then the full suite, `npm run typecheck`, and `npm run build` (the extension must still build).

- [ ] **Step 11: Smoke-test the dev server**

Start `npm run sim` in the background, then poll `curl -sf http://127.0.0.1:5173/` (up to ~20 s) until it returns the HTML. Check that `curl -sf http://127.0.0.1:5173/dist/page.js | head -c 200` returns JavaScript. Stop the server. Report both results. If port 5173 is busy, use `SIM_PORT=5174`.

- [ ] **Step 12: README section**

Add to `espn-auction-helper/README.md`, after the existing usage sections, at the same heading level as its other top-level sections:

````markdown
## Simulator

Run drafts locally against bot teams, no ESPN needed.

### Interactive: `npm run sim`

Serves the simulator at http://127.0.0.1:5173 (`npm run sim -- --open` also opens it). Saving any source file rebuilds and reloads the page.

- **Room (left):**
  - Teams in draft order, with $ left and open slots. Amber marks the team nominating.
  - The block, with its clock and your buttons: +$1, +$5, amount, Pass.
  - A player search when it is your turn to nominate.
  - Recent sales.
  - At the end of the draft: projected standings, your value captured and money left.
- **Panel (right):** the real helper panel, fed the same socket lines ESPN sends. Manual entry still works.
- **Controls:**
  - Speed: 1×, 5×, 20× or Instant.
  - Pause, Step to next sale, Run to end.
  - Autopilot: your team follows the panel's calls.
  - Mode: simulate, replay the recorded ESPN draft, or replay Josh Lloyd's mock.
  - Seed, room (cold, neutral, hot), bot mix, Restart.
- **Tunables:** edit any engine constant and the panel updates immediately. Reset restores the defaults; Copy as flags gives the matching `--set` flags for the batch runner.

### Batch: `npm run sim:batch`

Runs seeded drafts with your team on autopilot and two baselines on the same seeds and bots:
- `market` bids up to the average price paid.
- `consensus` bids up to ESPN's value.

```
npm run sim:batch -- --drafts 200
npm run sim:batch -- --drafts 100 --room hot --set BID_GAP_FRACTION=0.2 --compare
npm run sim:batch -- --drafts 50 --json > results.json
```

Flags:
- `--drafts N` (default 100)
- `--seed N` (default 1; drafts use seeds N, N+1, …)
- `--room cold|neutral|hot|<number>`
- `--policies autopilot,market,consensus`
- `--set NAME=value` (repeatable)
- `--compare`: defaults vs your `--set` values on the same seeds
- `--json`

Columns:
- avg rank: average projected roto rank, 1 = best, with the 95% interval.
- roto pts: projected roto points.
- 1st %: share of drafts won.
- value captured: ESPN value minus price, summed over your roster.
- $ left: money left unspent.

### Projections

Standings need `data/projections-2027.json`, which is built separately. It is an array of `{ "espnId", "pts", "reb", "ast", "stl", "blk", "tpm", "to", "fgm", "fga", "ftm", "fta" }` season totals. Without it the simulator still runs and reports value captured and money left.

### Bots

The 9 bots are 3 stars-and-scrubs, 4 balanced and 2 value hunters. For each player, every bot draws a private value: market price × lognormal noise × room × personality. Bots keep ESPN's budget rule (keep $1 for every other open slot) and don't spend more than 60% of their budget while 4 or more slots are open. They nominate the top player 80% of the time and a cheap player otherwise.
````

- [ ] **Step 13: Commit**

```bash
git add src/sim/ui/styles.ts src/sim/ui/Room.ts src/sim/ui/Controls.ts src/sim/ui/TunablesDrawer.ts src/sim/ui/App.ts src/sim/page.ts sim/index.html sim.mjs package.json .gitignore README.md test/sim/ui.test.ts test/sim/page-build.test.ts
git commit -m "feat(sim): interactive simulator page with the real panel, controls and tunables drawer" -m "<your Co-Authored-By line>"
```
