# ESPN Auction Helper — Design Spec

Date: 2026-10-05
Status: Draft for review

## 1. Goal

A Chrome extension that sits inside the ESPN fantasy basketball **salary-cap (auction)** draft room and gives live, Josh Lloyd–style advice on every nomination and bid, in real time.

Source of the method: Josh Lloyd, *Locked On Fantasy Basketball*, "Fantasy Basketball Auction Mock Draft/Salary Cap Mock Draft" (YouTube `Q6YlQDvD-aY`, uploaded 2026-10-05) — a 12-team, 9-cat, $200, 13-roster-spot auction mock where he narrates his valuations and decisions live.

### What the user stated
- Replicate what Josh Lloyd does in that video, but live against the user's own ESPN draft.
- ESPN only. Draft type: **auction / salary cap**.
- League is **10 teams** (not 12 like the video).
- Decode the per-player values Josh mentions.
- Base values: **blend** of Josh's numbers and consensus values.
- Architecture: **all-in-one Chrome extension**.
- Existing `draft-tracker/` app is being retired ("fresh start"); the new helper is built clean.

### Assumptions (not stated, correct if wrong)
- Season 2026-27; the draft is imminent.
- Single user (the league manager running the extension); no hosting, no accounts.
- Roster size, budget, categories and position slots are read from the league's ESPN settings; 13 spots / $200 / 9-cat are only defaults for tests.
- `draft-tracker/` is left in place untouched; nothing is deleted by this work.

### Success criteria
1. During a live ESPN auction, within ~1s of each nomination/bid, the panel shows the current price vs. the user's ceiling and a BID / BID UP / LET THEM / PASS call.
2. Budgets, open slots and max bids for all teams always match ESPN's own display (reconciled at least every ~10s).
3. The Josh replay test (§7.2) passes: the engine reaches Josh's conclusions at the key moments of his mock.
4. Survives a page refresh mid-draft without losing state.

