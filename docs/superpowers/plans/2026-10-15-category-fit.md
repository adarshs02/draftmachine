# Category Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each player's value (and so the panel's max and autopilot's bids) depend on what he adds to my roster in H2H each-category, and score the simulator on projections plus error so the gain is measured honestly.

**Architecture:** The weekly H2H model moves from `src/sim/score.ts` to `src/engine/h2h.ts`. `values.json` carries each player's projected season line. A new `src/engine/fit.ts` compares a player's gain in expected weekly categories for my roster against a generic roster, normalized by the remaining pool, and `verdict` / `autopilotCap` multiply the adjusted value by it. The simulator scores seasons on `truthFrom(projections, seed)`.

**Tech Stack:** TypeScript strict, Preact 11 + htm, vitest (+ jsdom), esbuild, tsx. Repo: `espn-auction-helper/` inside `/Users/adarsh/myProjects/draftmachine`, branch `feat/projections-values`.

**Spec:** `docs/superpowers/specs/2026-10-15-category-fit-design.md`

## Global Constraints

- The engine (`src/engine/*`) never imports `src/sim/*`.
- `FIT_WEIGHT=0` reproduces today's calls exactly; the existing suite, the Josh replay included, stays green.
- Nomination suggestions, bots, `infl`, the temperature label and `saleFlags` keep today's behavior (`adjustedValue` and `ceilingFor`'s default stay as they are).
- Tunables: `FIT_WEIGHT: 1`, `FIT_MIN: 0.75`, `FIT_MAX: 1.25`.
- Projection error: games `clamp(1 + 0.15·z, 0.3, 1.3)`; each counting stat and attempt total × `exp(0.10·z − 0.005)`; FG% `+ 0.015·z`, FT% `+ 0.03·z`, clamped to [0, 1].
- Ship rule: fit stays on by default only if the paired title % difference over 300 seeds has a 95% interval above 0.
- Never commit `recordings/*`; never stage the 4 `draft-tracker/` deletions; commit with explicit paths; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push or merge.
- Tests: `npx vitest run <path>` (if rtk's parser fails, `rtk proxy npx vitest run <path>`); types: `npx tsc --noEmit`. Run from `espn-auction-helper/`.

## Review Focus

1. A rostered player with no stat line (rookie, unknown ESPN id) must count as a filler, not as nothing — otherwise my team looks empty in every category and fit swings wildly.
2. A player on the block outside the filler pool (late draft, pool = few open slots) still gets a fit computed from his own line.
3. My roster full, or only rivals full: no crash; fit is null when I have no open slot.
4. Undo and fixed sales create a new sales list; the cached context must follow it (no stale fit after undo).
5. `values.json` built without the stats file (`line: null` everywhere): fit null, panel shows no fit line, autopilot unchanged.

---

### Task 1: Shared weekly model in the engine

**Files:**
- Create: `src/engine/h2h.ts`
- Modify: `src/sim/score.ts` (lines 1–103 and 219 move out; re-export)
- Test: `test/engine/h2h.test.ts`

**Interfaces:**
- Produces: `SeasonLine`, `LINE_FIELDS`, `ProjectionSource`, `projectionsFrom`, `CATEGORIES`, `Category`, `CATEGORY_LABELS`, `NBA_WEEKS`, `GAME_DISPERSION`, `GAMES_CV2`, `WeeklyLine`, `weeklyFromLines(lines: readonly SeasonLine[]): WeeklyLine`, `weeklyLine(espnIds, proj): { week: WeeklyLine; missing: number }`, `categoryWinChance(a, b, c, weeks = 1): number` — all from `src/engine/h2h.ts`, and re-exported unchanged by `src/sim/score.ts`.

- [ ] **Step 1: Write the failing test** — `test/engine/h2h.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/engine/h2h.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/h2h`.

- [ ] **Step 3: Create `src/engine/h2h.ts`**

Move from `src/sim/score.ts`, verbatim: the `SeasonLine` interface, `LINE_FIELDS`, `ProjectionSource`, `CATEGORIES`, `Category`, `CATEGORY_LABELS`, `COUNTING` / `Counting`, `NBA_WEEKS`, `GAME_DISPERSION`, `GAMES_CV2`, `MAKE_DISPERSION`, `ATTEMPT_DISPERSION`, `WeeklyLine`, `phi`, `categoryWinChance`, `projectionsFrom`, with their comments. Replace `weeklyLine` with:

```ts
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
```

`h2h.ts` has no imports.

- [ ] **Step 4: Make `src/sim/score.ts` import and re-export**

Delete the moved code from `score.ts` and put at its top:

```ts
import { CATEGORIES, categoryWinChance, weeklyLine, type Category, type ProjectionSource } from '../engine/h2h'
import { mulberry32, type Rng } from './rng'

export {
  CATEGORIES, CATEGORY_LABELS, categoryWinChance, GAME_DISPERSION, GAMES_CV2, LINE_FIELDS, NBA_WEEKS, projectionsFrom, weeklyFromLines, weeklyLine,
} from '../engine/h2h'
export type { Category, ProjectionSource, SeasonLine, WeeklyLine } from '../engine/h2h'
```

`H2H`, `TeamScore`, `roundRobin`, `shuffled`, `scoreTeams` stay in `score.ts`.

- [ ] **Step 5: Run the tests and types**

Run: `npx vitest run test/engine/h2h.test.ts test/sim && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/h2h.ts src/sim/score.ts test/engine/h2h.test.ts
git commit -m "refactor(engine): move the weekly H2H model into the engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Stat lines in values.json

**Files:**
- Move: `src/sim/seasonStats.ts` → `src/values/seasonStats.ts`; `test/sim/seasonStats.test.ts` → `test/values/seasonStats.test.ts`
- Modify: `src/values/types.ts`, `src/values/blend.ts:94,104`, `src/engine/reducer.ts:9`, `scripts/build-values.ts`, `scripts/sim-batch.ts:5`, `src/sim/page.ts:16`, `test/helpers.ts:10`, `test/values/rescale.test.ts:6`, `test/values/tiers.test.ts:5`, `test/replay.test.ts:23`
- Regenerate: `data/values.json`

**Interfaces:**
- Consumes: `SeasonLine`, `LINE_FIELDS`, `projectionsFrom`, `ProjectionSource` from `src/engine/h2h.ts` (Task 1).
- Produces: `PlayerValue.line: SeasonLine | null`; `seasonLine(r: PerGameRow, edit: Playtime | undefined): SeasonLine`; `withLines(values: readonly PlayerValue[], statsCsv: string | null, playtimeCsv: string | null): PlayerValue[]`; `seasonProjections`, `projectionsFromCsv`, `STATS_PATH`, `PLAYTIME_PATH` now from `src/values/seasonStats.ts`.

- [ ] **Step 1: Move the module and its test**

```bash
git mv src/sim/seasonStats.ts src/values/seasonStats.ts
git mv test/sim/seasonStats.test.ts test/values/seasonStats.test.ts
```

In `src/values/seasonStats.ts` change the imports to:

```ts
import { LINE_FIELDS, projectionsFrom, type ProjectionSource, type SeasonLine } from '../engine/h2h'
import { normalizeName } from './names'
import type { PlayerValue } from './types'
```

In `test/values/seasonStats.test.ts` change the import path to `'../../src/values/seasonStats'`. In `scripts/sim-batch.ts` and `src/sim/page.ts` change `seasonStats` imports to `'../src/values/seasonStats'` and `'../values/seasonStats'`.

- [ ] **Step 2: Write the failing test** — append to `test/values/seasonStats.test.ts`:

```ts
describe('withLines', () => {
  it('adds each player\'s season line, rounded to 0.1, keyed by name; null without a stats row', () => {
    const out = withLines(VALUES, CSV, null)
    expect(out[0].line).toMatchObject({ pts: Math.round(28.4 * 72 * 10) / 10, fga: Math.round(18.3 * 72 * 10) / 10 })
    expect(out[1].line!.stl).toBeCloseTo(3.0 * 70, 6)
    expect(out[2].line).toBeNull()
    expect(out.map((v) => v.b)).toEqual(VALUES.map((v) => v.b))
  })

  it('takes games and minutes from the sheet like the simulator does', () => {
    const sheet = '"PLAYER","GP","MPG"\n"Nikola Jokic","60","35.1"'
    expect(withLines(VALUES, CSV, sheet)[0].line!.pts).toBeCloseTo(Math.round(28.4 * 60 * 10) / 10, 6)
  })

  it('gives every player a null line without the stats file', () => {
    expect(withLines(VALUES, null, null).every((v) => v.line === null)).toBe(true)
  })

  it('matches seasonProjections for players with an ESPN id', () => {
    const proj = seasonProjections(parseHashtagStats(CSV), new Map(), VALUES)
    expect(withLines(VALUES, CSV, null)[0].line!.reb).toBeCloseTo(proj(3112335)!.reb, 1)
  })
})
```

and add `withLines` to that file's import list.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/values/seasonStats.test.ts`
Expected: FAIL — `withLines` is not exported.

- [ ] **Step 4: Implement** — in `src/values/seasonStats.ts` replace the body of `seasonProjections`' loop with a shared helper and add `withLines`:

```ts
/** Season totals for one stats row: per-game x games; the sheet's games and minutes win, per-game stats scale with the minutes. */
export function seasonLine(r: PerGameRow, edit: Playtime | undefined): SeasonLine {
  const scale = (edit?.gp ?? r.gp) * (edit && r.mpg > 0 ? edit.mpg / r.mpg : 1)
  return Object.fromEntries(LINE_FIELDS.map((f) => [f, r.perGame[f] * scale])) as unknown as SeasonLine
}

export function seasonProjections(stats: readonly PerGameRow[], playtime: ReadonlyMap<string, Playtime>, values: readonly PlayerValue[]): ProjectionSource {
  const byKey = new Map(stats.map((r) => [r.key, r]))
  const rows = new Map<number, SeasonLine>()
  for (const v of values) {
    if (v.espnId === null) continue
    const r = byKey.get(v.key)
    if (r) rows.set(v.espnId, seasonLine(r, playtime.get(r.key)))
  }
  return projectionsFrom(rows)
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** Each value with its projected season line (rounded to 0.1); null without a stats row, and for everyone without the stats file. */
export function withLines(values: readonly PlayerValue[], statsCsv: string | null, playtimeCsv: string | null): PlayerValue[] {
  if (statsCsv === null) return values.map((v) => ({ ...v, line: null }))
  const byKey = new Map(parseHashtagStats(statsCsv).map((r) => [r.key, r]))
  const playtime = playtimeCsv === null ? new Map<string, Playtime>() : parsePlaytime(playtimeCsv)
  return values.map((v) => {
    const r = byKey.get(v.key)
    if (!r) return { ...v, line: null }
    const l = seasonLine(r, playtime.get(r.key))
    return { ...v, line: Object.fromEntries(LINE_FIELDS.map((f) => [f, round1(l[f])])) as unknown as SeasonLine }
  })
}
```

In `src/values/types.ts` add `import type { SeasonLine } from '../engine/h2h'` and the field after `tier`:

```ts
  /** projected season totals (data/hashtag-projections.csv x games), null without a stats row */
  line: SeasonLine | null
```

Add `line: null` to every `PlayerValue` literal: `src/values/blend.ts` lines 94 and 104, `placeholderValue` in `src/engine/reducer.ts`, `pv` in `test/helpers.ts`, `v` in `test/values/rescale.test.ts` and `test/values/tiers.test.ts`, `blank` in `test/replay.test.ts`. Run `npx tsc --noEmit` and add it to any other literal tsc names.

`scripts/build-values.ts` becomes:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { EspnPlayer } from '../src/espn/players'
import { blendValues } from '../src/values/blend'
import { parseJoshCsv } from '../src/values/josh'
import { parseProjectionsCsv } from '../src/values/projections'
import { PLAYTIME_PATH, STATS_PATH, withLines } from '../src/values/seasonStats'

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
const espn = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
const josh = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))
const projections = parseProjectionsCsv(readFileSync('data/auction-values.csv', 'utf8'))
const { values: blended, unmatchedJosh, unmatchedProjections, basis, ratios } = blendValues(espn, josh, projections)
const stats = read(STATS_PATH)
const values = withLines(blended, stats, read(PLAYTIME_PATH))
writeFileSync('data/values.json', JSON.stringify(values, null, 1))
console.log(`basis ${basis.toFixed(3)}  tier ratios ${JSON.stringify(ratios)}`)
console.log(`unmatched Josh rows: ${unmatchedJosh.length ? unmatchedJosh.join(', ') : 'none'}`)
console.log(`projected players missing from ESPN: ${unmatchedProjections.length ? unmatchedProjections.join(', ') : 'none'}`)
console.log(stats === null ? `No ${STATS_PATH}: no stat lines, so category fit is off.` : `stat lines: ${values.filter((v) => v.line).length} of ${values.length} players`)
console.log(values.slice(0, 12).map((v) => `${v.name} $${v.b}`).join('\n'))
```

- [ ] **Step 5: Regenerate values and run tests**

Run: `npm run values && npx vitest run && npx tsc --noEmit`
Expected: build prints `stat lines: N of M` with N ≥ 150; whole suite PASS; tsc clean. `git diff --stat data/values.json` shows only added `line` blocks (no `b` changes): check with `git diff data/values.json | grep '^[-+] *"b"' | wc -l` → `0`.

- [ ] **Step 6: Commit**

```bash
git add src/values/seasonStats.ts src/sim/seasonStats.ts test/values/seasonStats.test.ts test/sim/seasonStats.test.ts src/values/types.ts src/values/blend.ts src/engine/reducer.ts scripts/build-values.ts scripts/sim-batch.ts src/sim/page.ts test/helpers.ts test/values/rescale.test.ts test/values/tiers.test.ts test/replay.test.ts data/values.json
git commit -m "feat(values): carry each player's projected season line in values.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Category fit

