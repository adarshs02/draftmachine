# Draft Simulator — Design Spec

Date: 2026-10-11
Status: Approved; §4–5 updated 2026-10-11 for the Hashtag projections
Builds on: `docs/superpowers/specs/2026-10-05-espn-auction-helper-design.md` (the ESPN auction helper, merged to `main`).

## 1. Goal

Let the user iterate on the helper's recommendation algorithm and panel UX in minutes, without an ESPN draft room:
- **Interactive simulator** — a local web page that runs a full 10-team salary-cap auction against bot teams and drives the **real panel** through the same message path ESPN uses.
- **Headless batch** — runs many simulated drafts with the user's team on autopilot (following the panel) and scores the outcome, so tuning changes get a number.

### What the user stated
- Simulate the draft lobby locally instead of using ESPN each time (too slow).
- Quickly run drafts, tweak the recommendation algorithm and the UX.
- Wants both the interactive room and headless scoring.
- Approved: approach A (one simulation core, two front ends), bots/rooms (§4), scoring/autopilot/tuning (§5–6), page/files/testing (§7–9).

### Assumptions
- Runs locally only (`npm run sim`, `npm run sim:batch`); no hosting, no ESPN network calls at sim time.
- Default league = the user's: 10 teams, $200, 13 roster spots (ESPN default lineup), user's real draft order shape (`pickOrder` length 10, user nominates 5th).
- The simulator lives inside `espn-auction-helper/` and reuses its engine, values, panel and controller unchanged except for the tunables refactor (§6).

### Success criteria
1. `npm run sim` opens a page where a full draft completes; the real panel shows **● live** and its calls update on every bid; at 20× speed a draft takes under ~5 minutes; "instant" finishes immediately.
2. Round-trip proof: simulator frames decoded by the real decoder/assembler/reducer reproduce the simulator's own sale ledger exactly (team, player, price) for any seed.
3. `npm run sim:batch -- --drafts 200` completes in ≤ ~4 minutes and prints per-policy results; same seed ⇒ identical output.
4. Changing a tunable (CLI `--set` or page slider) changes advice without a rebuild; defaults leave the existing suite (incl. the Josh replay) green.

### Out of scope
Snake drafts; keepers; persisting simulated drafts; simulating ESPN UI pixel-for-pixel; network/ESPN at sim time; machine-learning bots.

## 2. Architecture

One pure simulation core, two front ends. Everything deterministic given a seed.

```
src/sim/rng.ts       seeded PRNG (mulberry32) + helpers (uniform, normal, pick)
src/sim/bots.ts      bot personalities, private values, raise/stop decision, budget rules
src/sim/auction.ts   event-driven auction state machine → ESPN-format frames + own ledger
src/sim/policies.ts  my-team policies: autopilot (panel advice), market, espn-value; interactive = user
src/sim/score.ts     projections → weekly team lines → H2H each-category season sim → record, playoff and title odds
src/sim/page.ts      interactive page (Preact + htm), mounts the real Panel via the real controller
sim/index.html       page shell
sim.mjs              esbuild serve + watch + live reload (`npm run sim`)
scripts/sim-batch.ts headless runner (`npm run sim:batch`)
```
Data flow (interactive): auction core → frames (`NOMINATION`/`BID`/`SOLD`/`CLOCK`/`STATE`) → `controller.onFrame` (real) → decoder → assembler → reducer → `advise()` → Panel. Policies read advice from the same state.

Data flow (batch): auction core → events → `reduce` (no DOM, no controller) → policy decisions via `verdict()`/`suggestNomination()` → final rosters → `score.ts`.

## 3. ESPN-format frames (match the real recording)

- Start: `STATE 1`. End: `STATE 2`.
- Turn: `NOMINATION <team> 25000`.
- Bids: `BID <team> <playerId> <amount> 25000 <remainingMs>` — the first BID on a player is the nomination (opening bid, usually $1).
- Sale: `SOLD <team> <playerId> 0 <price> 0`.
- Clock: `CLOCK 6 <remainingMs> <team>` every 2 s of sim time (keeps panel health live).
- Clock model (from the recording): an auction starts with 25 s remaining; after a bid, remaining = max(remaining, 10 s); when it reaches 0 the leader wins.

## 4. Bots and rooms

