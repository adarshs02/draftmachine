# Category Fit — Design Spec

Date: 2026-10-15
Status: Design approved in chat 2026-10-15; written spec awaiting review
Builds on: `2026-10-05-espn-auction-helper-design.md` (the helper) and `2026-10-11-draft-simulator-design.md` (the simulator, scored as H2H each category since 2026-10-12).

## 1. Goal

Make each player's value, and so the panel's max and autopilot's bids, depend on what he does for **my** roster in the league's format: H2H each category, 9 categories (PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TO), 10 teams.

### What the user stated
- Prices should move with the room and with the stats left, not only with money (2026-10-15).
- Chose "category-aware" over "general rules only" and "leave as is", knowing it reverses the earlier rule that autopilot never sees per-category projections.
- Approved the five-part design in chat: shared weekly model, per-player stats in `values.json`, fit multiplier, panel line, honest simulator.

### Why the simulator must change first
The simulator scores teams with the same projections the engine would now read. An engine that knows the scorer's exact numbers can look better in the batch than it would in a real season. So the batch scores teams on **true** stats: the projections plus realistic error, drawn per draft. Every bidder (autopilot, bots, baselines) sees only the projections.

### Success criteria
1. With projections loaded, the panel shows the fit multiplier and the categories behind it whenever fit moves a player's value by 2% or more, and the shown value, max, BID / BID UP calls and save-the-slot rule all use it.
2. `FIT_WEIGHT=0` reproduces today's calls exactly (the whole existing suite, the Josh replay included, stays green with fit off, and with fit on where no player has stats).
3. Batch: 300 drafts, same seeds, fit on vs off, scored on true stats. Fit ships on by default only if the paired difference in my title % has a 95% interval above 0. Otherwise the code stays with `FIT_WEIGHT` defaulting to 0 and the result is reported.
4. A verdict with fit stays fast enough for live bids: under 5 ms on a full 10-team state.

### Out of scope
Nomination suggestions, bots, `infl`, the temperature label, the sale-row bargain stars (`saleFlags`), weekly schedules (games per week by NBA team), punting as an explicit mode.

## 2. Shared weekly model

Move from `src/sim/score.ts` to a new `src/engine/h2h.ts`, unchanged in behavior: `SeasonLine`, `LINE_FIELDS`, `CATEGORIES`, `CATEGORY_LABELS`, `Category`, `NBA_WEEKS`, `GAME_DISPERSION`, `GAMES_CV2`, the weekly mean/variance model and `categoryWinChance`. Add `weeklyFromLines(lines: SeasonLine[]): WeeklyLine`; `weeklyLine(espnIds, proj)` becomes a wrapper around it. `src/sim/score.ts` re-exports what it moved, so its importers don't change. The engine never imports `src/sim`.

## 3. Data

`PlayerValue` gains `line: SeasonLine | null`: projected season totals, the same numbers the simulator uses (per-game stats from `data/hashtag-projections.csv` × games, games and minutes from `data/auction-values.csv` winning, as in `seasonProjections`). Rounded to 0.1. `null` when the player has no stats row.

- `npm run values` (and so `npm run sync-sheet`) writes `line` into `data/values.json`. A missing stats file gives `line: null` everywhere and a printed note; the build doesn't fail.
- The stand-in for unknown players (reducer) and test helpers get `line: null`.
- The CSV → line code moves out of `src/sim/seasonStats.ts` into `src/values/` so the build script and the simulator share it.

## 4. Fit

New `src/engine/fit.ts`.

**Filler.** The average `line` of the best remaining players: available players by value, the top N where N = open slots across all teams, counting only players with a line. It stands in for every open slot and for every rostered player without a line. No filler (no available player has a line) ⇒ fit 1.

**Team week.** `weeklyFromLines` over a team's rostered lines plus one filler per open slot.

**Expected categories won.** For a team week `T`: the average over the rival teams `R` of Σ over the 9 categories of `categoryWinChance(T, R, c)`. Rivals are the other teams as they stand, each filled the same way.

**Gains** for the player on the block, `p` (with a line):
- `mine` = expected categories won by my team with one filler replaced by `p`, minus my team as it stands.
- `generic` = the same for a team made only of fillers (roster size), against the same rivals. This is what a value that ignores my roster assumes.
- Per-category parts of both are kept for the panel.

**Typical ratio.** The same gains for every player in the filler pool: `typical = Σ mine ÷ Σ generic` over the pool. Computed once per sale (cached on the sales list), so a bid only costs the gains for the player on the block.

**Multiplier.**
- `raw = (mine / generic) / typical`, clamped to `[FIT_MIN, FIT_MAX]`. `mine ≤ 0` ⇒ `FIT_MIN`.
- Why `typical`: the all-filler team sits at 50% in every category, where any stat helps most, so `mine / generic` is below 1 for nearly every player once my roster has a shape. Unnormalized, fit would cut every value and leave money unspent. Dividing by `typical` makes fit move value between players (the remaining pool averages ×1) and leaves overall spending to `infl`. (Ruling while planning, 2026-10-15.)
- `fit = raw ^ FIT_WEIGHT`.
- `fit = 1` (no fit) when: `FIT_WEIGHT` is 0, no projections (filler missing), `p` has no line, base value `b < NEED_MIN_VALUE` ($5), `generic` or the pool's totals ≤ 0.001, my team unknown or full, no rivals.