**Files:**
- Create: `src/engine/fit.ts`, `test/engine/fitFixture.ts`, `test/engine/fit.test.ts`
- Modify: `src/engine/constants.ts`

**Interfaces:**
- Consumes: `weeklyFromLines`, `categoryWinChance`, `CATEGORIES`, `LINE_FIELDS`, `SeasonLine`, `WeeklyLine`, `Category` (Task 1); `PlayerValue.line` (Task 2); `adjustedValue`, `allTeams`, `available`, `inflation`, `teamSummary`, `temperature`, `valueOf` from `src/engine/metrics.ts`.
- Produces: `interface Fit { mult: number; cats: Category[] }`; `fitFor(s: DraftState, key: string): Fit | null`; `myValue(s: DraftState, key: string, I = inflation(s), label = temperature(s).label): number`; tunables `FIT_WEIGHT`, `FIT_MIN`, `FIT_MAX`; test fixture `FIT_S`, `FIT_V`, `statLine`, `BASE_LINE` from `test/engine/fitFixture.ts`.

- [ ] **Step 1: Add the tunables** — in `src/engine/constants.ts`, after `SLOT_FLOOR_OPEN: 6,`:

```ts
  FIT_WEIGHT: 1,
  FIT_MIN: 0.75,
  FIT_MAX: 1.25,
```