- **Market price** per player: ESPN `market` (average paid) if > 0, else `max(1, consensus)` (projected value).
- **Private value** per bot per player (drawn once per draft): `market × 0.85 × lognormal(σ = 0.15, mean 1) × room × personality`. The 0.85 centres values so the room's second-highest value (the price) lands near ESPN's average price, which is itself a realized price. *(Updated 2026-10-11 after the final review: uncentred values sold stars at ~110% of market and gave mid-tier players away.)*
- **Bot inflation** (applied when a player opens): the room's inflation = (money above $1 per open slot) ÷ (market above $1 of the top available players, one per open slot), clamped 0.5–2; times the bot's spare money per open slot ÷ the room's, clamped 0.5–2.5 overall. Rich bots pay up for what's left, bots that spent early drop out, and the room spends its money.
- **Calibration** (tested): with a bidder paying ESPN market in the room, average price ÷ market stays within 0.85–1.15 for market ranks 1–10, 11–30, 31–60 and 61–100, and bots leave under $8 each.
- **Room temperature** knob (`--room cold|neutral|hot` or a number): cold ×0.92, neutral ×1.0, hot ×1.10.
- **Personalities** (default mix for 9 bots: 3 stars-and-scrubs, 4 balanced, 2 value hunters; configurable):
  - stars-and-scrubs: ×1.15 on market top-15, ×0.85 otherwise;
  - balanced: ×1.0;
  - value hunter: ×0.90.
- **Budget rules (ESPN)**: a team may bid at most `budgetLeft − (open − 1)`; teams with full rosters never bid and are skipped for nominations. Bots also cap at `budgetLeft − (open − 1)` and pace: they won't bid more than `budgetLeft × 0.6` while ≥ 4 slots remain open (prevents absurd early all-ins; configurable).
- **Nominations**: nominating team (pickOrder rotation, skipping full rosters) — bots nominate the highest-market available player 80% of the time, otherwise a random pick among the 10 most-bought cheap players (ESPN market > 0 and < $5: one the nominator is happy to keep at $1); opening bid $1.
- **Bidding**: after any price change, every eligible non-leading bot whose value > price draws a reaction delay U(0.3 s, 3.0 s); the earliest acts: raises by $1, or a jump of $2–$5 when price < 60% of its value (probability 0.3). Ties broken by the seeded RNG.

## 5. My team (policies) and scoring

### Policies
- **interactive**: the user via page buttons (+$1, +$5, custom, Pass; Nominate with player search).
- **autopilot** (follows the helper): on my turn nominate `suggestNomination(state)` at $1; when another team leads: BID → raise $1 if ≤ `ceiling`; BID_UP → raise $1 if ≤ `pushTo`; LEADING → hold; PASS/LET_THEM → drop. Reaction delay 1.0 s.
- **market** baseline: raise while price < my private value = market price (no noise).
- **consensus** baseline: raise while price < projected value (`PlayerValue.consensus`, from `data/auction-values.csv` once the projections work lands).
Baselines and autopilot see the same seeds/bots (paired comparison).

