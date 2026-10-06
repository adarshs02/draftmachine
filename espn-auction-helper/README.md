# ESPN Auction Helper ("Josh Mode")

Chrome extension for ESPN fantasy basketball **salary-cap (auction)** drafts. It runs Josh Lloyd's auction approach (Locked On Fantasy Basketball, auction mock of 2026-10-05) live in the draft room:

- **Call on every bid**: BID up to $X, BID UP to $X (drain a rival, happy if you win), LET THEM (rival overpaying), PASS, or You lead.
- **Room temperature** (Hot / Warm / Neutral / Cold) from recent sale prices vs. value, plus inflation from money left vs. value left.
- **Your budget**: money per open slot after holding 2 × $1 streaming slots, and a safe max that keeps your roster fillable.
- **Rivals**: everyone's money, open slots and max bid, and who can outbid you on each target.
- **Nominate next**: early, players the room overpays for; later, your target once rivals can't outbid you; at the end, $1 steals.
- **Warnings**: two stars eating 70% of your budget leaves no margin for error.

Design: `docs/superpowers/specs/2026-10-05-espn-auction-helper-design.md`.


## Setup

Needs Node 20 or newer.

```bash
cd espn-auction-helper
npm install
npm run fetch-espn   # today's ESPN 2026-27 auction values
npm run values       # blend with Josh Lloyd's decoded values -> data/values.json
npm run build
```

`npm run fetch-espn` overwrites the committed `data/espn-players-2027.json`. Always run `npm run values` after it. Tests that read the real data, such as the value blend, may shift after a fetch.

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `espn-auction-helper/dist`.

## Draft day

1. Run `npm run fetch-espn && npm run values && npm run build` the morning of the draft, then hit reload on the extension.
2. Open your league's draft room (`https://fantasy.espn.com/basketball/draft?leagueId=...`) while logged in.
3. Check **My team** at the top of the panel. It is detected from your ESPN login. If it's wrong or blank, pick your team there. You can change it at any time.
4. Watch the panel's status light. **● live** (filled circle) means ESPN draft-room messages are arriving and filling in nominations, bids and sales automatically. If no messages arrive for about 20 seconds, the light becomes **○ manual** (hollow circle). It re-checks every 5 seconds.
   - In **live mode**, the panel updates automatically as events happen in the room.
   - In **manual mode**, type events into *Manual entry*:
     - **Nominated**, **Bid**: player, team and $.
     - **Sold**: with no $ typed, sells the player on the block at the last price to the leading team. With a $ typed, sells to the team and amount you entered.
     - **Clear block**: takes a mistaken nomination off the block.
     - **Set value**: sets a player's value. A name that matches no one is added as a new player, for a late call-up missing from the values.

     Partial names work when they match exactly one player (`jok`, or a last name like `Jokic`). Otherwise the panel says what matched and records nothing. Every card still works in manual mode.
5. If a refresh or reconnect breaks the live connection mid-sale, an alert says "Missed the end of …". Check **Budgets** on ESPN to see if the player sold, and enter that sale with **Sold** if needed. If ESPN's sale differs from one you typed, ESPN wins, and the panel tells you what it corrected. Teams are labelled `#id name`. Pin targets with ☆. To fix a wrong sale, press ✎ and type the price and team number (`14 3`) or the start of the team name (`14 bub`). **Undo last sale** removes the most recent sale. The **–** button in the header collapses the panel.
6. Above **Nominate:**, a line shows whose turn it is to nominate: **Your turn to nominate**, **Nominating now: #id name · you nominate in N turns**, or, while a player is on the block, **Up next: …**. In live mode it comes from ESPN; in manual mode it is inferred from the draft order, skipping teams with full rosters.
7. Watch the footer's unknown-verb counter. If that count grows during your draft, it's worth recording and reporting.
8. Your draft is saved on every change, in this tab and in this browser. A refresh keeps it. A new tab, or a restarted browser, restores it with a banner. **New draft** (after a confirm) clears the saved sales and starts over. Use it after a mock or a dry run.

## Dry run before your draft

Before your real auction, run through a mock or test league with these checks:

1. Open a salary-cap draft room and confirm **● live** appears.
2. Check that sales and team budgets match ESPN's **Budgets** tab.
3. Refresh once mid-auction and check that the alert appears if a sale was missed, and that budgets still match.
4. Leave the tab in the background for a few minutes and check it is still live.
5. Watch the footer's unknown-verb counter throughout.

## Recording a draft (for debugging the live decoder)

**Download recording** saves every socket frame. Raw recordings contain your ESPN SWID and draft join code: keep them in `recordings/` (git-ignored) and only commit the output of `npm run scrub -- recording <raw> <out> [names.txt]`. The optional `names.txt` file lists your league's team names and member names (one per line), and they are replaced with REDACTED in the scrubbed output.

## Tuning

All thresholds live in `src/engine/constants.ts`. `test/replay.test.ts` replays Josh's 156-sale mock: run `npm test` after any change to make sure the engine still makes his calls.