- [ ] **Step 2: Write the fixture** — `test/engine/fitFixture.ts`:

```ts
import type { SeasonLine } from '../../src/engine/h2h'
import type { PlayerValue } from '../../src/values/types'
import { pv, settings } from '../helpers'

export const statLine = (pts: number, reb: number, ast: number, stl: number, blk: number, tpm: number, to: number, fgm: number, fga: number, ftm: number, fta: number): SeasonLine => ({
  pts, reb, ast, stl, blk, tpm, to, fgm, fga, ftm, fta,
})
/** A typical rotation player's season. */
export const BASE_LINE = statLine(1300, 520, 300, 80, 50, 130, 150, 480, 1000, 210, 270)

/** 4 teams, all-bench lineup (no positional need). */
export const FIT_S = settings(4, { lineupSlotCounts: { 12: 13 } })
const withLine = (name: string, b: number, line: SeasonLine | null): PlayerValue => pv(name, b, { line })
export const FIT_V: PlayerValue[] = [
  ...Array.from({ length: 60 }, (_, i) => withLine(`P${i + 1}`, 30 - i * 0.4, BASE_LINE)),
  ...[1, 2, 3].map((i) => withLine(`Wall${i}`, 20, { ...BASE_LINE, blk: 250 })),
  ...[1, 2, 3].map((i) => withLine(`Brick${i}`, 20, { ...BASE_LINE, ftm: 100, fta: 400 })),
  withLine('Blocker', 20, { ...BASE_LINE, blk: 160 }),
  withLine('Passer', 20, { ...BASE_LINE, ast: 650 }),
  withLine('Shooter', 20, { ...BASE_LINE, ftm: 380, fta: 420 }),
  withLine('NoStats', 20, null),
  withLine('Cheapo', 3, BASE_LINE),
]
```