### Scoring (projected H2H each category, 9 cats)
- Projections come from the user's Hashtag Basketball export, committed as `data/hashtag-projections.csv`. It has per-game PTS, TREB, AST, STL, BLK, 3PM and TO, FG and FT made/attempted, plus GP and MPG for 200 players. The user changed this on 2026-10-11 because ESPN projections and ranks are distrusted.
  - Season totals = per-game × GP. When `data/auction-values.csv` (the projections sheet's export) lists the player, its GP and MPG override the export's, and per-game stats scale by the ratio of edited to original MPG.
  - Players join to ESPN ids by normalized name. Players without a projection contribute 0 and are counted.
- The user's league is H2H each category (ESPN `H2H_CATEGORY`): 19 one-week matchups, top 4 to the playoffs (2-week rounds). Changed from roto on 2026-10-12 at the user's request ("i only care about h2h 9 cat"). Ranking season totals against every team would order teams exactly like roto, so the score models weekly swings.
- Weekly team line = sum over all 13 rostered players of season total / 23.4 (NBA weeks). Variance per counting stat = Σ (dispersion × weekly mean + 0.037 × weekly mean²): game-to-game swings (dispersion PTS 2.5, REB 1.2, AST 1.1, STL 1.0, BLK 1.2, 3PM 1.1, TO 1.0) plus 2–4 games a week. FG%/FT% = Σmakes/Σattempts with binomial shot luck (× 1.2) and shooter-mix variance. These are assumptions, not fitted. TO lower is better.
- Weekly category win chance = normal approximation of the gap; 2-week playoff rounds use √2 × the gap over the sd.
- Each draft: 400 seasons (seeded by the draft seed). Random double round robin; every category of every matchup drawn; top 4 by categories won (random tiebreak); semis 1 v 4, 2 v 3, final; more categories wins, ties to the higher seed.
- Reported per draft: my win % (expected weekly categories won), playoff %, title %, average seed, per-category weekly win chance vs an average opponent, $ left unspent, value captured = Σ(projected value − price) over my roster. Batch averages title % (with 95% interval), playoff %, seed and win %.

## 6. Tuning

- `src/engine/constants.ts` becomes a single mutable `TUNABLES` object (same names and default values) plus `setTunables(partial)` / `resetTunables()`; engine modules read `TUNABLES.X` at call time. Default behavior is unchanged (existing suite must stay green).
- Batch: `--set NAME=value` (repeatable), `--compare` (runs defaults vs overrides on the same seeds), `--json` (machine-readable).
- Page: "Tunables" drawer with a slider/number per tunable (live re-render) and "Copy as flags" (`--set …` string).

## 7. Interactive page

- **Top strip**: teams in draft order — `#id name`, $ left, open slots, on-the-clock marker.
- **Block**: player (name, positions, ESPN value, market), current bid + leader, countdown (sim seconds), my buttons (+$1, +$5, amount box, Pass); on my nomination turn: player search + Nominate.
- **Feed**: recent sales; at draft end: projected standings table (all teams, category points) and my roster.
- **Right side**: the real Panel, created via the real `createController` with in-memory stores, a sim `loadLeague` (sim teams + pickOrder), `values.json`, and my team preset; frames go to `controller.onFrame`. Manual entry still works.
- **Controls bar**: speed (1×, 5×, 20×, instant), pause/play, step (to next sale), seed, room, bot mix, autopilot toggle, mode (simulate / replay recorded ESPN draft from `test/fixtures/espn-auction-recording.json` / replay Josh mock as synthesized frames), restart, tunables drawer.
- Dev server: esbuild `serve` + watch with live reload; saving any source file reloads the page.

## 8. Performance

- Headless target ≥ 1 draft/s (200 drafts ≤ ~4 min) on the user's machine. Autopilot uses `verdict()`/`suggestNomination()` only (not full `advise()`); cache per-state derived data (e.g. sorted available players) if profiling shows need.
- Interactive at 20×: frame cadence stays smooth (advise ≈ 3 ms).

## 9. Testing

- **Round trip**: for several seeds, sim frames → real decoder/assembler/reducer → sales equal the sim ledger exactly.
- **Bots**: never exceed `budgetLeft − (open − 1)`; never bid with a full roster; full-roster teams skipped for nomination; every team ends with 13 players and ≥ $0.
- **Determinism**: same seed ⇒ identical frames and identical batch output.
- **Clock**: 25 s start, ≥ 10 s after each bid, winner = leader at expiry.
- **Score**: hand-computed 3-team example (counting, percentage, TO reversed, ties).
- **Policies**: autopilot obeys BID/BID_UP/LEADING/PASS/LET_THEM; baselines stop at their caps.
- **Tunables**: `setTunables` changes a verdict; `resetTunables` restores; full existing suite + Josh replay green with defaults.
- **Batch smoke**: 5 drafts, fixed seed, snapshot of the summary numbers.
- **Page**: jsdom smoke — page mounts, a step completes an auction, Panel shows a verdict.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Bots unrealistic → tuning overfits to bots | personalities + noise + room knob; compare policies on several rooms; keep Josh replay as the real-world gate |
| Projections missing for some players | contribute 0; report count of rostered players without projections |
| Tunables refactor changes behavior | defaults identical; full suite + replay must pass before anything else |
| Batch too slow | verdict-only autopilot, caching, `--drafts` default 100 |
| Machine load (seen during the helper build) | event-driven sim (no real waits); bounded test runs |