**Where it applies.** New `myValue(s, key) = adjustedValue(s, key) × fit`. `verdict` (value shown, ceiling, BID / BID UP, save the slot) and `autopilotCap` use `myValue`. `adjustedValue` itself is unchanged, so `saleFlags` and nomination keep today's behavior. The hot-room star rule happens inside `adjustedValue`, before fit.

**Tunables** (in `DEFAULT_TUNABLES`, settable by `--set` and the simulator drawer): `FIT_WEIGHT: 1`, `FIT_MIN: 0.75`, `FIT_MAX: 1.25`.

**Verdict.** Gains `fit: { mult: number; cats: Category[] } | null` (null when fit is 1 for one of the reasons above). `cats` = up to 2 categories with the largest `mine / typical − generic` part when `mult > 1`, the 2 most negative when `mult < 1`, only parts beyond 0.005.

## 5. Panel

In the call card, under the stats, when `v.fit` is set and `mult` is at least 0.02 away from 1:
- `fits your team ×1.15: AST, 3PM` (mult > 1)
- `fits your team ×0.85: less useful in BLK, FT%` (mult < 1)

The value stat and the price bar already show `v.adjusted`, which becomes `myValue`.

## 6. Honest simulator

New `truthFrom(proj: ProjectionSource, seed: number): ProjectionSource` in `src/sim/score.ts`. For each player, drawn from an RNG seeded by `(seed, espnId)` so the draw doesn't depend on call order:
- Games: `g = clamp(1 + 0.15·z, 0.3, 1.3)`, scaling every counting stat and both attempt totals.
- Each counting stat (PTS, REB, AST, STL, BLK, 3PM, TO) and each attempt total: × `exp(0.10·z − 0.005)`.
- FG%: `p + 0.015·z`, FT%: `p + 0.03·z`, clamped to [0, 1]; makes = new % × new attempts.

These sizes are assumptions, constants in `score.ts`. `runDraft` (batch) and the page's session score on `truthFrom(projections, seed)`. The same seed gives the same truth for every policy, so comparisons stay paired. The page's standings note says the season uses projections plus error.

## 7. Evaluation

1. Re-baseline today's algorithm (`FIT_WEIGHT=0`) under truth: 300 drafts, autopilot and market.
2. `--compare --set FIT_WEIGHT=0` over the same 300 seeds (defaults = fit on).
3. Paired difference of my title % per seed with its 95% interval; also playoffs %, avg seed, weekly cats %.
4. If it helps, try `FIT_MIN/FIT_MAX` at 0.85/1.15 and 0.6/1.4 on the same seeds and keep the best.
5. Ship rule: §1 criterion 3.

## 8. Testing

- `h2h.ts`: moved tests stay green; `weeklyFromLines` equals `weeklyLine` on the same players.
- `fit.ts`: empty roster ⇒ fit ≈ 1; a roster strong in BLK rates a blocker below 1 and an assist player above 1; a roster far behind in FT% rates a good FT shooter below 1; no line / under $5 / no projections ⇒ null; clamps hold; `FIT_WEIGHT=0` ⇒ 1.
- `verdict` / `autopilotCap`: use `myValue`; with `FIT_WEIGHT=0` identical to today.
- Values build: lines present, rounded, null without a stats row; missing stats file doesn't fail.
- `truthFrom`: deterministic per (seed, id); independent of call order; error sizes within tolerance over many players; percentages in [0, 1].
- Panel: fit line text both directions, hidden near 1 and when null.
- Timing: verdict on a full 10-team state under 5 ms.

## 9. Files

| File | Change |
|---|---|
| `src/engine/h2h.ts` | new: weekly model moved from `sim/score.ts`, `weeklyFromLines` |
| `src/engine/fit.ts` | new: filler, gains, multiplier, `myValue` |
| `src/engine/constants.ts` | `FIT_WEIGHT`, `FIT_MIN`, `FIT_MAX` |
| `src/engine/verdict.ts` | `myValue`, `fit` on `Verdict` |
| `src/engine/reducer.ts` | stand-in gets `line: null` |
| `src/values/types.ts`, `src/values/*` | `line` field; stats parsing moved from `sim/seasonStats.ts` |
| `scripts/build-values.ts` | writes lines |
| `src/sim/score.ts` | re-exports, `truthFrom` |
| `src/sim/run.ts`, `src/sim/session.ts`, `src/sim/ui/Room.ts` | score on truth; standings note |
| `src/sim/policies.ts` | `autopilotCap` uses `myValue` |
| `src/ui/Panel.ts`, `src/ui/styles.ts` | fit line |
| `README.md` | fit, tunables, simulator truth |