- [ ] **Step 3: Write the failing tests** — `test/engine/fit.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { resetTunables, setTunables } from '../../src/engine/constants'
import { fitFor, myValue } from '../../src/engine/fit'
import { adjustedValue } from '../../src/engine/metrics'
import type { DraftEvent } from '../../src/engine/types'
import { build, sold } from '../helpers'
import { FIT_S, FIT_V } from './fitFixture'

const at = (events: DraftEvent[], me: number | null = 1) => build(FIT_S, FIT_V, events, me)
const walls = [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20)]
const bricks = [sold('Brick1', 1, 20), sold('Brick2', 1, 20), sold('Brick3', 1, 20)]

afterEach(() => resetTunables())

describe('fitFor', () => {
  it('is x1 before my roster has a shape', () => {
    expect(fitFor(at([]), 'blocker')!.mult).toBeCloseTo(1, 6)
    expect(fitFor(at([sold('P1', 2, 30)]), 'passer')!.mult).toBeCloseTo(1, 6)
  })

  it('a roster already strong in blocks rates a blocker under x1 and a passer over x1', () => {
    const s = at(walls)
    const blocker = fitFor(s, 'blocker')!
    const passer = fitFor(s, 'passer')!
    expect(blocker.mult).toBeLessThan(0.98)
    expect(passer.mult).toBeGreaterThan(1)
    expect(blocker.cats[0]).toBe('blk')
  })

  it('a roster far behind in FT% rates a good FT shooter under x1: punting emerges', () => {
    const f = fitFor(at(bricks), 'shooter')!
    expect(f.mult).toBeLessThan(0.98)
    expect(f.cats).toContain('ftPct')
  })

  it('is null without a line, under $5, without my team, with my roster full, or with FIT_WEIGHT 0', () => {
    expect(fitFor(at(walls), 'nostats')).toBeNull()
    expect(fitFor(at(walls), 'cheapo')).toBeNull()
    expect(fitFor(at(walls, null), 'blocker')).toBeNull()
    const full = Array.from({ length: 13 }, (_, i) => sold(`P${i + 1}`, 1, 1))
    expect(fitFor(at(full), 'blocker')).toBeNull()
    setTunables({ FIT_WEIGHT: 0 })
    expect(fitFor(at(walls), 'blocker')).toBeNull()
  })

  it('stays inside FIT_MIN..FIT_MAX', () => {
    setTunables({ FIT_MIN: 0.99, FIT_MAX: 1.01 })
    const s = at(walls)
    for (const key of ['blocker', 'passer', 'p30']) {
      const m = fitFor(s, key)!.mult
      expect(m).toBeGreaterThanOrEqual(0.99)
      expect(m).toBeLessThanOrEqual(1.01)
    }
  })

  it('counts a rostered player without a line as an average player, not an empty slot', () => {
    expect(fitFor(at([sold('NoStats', 1, 20)]), 'blocker')!.mult).toBeCloseTo(1, 2)
  })

  it('rates a player outside the filler pool from his own line', () => {
    // 3 teams full, mine with 1 open: the pool is the top 1 + rivals' open slots.
    const fill = (team: number, from: number) => Array.from({ length: 13 }, (_, i) => sold(`P${from + i}`, team, 1))
    const s = at([...walls, ...fill(2, 1), ...fill(3, 14), ...fill(4, 27), ...Array.from({ length: 9 }, (_, i) => sold(`P${40 + i}`, 1, 1))])
    expect(fitFor(s, 'p60')).not.toBeNull()
  })

  it('follows undo: the fit after undoing a sale equals the fit before it', () => {
    const before = fitFor(at(walls.slice(0, 2)), 'blocker')!.mult
    expect(fitFor(at([...walls, { type: 'undo' }]), 'blocker')!.mult).toBeCloseTo(before, 9)
  })
})

describe('myValue', () => {
  it('is the adjusted value times the fit, and exactly the adjusted value with FIT_WEIGHT 0', () => {
    const s = at(walls)
    expect(myValue(s, 'blocker')).toBeCloseTo(adjustedValue(s, 'blocker') * fitFor(s, 'blocker')!.mult, 9)
    setTunables({ FIT_WEIGHT: 0 })
    expect(myValue(s, 'blocker')).toBe(adjustedValue(s, 'blocker'))
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run test/engine/fit.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/fit`.

- [ ] **Step 5: Implement `src/engine/fit.ts`**