### Out of scope (v1)
- Snake drafts.
- Projected category standings (needs per-category projections the repo doesn't have).
- Any LLM/Claude calls during the draft (latency vs. ~30s bid clock).
- Other platforms (Yahoo, Sleeper, Fantrax).
- Auto-bidding. The extension advises; the user clicks.

## 2. Josh Lloyd's method (decoded)

Rules extracted from the video, each mapped to an engine feature in §5:

| # | Josh behavior | Engine feature |
|---|---|---|
| 1 | Pre-draft value per player; deliberately suppresses top-end prices (Luka max $64, SGA $60, Wemby $70, Jokic $73-74). | Base values with tier-ratio suppression (§4) |
| 2 | Reads room temperature from early sales vs. his values ("hot room", "cold room"); in a hot room he stops chasing stars and goes balanced mid-tier. | Room temperature T (§5.2) |
| 3 | Patience: once spenders run dry, late prices fall far under value (NAW $14 vs. mid-20s, D. White $14, Bane $11, Powell $3). | Inflation I, adjusted value a (§5.1) |
| 4 | Keeps two $1 streaming slots; tracks per-slot budget ("about $14 a player"). | Flyer reserve R, per-slot money P (§5.3) |
| 5 | Tracks every rival's budget, spots and max bid; knows who can outbid him on a target (lost Keegan Murray to a rival holding $8). | Rival table + "can outbid you" (§5.6) |
| 6 | Nominates players he doesn't want but others overpay for, to get money off the board; withholds his targets while rivals have cash. | Nomination suggester (§5.7) |
| 7 | Bids up rivals only to prices he'd be happy owning at. | BID UP verdict (§5.5) |
| 8 | Lets a rival overpay rather than fight ("I'd rather just let him take the player"). | LET THEM verdict (§5.5) |
| 9 | Positional need changes targets (scrambled for a center: Okongwu, Sharpe). | Need boost (§5.4) |
| 10 | Comfortable with no first-rounder; two $80 stars = "no margin for error". | Over-concentration warning (§5.5) |

Josh's final team ($200): Dyson Daniels 17, Deni Avdija 23, LaMelo Ball 30, Jaden McDaniels 11, Brandon Miller 26, Trey Murphy III 21, Onyeka Okongwu 16, Paolo Banchero 19, Nickeil Alexander-Walker 14, Day'Ron Sharpe 10, CJ McCollum 8, Kevin Porter Jr. 2, Isaiah Jackson 3. Projected 2nd of 12.

### Decoded per-player values
~115 players with Josh's stated value or max bid, the actual sale price, buyer, and his comment, extracted from the auto-generated transcript. Stored as `espn-auction-helper/data/josh-lloyd-2026-auction-mock.csv` with columns:

`player, josh_low, josh_high, josh_kind (value|max|avoid), sold, winner, josh_take, name_confidence (high|medium|low)`

Caveats: values are for that room (12T, hot room) and Josh says they shift with any settings change; some names are caption-garbled — low-confidence rows are flagged and unidentifiable names were dropped.

## 3. Architecture

New top-level folder `espn-auction-helper/`. Chrome Manifest V3 extension, TypeScript, esbuild bundling, Preact UI, vitest tests. No server.

```
espn-auction-helper/
  manifest.json
  data/
    josh-lloyd-2026-auction-mock.csv
    consensus-values.json        # copied from repo data/espn-draft-data.json
    values.json                  # build output (12T basis)
  scripts/build-values.ts        # offline values pipeline
  src/
    capture/   page-world WebSocket hook, decoder, DOM fallback, recorder
    espn/      API client (settings, teams, players, draftDetail reconcile)
    values/    runtime league rescale + suppression
    engine/    pure state reducer + advice functions
    ui/        Shadow-DOM overlay panel (Preact)
    content.ts isolated-world glue: events -> engine -> ui
  test/
    fixtures/  recorded ESPN frames, Josh replay sales
```

Unit responsibilities:

- **capture/** — Turns the draft room into events `Nominated{playerId, byTeamId, openingBid}`, `Bid{playerId, teamId, amount}`, `Sold{playerId, teamId, price}`, `Clock{secondsLeft}`. Primary source: WebSocket messages. Fallback: DOM observation. Knows nothing about strategy.
- **espn/** — Reads league settings (teams, budget, roster slots & position eligibility, categories), team names/owners, player pool, completed picks (`draftDetail` with `bidAmount`). Uses the user's existing logged-in session; never copies cookies.
- **values/** — Converts 12T-basis `values.json` to the league's actual settings (§4.3).
- **engine/** — Pure functions. `reduce(state, event) -> state`; `advise(state, values) -> Advice`. No I/O, fully unit-testable.
- **ui/** — Renders `Advice`; emits user corrections (edit sale, undo, set my team, edit value).

Data flow: WS/DOM → capture → `postMessage` (namespaced + random nonce) → content script → engine reduce → advise → ui. Every ~10s the espn client fetches completed picks and the engine reconciles. State persisted in `chrome.storage.session`; value edits in `chrome.storage.local`.

## 4. Values

### 4.1 Offline pipeline (`scripts/build-values.ts` → `values.json`)
1. Load consensus values (`data/espn-draft-data.json`, ~390 players; ESPN player ID parsed from `headshotUrl`).
2. Load Josh CSV; match names by normalization (strip accents, punctuation, Jr/Sr/II/III, lowercase); unmatched rows reported, not silently dropped.
3. Josh number per player: midpoint of `josh_low..josh_high`. `avoid` rows carry no number (flag only).
4. Tier ratios: rank players by consensus; tiers = ranks 1-12, 13-36, 37-72, 73-120, 121+. For each tier, ratio = median(josh / consensus) over players with both. Tiers with < 3 data points inherit the neighbor tier's ratio.
5. Base value (12T basis):
   - Has Josh number: `b = 0.5 * josh + 0.5 * consensus` (weight configurable).
   - No Josh number: `b = consensus * tierRatio(tier)`.
   - Floor at $1.
6. Emit `values.json`: `{ espnId, name, positions, b12, consensus, josh?, avoid?, tier }`.

### 4.2 Top-end suppression
Falls out of step 4-5: Josh rates stars ~0.9x consensus (e.g., Luka 64 vs 69.5, Jokic 73.5 vs 80.3, SGA 60 vs 71.5), so the top tier ratio reproduces his suppression from data rather than a hard-coded factor.

### 4.3 Runtime league rescale
Given league teams N, budget B, roster size S (from ESPN settings):
- Rostered players `K = N * S` (10T x 13 = 130). Surplus pool `Spool = N*B - K` ($1870).
- Sort by `b12` desc. Replacement surplus `s_rep = b12[K+1] - 1` (player ranked K+1).
- For i <= K: `b_i = 1 + max(0, (b12_i - 1) - s_rep) * Spool / Σ_{j<=K} max(0, (b12_j - 1) - s_rep)`.
- For i > K: `b_i = 1`.
- Invariant: `Σ_{i<=K} b_i = N*B` exactly (unit-tested).
- User inline edits override `b` for that player.

## 5. Engine

### 5.1 Inflation
- `money = Σ remaining budgets (all teams)`; `open = Σ open roster slots (all teams)`.
- `pool = top 'open' available players by b`.
- `I = (money - open) / Σ_{pool} (b - 1)`; guard denominator <= 0 → I = 1.
- Adjusted value `a = 1 + (b - 1) * I`.

### 5.2 Room temperature
- Window: last 12 sales with `b >= 5`.
- `T = Σ price / Σ b` over the window (undefined until 4 qualifying sales → "Reading room").
- Labels: Hot `T > 1.10`; Warm `1.03 < T <= 1.10`; Neutral `0.95 <= T <= 1.03`; Cold `T < 0.95`.
- Hot room: top-tier (tier 1-2) players get no inflation credit: their `a = b`.
- Bargain flag: any sale or live price on a tier-1/2 player `<= 0.95 * a` (Luka at $61).

### 5.3 My budget
- Flyer reserve `R` = 2 slots x $1 (configurable 0-3).
- Core slots `C = myOpen - R` (min 0).
- Per-slot money `P = (myBudget - R) / C`.
- Safe max `M = myBudget - R - (C - 1)` when C >= 1; when C = 0, `M = myBudget - (myOpen - 1)`.
- ESPN hard max `myBudget - (myOpen - 1)` shown alongside.

### 5.4 Need boost
- For each starting slot type (PG/SG/SF/PF/C/G/F/UTIL per league settings), compute whether my roster can fill it.
- Thin = count of available eligible players with `b >= 5` < 1.5 x (number of league-wide open starting slots needing that position).
- If the nominated player fills an unfilled starting slot whose position is thin: boost = 1.10, else 1.00.

### 5.5 Verdict for the nominated player
- Ceiling `c = min(a * boost, M)`.
- Evaluate on every Nominated/Bid event, in order:
  1. **BID up to $c** — current price < c and (player is on my target list or `a - price >= 3`).
  2. **BID UP to $e** — rival is high bidder, `e = min(c, a - 2)`, current price < e. Label: "push to $e".
  3. **LET THEM** — rival high bidder and price > a. Show that rival's post-sale per-slot money.
  4. **PASS** — otherwise.
- If I'm the high bidder: show "You lead at $x; ceiling $c".
- Warnings:
  - Over-concentration: winning at current price would make one player > 35% of my starting budget, or two players > 70% combined.
  - Bargain flag (§5.2).

### 5.6 Rivals
Per team: remaining budget, open slots, max bid `budget - (open - 1)`, per-slot money, roster by position. For each of my targets, list rivals whose max bid > my ceiling for it ("can outbid you").

### 5.7 Nomination suggestion (shown when it's my turn to nominate)
Phase by room money ratio `money / (N*B)`:
- **Early (> 0.60):** suggest available players with the highest `b` among those where `consensus > b12 * 1.10` (others value them more than me) and not on my target list. Goal: drain cash.
- **Mid/Late (0.15-0.60):** suggest my best target only if <= 1 rival has max bid > my ceiling for it; otherwise suggest a decoy (as Early).
- **$1 phase (< 0.15 or every rival max bid <= 2):** suggest my best target where no rival can bid above $1.

### 5.8 Targets list
Available players ranked by `a - b*T` (value gap vs. expected price), filtered to `price ~ P ± 50%`; top 10 shown with ceilings and "can outbid you" markers. User can pin/unpin targets.

## 6. Capture and error handling

### 6.1 Step 0 — recording spike (first implementation task)
Debug "recorder" mode saves raw WS frames + periodic DOM snapshots of the nomination area to a downloadable JSON. Run it in an ESPN salary-cap mock draft (if the basketball mock lobby offers one) or the user's league draft room once it opens before the draft. Output becomes `test/fixtures/` and the decoder is written against it.

### 6.2 Capture
- Content script with `world: "MAIN"`, `run_at: document_start`, matches `https://fantasy.espn.com/basketball/draft*`: wraps `window.WebSocket` to observe incoming messages; relays to the isolated content script via `window.postMessage` with a namespace and per-session random nonce; isolated side ignores messages without the nonce.
- Decoder maps ESPN message types to events; versioned; unknown types counted and visible in a debug view; never throws to the page.
- DOM fallback: `MutationObserver` on nomination area (player, current bid, high bidder, clock). All selectors in one config file.
- Player resolution: ESPN ID when present; else normalized name lookup against the player pool.
- My team: detect via SWID cookie vs. team owners; manual picker fallback.

### 6.3 Health indicator
🟢 WS live · 🟡 DOM fallback · 🔴 API-only (completed sales every ~10s; budgets/targets correct, no in-bid calls).

### 6.4 Recovery
- Reconcile every ~10s: diff ESPN completed picks (`bidAmount`) against state; fix and log mismatches.
- Manual corrections: edit a sale (price/team), undo last event.
- API failure: exponential backoff, keep last good state, health shows red.
- Players missing from values: `b = 1`, flagged; inline value edit persists.
- Refresh/crash: rebuild from `chrome.storage.session` + reconcile.

### 6.5 Privacy
Nothing leaves the browser. Only network calls are to ESPN with the user's existing session. No cookie storage.

## 7. Testing

### 7.1 Unit (vitest, TDD)
- Values: name normalization/matching, blend, tier ratios (incl. sparse-tier inheritance), league rescale invariant (`Σ top K = N*B`, rest = $1), user overrides.
- Reducer: events → budgets/open slots/max bids; undo; reconcile corrections.
- Formulas: T labels and thresholds, I with guard, M/P/R edge cases (C = 0), need boost, verdict boundary table, over-concentration.
- Nomination: each phase, target gating by rival max bids.

### 7.2 Josh replay (acceptance)
Fixture: Josh's mock rebuilt from the transcript as an ordered list of sales; settings 12T / $200 / 13 spots. Engine must:
1. Label room Hot after SGA ($68) and Cade ($48) have sold.
2. Bargain-flag Luka at $61.
3. Raise over-concentration warning for the Wemby $80 + Jokic $80 team.
4. Return BID for NAW at $14 and Derrick White at $14 (late).
5. Return LET THEM for Zach Edey at $21.
6. Show the $8 rival as "can outbid you" on Keegan Murray at the end.
7. At least 11 of Josh's 13 purchases are at or below (engine ceiling at that moment + $2) for Josh's team.
8. Return BID for Dyson Daniels at $17 (Josh: "tremendous value").
9. Return BID for Norman Powell at $3 (Josh: "best pick of the draft").
10. Return LET THEM for Walker Kessler at $26 (Josh max $15).
Formulas are tuned until these pass; tuning must not break §7.1 unit tests.

### 7.3 Decoder
Recorded frames → expected events; unknown frames don't crash.

### 7.4 Manual dry run
In an ESPN mock or the league room pre-draft: health green, events match ESPN board, budgets match ESPN display, advice < 1s, survives refresh.

### 7.5 Install
`npm run build` → `chrome://extensions` → Developer mode → Load unpacked → `espn-auction-helper/dist`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| ESPN WS protocol undocumented / changes | Step 0 recording; versioned decoder; DOM fallback; API reconcile. |
| No basketball salary-cap mock available for Step 0 | Record in the league's draft room when it opens pre-draft; DOM fallback ready. |
| Caption-garbled names in Josh data | `name_confidence` column; unmatched rows reported; consensus fills gaps. |
| Josh values are 12T/hot-room specific | Blend with consensus + league rescale + live inflation/temperature. |
| Draft date is close | Engine + values are independent of capture and testable now; capture is the only ESPN-dependent piece. |

## 9. Revisions during planning (2026-10-05)

Facts found while writing the implementation plan changed parts of §3-§7. Where this section conflicts with earlier sections, this section wins.

| # | Change | Why |
|---|---|---|
| R1 | Consensus values come from ESPN's public player API for season id 2027 (`player.draftRanksByRankType.ROTO.auctionValue`), plus `ownership.auctionValueAverage` as "market" (what ESPN drafters pay) and `eligibleSlots` for positions. Snapshot stored as `data/espn-players-2027.json`. The repo's `data/espn-draft-data.json` is not used. | That file is last season's (Tatum $1, Haliburton $0.3, no 2026 rookies). ESPN's ROTO values sum to exactly $2,000 over the top 130 = 10 teams x $200 x 13 basis. |
| R2 | No live REST reconcile. Recovery = event log persisted in the page's `sessionStorage` (tab-scoped, survives refresh) + manual edit/undo. `INIT` frame decoding deferred. Value edits persist in the same log (tab session), not `chrome.storage.local`. | Public protocol notes (gfarrenkopf/fantasy-football-war-room `docs/espn-protocol.md`, Sept 2026): `mDraftDetail` shows no picks until the draft completes. `chrome.storage.session` is not readable from content scripts by default. |
| R3 | DOM fallback replaced by **manual entry** (type nomination / bid / sold in the panel). Health: live (socket events decoding) / manual. | Manual entry works on draft day even if socket decoding fails; DOM selectors would need the same recording and add a second brittle path. |
| R4 | Tier ratios clamped to [0.6, 1.5]. | Josh names mostly cheap players he likes: unclamped tier 4-5 ratios were 2.0-3.0 (selection bias). |
| R5 | Inflation clamped to [0.8, 1.2]. | Late leftover cash produced I = 2.0 in the replay, "valuing" Zach Edey at $21. |
| R6 | Temperature thresholds: Hot > 1.05, Warm > 1.02, Neutral >= 0.95, Cold < 0.95. | Validated on the replay: Hot from the SGA sale through ~sale 21, matching Josh's live calls; 1.10 never fired. |
| R7 | Verdict: BID needs target or a - price >= max(3, 0.25a); LET THEM when a rival leads and price > a; bargain flag applies to completed sales only. | With a flat $3 gap, BID UP could never fire. Every live nomination opens near $1, so a live bargain flag is always on. |
| R8 | The Josh replay (§7.2) uses Josh's own values (midpoint; ESPN ROTO for players he never priced), not the blend. | It tests the engine's decisions, not the value pipeline. Prototype on the reconstructed 156 sales: all 10 checks pass, 13/13 Josh purchases within ceiling + $2. |
| R9 | Nomination decoys: market > 1.10 x b (the room pays more than you value). | ESPN market price is a direct signal of what the room overpays. |
| R10 | Clock events dropped from v1. | No advice depends on the clock. |
| R11 | Need boost uses ESPN `eligibleSlots` + league `lineupSlotCounts` with a bipartite matching of roster to starting slots. | ESPN eligibility is exact; position strings are not. |
| R12 | ESPN season id is 2027 for the 2026-27 season (`games/fba/seasons/2027`). | ESPN uses the ending year. |
| R13 | The bridge uses a ready/hello handshake: the page-world hook buffers frames until the content script posts `ready`, then sends `hello` with a nonce and replays the buffer. | Content scripts in two worlds start in no guaranteed order. |
