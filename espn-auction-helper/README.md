# ESPN Auction Helper ("Josh Mode")

Chrome extension for ESPN fantasy basketball **salary-cap (auction)** drafts. It runs Josh Lloyd's auction approach (Locked On Fantasy Basketball, auction mock of 2026-10-05) live in the draft room:

- **Call on every bid**: BID up to $X, BID UP to $X (drain a rival, happy if you win), LET THEM (rival overpaying), PASS, or You lead.
- **Save the slot**: while more than 6 of your spots are open, PASS on anyone worth under half your money per open slot; spend those slots on better players.
- **Category fit**: a player's value moves with what he adds to your roster in H2H 9-cat, from ×0.75 to ×1.25. A player who helps where your weekly odds are close is worth more; one whose stats you already win, or have fallen too far behind in to catch up, is worth less. The call card says why: "fits your team ×1.15: AST, 3PM". Off for players under $5 or without projected stats.
- **Room temperature** (Hot / Warm / Neutral / Cold) from recent sale prices vs. value, plus inflation from money left vs. value left.
- **Your budget**: money left, open spots, money per open slot after holding 2 × $1 streaming slots, and a safe max that keeps your roster fillable.
- **The call card** shows the player's value, ESPN's average price and your max, with a bar placing the current price against them. The last 8 sales show green under value, red over.
- **Where the value comes from**: the call card names the player's strongest categories against the draftable pool and the ones he costs you ("Value from: BLK, REB, FG% · costs you: FT%, TO"), and flags **⭐ value play** when your value beats ESPN's average price by $3 and 15% (or **room usually overpays** the other way).
- **Look for**: the 6 best players left for your roster, by your value over ESPN's average price, affordable and worth $5+, each tagged with the categories where he'd help your team. Under the list, your team's standing: categories you'd usually win or lose in a week. ESPN rooms pay top dollar for stars and little for the middle tier, so early on most of the list is value plays.
- **Similar**: a tab next to Look for that opens when a player is nominated: the 5 players still available within half his value (at least $3) whose category profile is closest to his, tagged with the categories they share. If you lose him, that's who is left. Look for comes back after the sale; clicking a tab holds it until the next nomination.
- **Your notes**: a note typed in the projections sheet shows on the call card ("📝 Money Grabber") and as a 📝 on listed players.
- **Rivals**: everyone's money, open slots and max bid, highest first; max bids in amber can outbid your max on the player on the block.
- **Nominate next**: early, players the room overpays for; later, your target once rivals can't outbid you; at the end, $1 steals.
- **Warnings**: two stars eating 70% of your budget leaves no margin for error.

Design: `docs/superpowers/specs/2026-10-05-espn-auction-helper-design.md`.


## Setup

Needs Node 20 or newer.

```bash
cd espn-auction-helper
npm install
npm run fetch-espn   # today's ESPN 2026-27 player pool: ids, positions, ESPN average price
npm run fetch-history # games played in the last 3 seasons, for injury labels (once; past seasons don't change)
npm run values       # blend data/auction-values.csv with Josh Lloyd's decoded values, add stat lines -> data/values.json
npm run build
```