```ts
import { TUNABLES } from './constants'
import { CATEGORIES, categoryWinChance, LINE_FIELDS, weeklyFromLines, type Category, type SeasonLine, type WeeklyLine } from './h2h'
import { adjustedValue, allTeams, available, inflation, teamSummary, temperature, valueOf, type TempLabel } from './metrics'
import type { DraftState, Sale } from './types'

export interface Fit {
  /** multiplier on the player's value for my roster */
  mult: number
  /** categories behind it: where he helps me most (mult > 1) or least (mult < 1) */
  cats: Category[]
}

/** Gains (expected weekly categories won) this small are noise. */
const MIN_GAIN = 0.001
/** Smallest per-category part the panel names. */
const MIN_PART = 0.005

interface FitContext {
  rivals: WeeklyLine[]
  /** my roster's lines, a filler in every open slot (the last line is always a filler) */
  myLines: SeasonLine[]
  myBase: number[]
  /** a roster of fillers: what a value that ignores my roster assumes */
  genericLines: SeasonLine[]
  genericBase: number[]
  /** my gain over the generic gain, summed over the filler pool: the typical remaining player's ratio */
  typical: number
}

const total = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

function meanLine(lines: readonly SeasonLine[]): SeasonLine {
  return Object.fromEntries(LINE_FIELDS.map((f) => [f, total(lines.map((l) => l[f])) / lines.length])) as unknown as SeasonLine
}

/** Chance to win each category in a week, averaged over the rivals. */
function perCategory(week: WeeklyLine, rivals: readonly WeeklyLine[]): number[] {
  return CATEGORIES.map((c) => total(rivals.map((r) => categoryWinChance(week, r, c))) / rivals.length)
}

/** A team's lines: rostered players (a filler for one without stats), then a filler per open slot. */
function teamLines(s: DraftState, teamId: number, filler: SeasonLine): SeasonLine[] {
  const t = teamSummary(s, teamId)
  return [...t.roster.map((x) => valueOf(s, x.playerKey).line ?? filler), ...Array<SeasonLine>(t.open).fill(filler)]
}

/** Per-category gain from swapping the last line (a filler) for `line`. */
function gain(lines: readonly SeasonLine[], base: readonly number[], line: SeasonLine, rivals: readonly WeeklyLine[]): number[] {
  return perCategory(weeklyFromLines([...lines.slice(0, -1), line]), rivals).map((x, i) => x - base[i])
}

function buildContext(s: DraftState, me: number): FitContext | null {
  const teams = allTeams(s)
  const rivalIds = teams.filter((t) => t.id !== me).map((t) => t.id)
  if (!rivalIds.length || teamSummary(s, me).open === 0) return null
  const pool = available(s)
    .filter((v) => v.line !== null)
    .slice(0, total(teams.map((t) => t.open)))
  if (!pool.length) return null
  const filler = meanLine(pool.map((v) => v.line!))
  const rivals = rivalIds.map((id) => weeklyFromLines(teamLines(s, id, filler)))
  const myLines = teamLines(s, me, filler)
  const genericLines = Array<SeasonLine>(s.settings.rosterSize).fill(filler)
  const myBase = perCategory(weeklyFromLines(myLines), rivals)
  const genericBase = perCategory(weeklyFromLines(genericLines), rivals)
  let mine = 0
  let generic = 0
  for (const v of pool) {
    mine += total(gain(myLines, myBase, v.line!, rivals))
    generic += total(gain(genericLines, genericBase, v.line!, rivals))
  }
  if (mine < MIN_GAIN || generic < MIN_GAIN) return null
  return { rivals, myLines, myBase, genericLines, genericBase, typical: mine / generic }
}

// One context per sales list: bids don't change it, a sale, undo or fix makes a new list.
const cache = new WeakMap<readonly Sale[], { values: DraftState['values']; settings: DraftState['settings']; me: number; ctx: FitContext | null }>()

function context(s: DraftState, me: number): FitContext | null {
  const hit = cache.get(s.sales)
  if (hit && hit.values === s.values && hit.settings === s.settings && hit.me === me) return hit.ctx
  const ctx = buildContext(s, me)
  cache.set(s.sales, { values: s.values, settings: s.settings, me, ctx })
  return ctx
}

/**
 * How much more (or less) a player helps my roster than the typical remaining player, against my
 * rivals as they stand: (my gain / generic gain) / typical, clamped, ^FIT_WEIGHT. Null when it doesn't apply.
 */
export function fitFor(s: DraftState, key: string): Fit | null {
  if (TUNABLES.FIT_WEIGHT === 0 || s.myTeamId === null) return null
  const v = valueOf(s, key)
  if (v.line === null || v.b < TUNABLES.NEED_MIN_VALUE) return null
  const ctx = context(s, s.myTeamId)
  if (!ctx) return null
  const mine = gain(ctx.myLines, ctx.myBase, v.line, ctx.rivals)
  const generic = gain(ctx.genericLines, ctx.genericBase, v.line, ctx.rivals)
  const g = total(generic)
  if (g < MIN_GAIN) return null
  const m = total(mine)
  const raw = m <= 0 ? TUNABLES.FIT_MIN : Math.min(TUNABLES.FIT_MAX, Math.max(TUNABLES.FIT_MIN, m / g / ctx.typical))
  const mult = raw ** TUNABLES.FIT_WEIGHT
  // My gain in generic units, so the parts compare the way the multiplier does.
  const parts = CATEGORIES.map((c, i) => ({ c, d: mine[i] / ctx.typical - generic[i] }))
  const named =
    mult > 1 ? parts.filter((p) => p.d > MIN_PART).sort((a, b) => b.d - a.d) : mult < 1 ? parts.filter((p) => p.d < -MIN_PART).sort((a, b) => a.d - b.d) : []
  return { mult, cats: named.slice(0, 2).map((p) => p.c) }
}

/** The player's value for my roster: adjusted value (inflation, hot-room stars) x category fit. */
export function myValue(s: DraftState, key: string, I = inflation(s), label: TempLabel = temperature(s).label): number {
  return adjustedValue(s, key, I, label) * (fitFor(s, key)?.mult ?? 1)
}
```

If `TempLabel` isn't exported from `metrics.ts`, it is (line 56: `export type TempLabel`).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/engine/fit.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean. If the blocker / passer / shooter directions fail, print `fitFor` for each and the context's `typical` before changing anything: the fixture's direction claims are the spec's (§8), the code is what's under test.

- [ ] **Step 7: Commit**

