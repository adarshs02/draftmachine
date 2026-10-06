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

```bash
cd espn-auction-helper
npm install
npm run fetch-espn   # today's ESPN 2026-27 auction values
npm run values       # blend with Josh Lloyd's decoded values -> data/values.json
npm run build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `espn-auction-helper/dist`.

## Draft day

1. Run `npm run fetch-espn && npm run values && npm run build` the morning of the draft, then hit reload on the extension.
2. Open your league's draft room (`https://fantasy.espn.com/basketball/draft?leagueId=...`) while logged in.
3. The panel shows **● live** once socket events decode. If it stays **○ manual**, type events into *Manual entry* (Nominated / Bid / Sold). Every card still works.
4. Pin targets with ☆. Fix a wrong sale with ✎ ("price team#"), or **Undo last sale**.
5. Refreshing the page keeps your draft: it's saved in this tab's session.

## Recording a draft (for debugging the live decoder)

**Download recording** saves every socket frame. Raw recordings contain your ESPN SWID and draft join code: keep them in `recordings/` (git-ignored) and only commit the output of `npm run scrub -- recording <raw> <out> [names.txt]`. The optional `names.txt` file lists your league's team names and member names (one per line), and they are replaced with REDACTED in the scrubbed output.

## Tuning

All thresholds live in `src/engine/constants.ts`. `test/replay.test.ts` replays Josh's 156-sale mock: run `npm test` after any change to make sure the engine still makes his calls.