Values come from `data/auction-values.csv`, a projections export in Hashtag Basketball's auction-values layout (`R#, PLAYER, POS, TEAM, GP, MPG, TOTAL, VALUED AT, …`), blended with Josh's numbers. Players tied on value, mostly the $1 crowd, are ordered by the CSV's rank. To use edited projections, export the CSV from the projections sheet and save it over `data/auction-values.csv`. `npm run values` also stores each player's projected season stats (from `data/hashtag-projections.csv`, with the sheet's games and minutes) in `values.json`; category fit reads them. ESPN's own values and ranks are not used; ESPN supplies only player ids, positions and its average price, which the helper uses as the room's market price.

Injury labels come from ESPN's actual games played in the last three seasons (`data/espn-games-history.json`), counting only seasons where the player averaged 20+ minutes. **INJ** (injury prone): missed 25+ games in 2 of those 3 seasons, or 45+ in one of the two seasons before last. **RET** (returning from major injury): missed 37+ games last season only. The panel shows them on the player being bid on, in Look for and on the nomination suggestion; they don't change values.

`npm run fetch-espn` overwrites the committed `data/espn-players-2027.json`. Always run `npm run values` after it, and after replacing `data/auction-values.csv`. Tests that read the real data, such as the value blend, may shift after a fetch.

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `espn-auction-helper/dist`.

## Draft day

1. Run `npm run fetch-espn && npm run values && npm run build` the morning of the draft, then hit reload on the extension.
2. Open your league's draft room (`https://fantasy.espn.com/basketball/draft?leagueId=...`) while logged in.
3. Check **My team** at the top of the panel. It is detected from your ESPN login. If it's wrong or blank, pick your team there. You can change it at any time.
4. Watch the panel's status light. **● live** (filled circle) means ESPN draft-room messages are arriving and filling in nominations, bids and sales automatically. If no messages arrive for about 20 seconds, the light becomes **○ waiting** (hollow circle). It re-checks every 5 seconds. The panel has no manual entry: if the light stays hollow during a live draft, the decoder isn't reading ESPN's messages.
5. If a refresh or reconnect breaks the live connection mid-sale, an alert says "Missed the end of …". Check **Budgets** on ESPN to see if the player sold. Teams are labelled `#id name`. When ESPN's SOLD disagrees with a sale the panel holds, ESPN's wins. The **–** button in the header collapses the panel.
6. Above **Nominate**, a line shows whose turn it is to nominate: **Your turn to nominate**, **Nominating now: #id name · you nominate in N turns**, or, while a player is on the block, **Up next: …**. In live mode it comes from ESPN; in manual mode it is inferred from the draft order, skipping teams with full rosters.
7. Your draft is saved on every change, in this tab and in this browser. A refresh keeps it. A new tab, or a restarted browser, restores it with a banner. **↺** in the header (New draft, after a confirm) clears the saved sales and starts over. Use it after a mock or a dry run.

## Dry run before your draft

Before your real auction, run through a mock or test league with these checks:

1. Open a salary-cap draft room and confirm **● live** appears.
2. Check that sales and team budgets match ESPN's **Budgets** tab.
3. Refresh once mid-auction and check that the alert appears if a sale was missed, and that budgets still match.
4. Leave the tab in the background for a few minutes and check it is still live.

## Old recordings (for debugging the live decoder)

The panel no longer records drafts. Older raw recordings contain your ESPN SWID and draft join code: keep them in `recordings/` (git-ignored) and only commit the output of `npm run scrub -- recording <raw> <out> [names.txt]`. The optional `names.txt` file lists your league's team names and member names (one per line), and they are replaced with REDACTED in the scrubbed output.

## Tuning

All thresholds live in `src/engine/constants.ts`. `test/replay.test.ts` replays Josh's 156-sale mock: run `npm test` after any change to make sure the engine still makes his calls.

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
- **Panel (right):** the real helper panel, fed the same socket lines ESPN sends.
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
- `consensus` bids up to the projected value.

```
npm run sim:batch -- --drafts 200
npm run sim:batch -- --drafts 100 --room hot --set BID_UP_MARGIN=4 --compare
npm run sim:batch -- --drafts 50 --json > results.json
```

Flags:
- `--drafts N` (default 100)
- `--seed N` (default 1; drafts use seeds N, N+1, …)
- `--room cold|neutral|hot|<number>`
- `--policies autopilot,market,consensus`
- `--set NAME=value` (repeatable). Autopilot's bid limit comes from the adjusted value, the ceiling, `BID_UP_MARGIN` and the save-the-slot rule (`SLOT_FLOOR`, `SLOT_FLOOR_OPEN`) and category fit (`FIT_WEIGHT`, 0 turns it off; `FIT_MIN`, `FIT_MAX`); tunables that only change the panel's display (`BID_GAP_*` at their defaults, `*_SHARE`, `BARGAIN_RATIO`) leave autopilot's results unchanged, and the batch prints a note when you set one.
- `--compare`: defaults vs your `--set` values on the same seeds
- `--json`

Columns:
- title %: average chance my team wins the title, with the 95% interval.
- playoffs %: average chance of a top-4 finish.
- avg seed: average regular-season finish, 1 = best.
- weekly cats %: expected share of weekly categories won (the regular-season record).
- value captured: projected value minus price, summed over your roster.
- $ left: money left unspent.

### Projections

Standings are projected for the league's format, H2H each category with 9 categories (TO included): 19 one-week matchups, then the top 4 play 2-week semifinals and a final. Season stats come from `data/hashtag-projections.csv` (the Hashtag Basketball export with per-game stats): per-game × games played, summed over each roster and spread over the NBA season's 23.4 weeks.

Each week every category is a coin weighted by the gap between the two teams and how much that stat swings from week to week (points swing most, steals and turnovers least; 2–4 games a week). Each draft plays 400 seasons: a random schedule, top 4 by categories won, more categories wins a playoff round. Results show each team's win %, playoff and title odds, and its chance to win each category in a week against an average opponent. The swing sizes are assumptions in `src/sim/score.ts`, not fitted to real weeks. Seasons are scored on the projections plus error drawn from the draft's seed (games ±15%, each stat ±10%, FG% ±1.5 and FT% ±3 points), so a bidder that reads the projections, like category fit, can't know how the season turns out. When `data/auction-values.csv` (the projections sheet's export) has a player, its GP and MPG win, so sheet edits count. The page reloads when either file changes. Players without a projection add nothing and are counted in the "No proj." column. If the stats file is missing (batch) or can't be parsed (page), the simulator still runs and reports value captured and money left.

### Syncing the projections sheet

In the projections sheet, click **Export CSV**, then run `npm run sync-sheet`. It takes the newest `~/Downloads/auction-values*.csv` (or a path: `npm run sync-sheet -- path/to/file.csv`), checks it, writes `data/auction-values.csv` and rebuilds `data/values.json`. A running simulator reloads with the new values; run `npm run build` to update the extension.

### Bots

The 9 bots are 3 stars-and-scrubs, 4 balanced and 2 value hunters. For each player, every bot draws a private value: market price × 0.85 × lognormal noise × room × personality, then scales it by the room's money (like the panel's inflation) and by its own money per open slot compared with the room's. Rich bots pay up late; bots that spent big early drop out. With a market-price bidder in the room, prices land within about 10% of ESPN's average price in every tier. Bots keep ESPN's budget rule (keep $1 for every other open slot) and don't spend more than 60% of their budget while 4 or more slots are open. They nominate the top player 80% of the time and otherwise one of the 10 most-bought cheap players.