```bash
git add src/engine/fit.ts src/engine/constants.ts test/engine/fitFixture.ts test/engine/fit.test.ts
git commit -m "feat(engine): category fit: value a player by what he adds to my roster

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The call and autopilot use my value

**Files:**
- Modify: `src/engine/verdict.ts`, `src/sim/policies.ts:2,26`, `test/ui/format.test.ts:5`
- Test: `test/engine/verdict.test.ts`, `test/sim/policies.test.ts`, `test/engine/fit.test.ts` (timing)

**Interfaces:**
- Consumes: `fitFor`, `myValue`, `Fit` (Task 3).
- Produces: `Verdict.fit: Fit | null`; `verdict().adjusted` = my value; `autopilotCap` uses `myValue`.

- [ ] **Step 1: Write the failing tests**

Append to `test/engine/verdict.test.ts` (add imports `resetTunables, setTunables` from `../../src/engine/constants`, `fitFor` from `../../src/engine/fit`, `adjustedValue` from `../../src/engine/metrics`, `FIT_S, FIT_V` from `./fitFixture`, and `afterEach` from vitest):

```ts
describe('verdict with category fit', () => {
  afterEach(() => resetTunables())
  const s = build(FIT_S, FIT_V, [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20), nominated('Blocker', 2, 1)])

  it('values the player for my roster and says why', () => {
    const v = verdict(s)!
    const f = fitFor(s, 'blocker')!
    expect(v.fit).toEqual(f)
    expect(v.adjusted).toBeCloseTo(adjustedValue(s, 'blocker') * f.mult, 9)
    expect(v.ceiling).toBe(ceilingFor(s, 'blocker', v.adjusted))
  })

  it('FIT_WEIGHT 0 gives today\'s call', () => {
    setTunables({ FIT_WEIGHT: 0 })
    const v = verdict(s)!
    expect(v.fit).toBeNull()
    expect(v.adjusted).toBe(adjustedValue(s, 'blocker'))
  })
})
```

Append to `test/sim/policies.test.ts` (imports: `fitFor` from `../../src/engine/fit`, `FIT_S, FIT_V` from `../engine/fitFixture`, `sold` from `../helpers`):

```ts
describe('autopilotCap with category fit', () => {
  it('bids less for a player my roster needs less, and FIT_WEIGHT 0 restores the old cap', () => {
    const s = build(FIT_S, FIT_V, [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20), nominated('Blocker', 2, 1)])
    expect(fitFor(s, 'blocker')!.mult).toBeLessThan(1)
    const withFit = autopilotCap(s, 'blocker')
    setTunables({ FIT_WEIGHT: 0 })
    const without = autopilotCap(s, 'blocker')
    resetTunables()
    expect(withFit).toBeLessThan(without)
  })
})
```

Append to `test/engine/fit.test.ts` (imports: `readFileSync` from `node:fs`, `verdict` from `../../src/engine/verdict`, `nominated, settings` from `../helpers`, `PlayerValue` type):

```ts
describe('speed on real data', () => {
  it('a full 10-team state: first verdict after a sale under 50 ms, each bid after it under 5 ms', () => {
    const values = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
    const top = [...values].sort((a, b) => b.b - a.b)
    const S10 = settings(10)
    const sales = top.slice(0, 40).map((v, i) => sold(v.name, (i % 10) + 1, Math.round(v.b)))
    const s = build(S10, values, [...sales, nominated(top[40].name, 2, 1)])
    let t = performance.now()
    verdict(s)
    expect(performance.now() - t).toBeLessThan(50)
    t = performance.now()
    for (let price = 2; price < 22; price++) verdict({ ...s, live: { ...s.live!, price } })
    expect((performance.now() - t) / 20).toBeLessThan(5)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/engine/verdict.test.ts test/sim/policies.test.ts test/engine/fit.test.ts`
Expected: FAIL — `v.fit` is undefined; `withFit` equals `without`.

- [ ] **Step 3: Implement**

`src/engine/verdict.ts`: import `{ fitFor, type Fit } from './fit'`; add to `Verdict` after `saveSlot`:

```ts
  /** how my roster changes the player's value; null when fit doesn't apply */
  fit: Fit | null
```

In `verdict()` replace the `const a = …` line with:

```ts
  const fit = fitFor(s, live.playerKey)
  const a = adjustedValue(s, live.playerKey, inflation(s), temperature(s).label) * (fit?.mult ?? 1)
```

and add `fit,` to `base` after `saveSlot: null,`. `ceilingFor`'s default stays `adjustedValue` (nomination keeps today's behavior).

`src/sim/policies.ts`: import `myValue` from `'../engine/fit'`, drop `adjustedValue` from the metrics import, and in `autopilotCap` use:

```ts
  const a = myValue(s, key, inflation(s), temperature(s).label)
```

`test/ui/format.test.ts`: add `fit: null` to `base`.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (Josh replay included: its values have `line: null`, so fit is null there), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/verdict.ts src/sim/policies.ts test/engine/verdict.test.ts test/sim/policies.test.ts test/engine/fit.test.ts test/ui/format.test.ts
git commit -m "feat(helper): the call and autopilot use the player's value for my roster

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fit line on the panel

**Files:**
- Modify: `src/ui/format.ts`, `src/ui/Panel.ts:105`
- Test: `test/ui/format.test.ts`, `test/ui/panel.test.ts`

**Interfaces:**
- Consumes: `Verdict.fit` (Task 4), `CATEGORY_LABELS` (Task 1).
- Produces: `fitText(f: Fit): string`; `FIT_NOTE_MIN = 0.02` in `src/ui/format.ts`.

- [ ] **Step 1: Write the failing tests**

`test/ui/format.test.ts` (import `fitText`):

```ts
describe('fitText', () => {
  it('names the categories behind the fit', () => {
    expect(fitText({ mult: 1.15, cats: ['ast', 'tpm'] })).toBe('fits your team ×1.15: AST, 3PM')
    expect(fitText({ mult: 0.85, cats: ['blk', 'ftPct'] })).toBe('fits your team ×0.85: less useful in BLK, FT%')
    expect(fitText({ mult: 1.05, cats: [] })).toBe('fits your team ×1.05')
  })
})
```

`test/ui/panel.test.ts` (imports: `FIT_S, FIT_V` from `../engine/fitFixture`):

```ts
  it('shows how the player fits my roster when it moves his value', () => {
    const walls = [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20)]
    expect(show(build(FIT_S, FIT_V, [...walls, nominated('Blocker', 2, 1)])).el.textContent).toMatch(/fits your team ×0\.\d\d: less useful in BLK/)
    expect(show(build(FIT_S, FIT_V, [nominated('Blocker', 2, 1)])).el.textContent).not.toContain('fits your team')
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/ui`
Expected: FAIL — `fitText` is not exported; no "fits your team" text.

- [ ] **Step 3: Implement**

`src/ui/format.ts`:

```ts
import { CATEGORY_LABELS } from '../engine/h2h'
import type { Fit } from '../engine/fit'

/** The panel names the fit only when it moves the value this much. */
export const FIT_NOTE_MIN = 0.02

export function fitText(f: Fit): string {
  const names = f.cats.map((c) => CATEGORY_LABELS[c]).join(', ')
  const head = `fits your team ×${f.mult.toFixed(2)}`
  if (!names) return head
  return f.mult > 1 ? `${head}: ${names}` : `${head}: less useful in ${names}`
}
```

`src/ui/Panel.ts`: import `fitText, FIT_NOTE_MIN` from `./format`; after the save-the-slot note line add:

```ts
                ${v.fit && Math.abs(v.fit.mult - 1) >= FIT_NOTE_MIN && html`<div class="note">${fitText(v.fit)}</div>`}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/ui && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/format.ts src/ui/Panel.ts test/ui/format.test.ts test/ui/panel.test.ts
git commit -m "feat(helper): show how the player on the block fits my roster

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Simulator scores on projections plus error

**Files:**
- Modify: `src/sim/score.ts`, `src/sim/run.ts:41`, `src/sim/session.ts:285`, `src/sim/ui/Room.ts:114-117`
- Test: `test/sim/score.test.ts`, `test/sim/run.test.ts`, `test/sim/session.test.ts:98-110`

**Interfaces:**
- Consumes: `ProjectionSource`, `SeasonLine` (Task 1); `mulberry32`, `normal` from `./rng`.
- Produces: `PROJECTION_ERROR` and `truthFrom(proj: ProjectionSource, seed: number): ProjectionSource` from `src/sim/score.ts`.

- [ ] **Step 1: Write the failing tests**

`test/sim/score.test.ts` (import `PROJECTION_ERROR, truthFrom`):

```ts
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
```

`test/sim/run.test.ts` (import `scoreTeams, truthFrom` from `../../src/sim/score`):

```ts
  it('scores seasons on projections plus error drawn from the draft seed', () => {
    const r = runDraft({ seed: 4, policy: 'market', values: VALUES, projections: FAKE })
    // Same team order as runDraft (sim.teams, ids 1-10), rosters in purchase order.
    const rosters = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, r.sales.filter((x) => x.teamId === i + 1).map((x) => x.espnId)] as const))
    expect(r.standings).toEqual(scoreTeams(rosters, truthFrom(FAKE, 4), 4))
  })
```

`test/sim/session.test.ts`, the standings test: equal projections no longer mean equal teams. Replace

```ts
    expect(st.every((t) => t.rank === 1 && t.missingProjections === 0)).toBe(true)
```

with

```ts
    expect(st.every((t) => t.missingProjections === 0)).toBe(true)
    expect(new Set(st.map((t) => t.winPct)).size).toBeGreaterThan(1)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/sim/score.test.ts test/sim/run.test.ts test/sim/session.test.ts`
Expected: FAIL — `truthFrom` not exported; session's teams all tied.

- [ ] **Step 3: Implement** — `src/sim/score.ts` (import `normal` from `./rng` beside `mulberry32`; add `SeasonLine` to the `../engine/h2h` type import):

```ts
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
      const pts = vary(p.pts), reb = vary(p.reb), ast = vary(p.ast), stl = vary(p.stl), blk = vary(p.blk), tpm = vary(p.tpm), to = vary(p.to)
      const fga = vary(p.fga)
      const fta = vary(p.fta)
      out = { pts, reb, ast, stl, blk, tpm, to, fga, fgm: made(p.fgm, p.fga, E.fgPct, fga), fta, ftm: made(p.ftm, p.fta, E.ftPct, fta) }
    }
    drawn.set(id, out)
    return out
  }
}
```

`src/sim/run.ts`: import `truthFrom`; standings line becomes

```ts
  const standings = input.projections ? scoreTeams(new Map(sim.teams.map((t) => [t.id, t.roster])), truthFrom(input.projections, input.seed), input.seed) : null
```

`src/sim/session.ts`: import `truthFrom`; after `const options = …` (line 111) add

```ts
  /** seasons are scored on the projections plus error drawn from this draft's seed */
  const truth = data.projections ? truthFrom(data.projections, options.seed) : null
```

and in `standings()` use `if (!truth) return null` and `scoreTeams(rosters, truth, options.seed)`.

`src/sim/ui/Room.ts`: import `PROJECTION_ERROR` from `'../score'`; the note gets a second sentence:

```ts
            Seasons use the projections plus random error drawn from the seed: games ±${PROJECTION_ERROR.games * 100}%, each stat ±${PROJECTION_ERROR.stat * 100}%,
            FG% ±${PROJECTION_ERROR.fgPct * 100} and FT% ±${PROJECTION_ERROR.ftPct * 100} points.
```

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, tsc clean. If `test/sim/ui.test.ts` asserts exact standings cells (e.g. "50%"), update those cells to read the values from `session.standings()` instead of constants.

- [ ] **Step 5: Commit**

```bash
git add src/sim/score.ts src/sim/run.ts src/sim/session.ts src/sim/ui/Room.ts test/sim/score.test.ts test/sim/run.test.ts test/sim/session.test.ts test/sim/ui.test.ts
git commit -m "feat(sim): score seasons on projections plus error, so bidders can't know the outcome

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Measure, decide, document, build

**Files:**
- Create (scratch, not committed): `/private/tmp/claude-501/-Users-adarsh-myProjects-draftmachine/14a98204-d29b-4aff-ae3d-998328aa51b4/scratchpad/eval-fit.ts`
- Modify: `src/engine/constants.ts` (only if the ship rule fails or a range wins), `README.md`, `docs/superpowers/specs/2026-10-15-category-fit-design.md` (status + results)
- Rebuild: `dist/`

- [ ] **Step 1: Write the paired evaluation script** — `/private/tmp/claude-501/-Users-adarsh-myProjects-draftmachine/14a98204-d29b-4aff-ae3d-998328aa51b4/scratchpad/eval-fit.ts`, run from `espn-auction-helper/` with `npx tsx`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resetTunables, setTunables, type Tunables } from '/Users/adarsh/myProjects/draftmachine/espn-auction-helper/src/engine/constants'
import { runDraft } from '/Users/adarsh/myProjects/draftmachine/espn-auction-helper/src/sim/run'
import { PLAYTIME_PATH, projectionsFromCsv, STATS_PATH } from '/Users/adarsh/myProjects/draftmachine/espn-auction-helper/src/values/seasonStats'
import type { PlayerValue } from '/Users/adarsh/myProjects/draftmachine/espn-auction-helper/src/values/types'

const N = Number(process.argv[2] ?? 300)
const variants: Array<[string, Partial<Tunables>]> = JSON.parse(process.argv[3] ?? '[["on",{}]]')
const values = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : null)
const projections = projectionsFromCsv(read(STATS_PATH), read(PLAYTIME_PATH), values)!
const run = (set: Partial<Tunables>) => {
  resetTunables()
  setTunables(set)
  const out = Array.from({ length: N }, (_, i) => runDraft({ seed: 1 + i, policy: 'autopilot', values, projections }).mine!)
  resetTunables()
  return out
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const ci = (xs: number[]) => { const m = mean(xs); return 1.96 * Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) / xs.length) }
const off = run({ FIT_WEIGHT: 0 })
const pct = (x: number) => (x * 100).toFixed(1)
console.log(`off: title ${pct(mean(off.map((t) => t.titlePct)))}%  playoffs ${pct(mean(off.map((t) => t.playoffPct)))}%  seed ${mean(off.map((t) => t.avgSeed)).toFixed(2)}  cats ${pct(mean(off.map((t) => t.winPct)))}%`)
for (const [label, set] of variants) {
  const on = run(set)
  const d = on.map((t, i) => t.titlePct - off[i].titlePct)
  console.log(`${label}: title ${pct(mean(on.map((t) => t.titlePct)))}%  playoffs ${pct(mean(on.map((t) => t.playoffPct)))}%  seed ${mean(on.map((t) => t.avgSeed)).toFixed(2)}  cats ${pct(mean(on.map((t) => t.winPct)))}%  paired title diff ${pct(mean(d))} ±${pct(ci(d))}`)
}
```

- [ ] **Step 2: Baseline and fit, 300 paired seeds**

Run: `npx tsx /private/tmp/claude-501/-Users-adarsh-myProjects-draftmachine/14a98204-d29b-4aff-ae3d-998328aa51b4/scratchpad/eval-fit.ts 300 > /private/tmp/claude-501/-Users-adarsh-myProjects-draftmachine/14a98204-d29b-4aff-ae3d-998328aa51b4/scratchpad/fit-300.txt 2>&1` (background; read the file when done).
Expected: two lines, `off:` and `on:` with a paired title difference and its ±95% half-width. Also run `npm run sim:batch -- --drafts 300 --policies market` once for the market baseline under truth (sanity: near 10% title).

- [ ] **Step 3: Ranges, only if Step 2's difference is above 0**

Run: `npx tsx /private/tmp/claude-501/-Users-adarsh-myProjects-draftmachine/14a98204-d29b-4aff-ae3d-998328aa51b4/scratchpad/eval-fit.ts 300 '[["0.85-1.15",{"FIT_MIN":0.85,"FIT_MAX":1.15}],["0.6-1.4",{"FIT_MIN":0.6,"FIT_MAX":1.4}]]' > /private/tmp/claude-501/-Users-adarsh-myProjects-draftmachine/14a98204-d29b-4aff-ae3d-998328aa51b4/scratchpad/fit-ranges.txt 2>&1`
Expected: two variant lines. Keep the range with the highest paired title difference whose interval is above 0; set `FIT_MIN` / `FIT_MAX` in `src/engine/constants.ts` if it isn't the default.

- [ ] **Step 4: Apply the ship rule**

If no variant's paired title difference has its interval above 0: set `FIT_WEIGHT: 0` in `src/engine/constants.ts`, and in the fit tests that need fit on, call `setTunables({ FIT_WEIGHT: 1 })` in a `beforeEach` (they already `resetTunables()` after each). Run `npx vitest run`.

- [ ] **Step 5: Document**

README.md:
- New bullet under the feature list after "Save the slot": `- **Category fit**: values move with what a player adds to your roster in H2H 9-cat. A player who helps where your weekly odds are close is worth more; one whose stats you already win (or have punted) is worth less, from ×0.75 to ×1.25. The call card says why: "fits your team ×1.15: AST, 3PM".` (use the shipped range; if fit ships off, say it is off by default and how to turn it on: `FIT_WEIGHT=1`).
- In `--set` docs: add `FIT_WEIGHT`, `FIT_MIN`, `FIT_MAX` to the tunables autopilot's bid limit depends on.
- In "Projections": a sentence that seasons are scored on the projections plus error (games ±15%, each stat ±10%, FG% ±1.5 and FT% ±3 points), drawn per seed, so a bidder that reads the projections can't know the outcome; and that `npm run values` puts each player's season line into `values.json` for the fit.

Spec: set `Status: Implemented 2026-10-15` and append a `## 10. Results` section with the lines from `fit-300.txt` (and `fit-ranges.txt` if run) and the decision.

- [ ] **Step 6: Build and verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, tsc clean, build writes `dist/`.

- [ ] **Step 7: Commit**

```bash
git add README.md ../docs/superpowers/specs/2026-10-15-category-fit-design.md src/engine/constants.ts test/engine/fit.test.ts test/engine/verdict.test.ts test/sim/policies.test.ts test/ui/panel.test.ts
git commit -m "docs: category fit results and usage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Only stage the test files if Step 4 changed them; `git status` first.)
