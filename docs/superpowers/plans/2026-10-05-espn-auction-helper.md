# ESPN Auction Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that overlays Josh Lloyd–style live advice (bid ceiling, BID / BID UP / LET THEM / PASS, room temperature, budgets, rival max bids, nomination pick, targets) on the ESPN fantasy basketball salary-cap draft room.

**Architecture:** Pure TypeScript engine (values → state reducer → advice) with no I/O, fed by either a page-world WebSocket hook (live) or a manual-entry form (fallback), rendered as a Preact panel inside a Shadow DOM. Player values are built offline from ESPN's public 2026-27 auction values blended with Josh Lloyd's decoded values, then rescaled to the league's real settings at draft time.

**Tech Stack:** TypeScript (strict), Chrome Manifest V3, esbuild, Preact + htm (no JSX build step), vitest (+ jsdom for UI), tsx for scripts.

**Spec:** `docs/superpowers/specs/2026-10-05-espn-auction-helper-design.md`. Read §9 "Revisions during planning" first: it overrides earlier sections.

**Research data (committed in Task 1):**
- `docs/superpowers/research/josh-lloyd-2026-auction-mock.csv`: 115 decoded Josh values.
- `docs/superpowers/research/josh-mock-sales.json`: Josh's 156 sales in order, 12 teams.

## Global Constraints

- All code lives in `espn-auction-helper/`. All commands run from `/Users/adarsh/myProjects/draftmachine/espn-auction-helper` unless a step says otherwise.
- Do not touch `draft-tracker/`. Its 4 uncommitted deletions stay unstaged: always `git add` explicit paths, never `git add -A` or `git add .`.
- Work on branch `feat/espn-auction-helper` (created in Task 1).
- Commits end with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- ESPN game `fba`, season id `2027` (2026-27 season). API base `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons`.
- Read-only on ESPN: the hook never sends on ESPN's socket; no cookies are copied, stored or sent anywhere but ESPN.
- ESPN lineup slot ids: 0 PG, 1 SG, 2 SF, 3 PF, 4 C, 5 G, 6 F, 7 SG/SF, 8 G/F, 9 PF/C, 10 F/C, 11 UTIL, 12 bench, 13 IR. Default counts `{0:1,1:1,2:1,3:1,4:1,5:1,6:1,11:3,12:3}` (13 roster spots).
- Tunables (exact values, all in `src/engine/constants.ts` or `src/values/*`): tier bounds `[12, 36, 72, 120]`; blend weight `0.5`; tier ratio clamp `[0.6, 1.5]`; inflation clamp `[0.8, 1.2]`; temperature window 12 sales with b ≥ 5, minimum 4; Hot > 1.05, Warm > 1.02, Neutral ≥ 0.95, Cold < 0.95; bargain price ≤ 0.95 × a for tier ≤ 2; BID gap ≥ max(3, 0.25 × a); BID UP e = min(c, floor(a − 2)); need boost 1.10 when supply < 1.5 × demand of players with b ≥ 5; concentration 35% one player / 70% two players of starting budget; nomination phases early > 0.60, dollar < 0.15 money ratio (or every rival max bid ≤ 2); decoy market > 1.10 × b; targets band per-slot × [0.5, 1.5], limit 10; flyer reserve 2.
- UI uses `htm` tagged templates (`html\`...\``) with Preact `h`. No JSX, no `.tsx` files.

## Review Focus

1. **A player on the block who isn't in `values.json`** (rookie call-up, unknown ESPN id): the panel must still show a call using b = $1, label the player "has no value", and allow "Set value". Pinned in Task 9 (verdict `unvalued`), Task 6 (`setValue` creates an entry) and Task 13 (UI text).
2. **Out-of-order or duplicate events** (lower bid after a higher one, a bid with nothing on the block, a sale repeated by socket and manual entry, nominating a sold player): ignore them and don't crash. Pinned in Task 6 reducer tests.
3. **My team not detected** (logged out, SWID mismatch): show a team picker; my-budget advice stays empty, never wrong. Pinned in Task 9 (`verdict` null without my team) and Task 13 (picker dispatches `setMyTeam`).
4. **Page refresh mid-draft, or corrupt saved state:** restore from the tab's sessionStorage log; corrupt JSON starts fresh. Pinned in Task 14 (storage + controller tests).
5. **Last roster slot, broke team, or full roster:** no negative ceilings, no NaN per-slot money. Pinned in Task 7 (`myBudget` with 0 open) and Task 9 (`ceilingFor` = 0 on a full roster).

---

### Task 1: Branch, research data, extension scaffold

**Files:**
- Create: `espn-auction-helper/package.json`
- Create: `espn-auction-helper/tsconfig.json`
- Create: `espn-auction-helper/build.mjs`
- Create: `espn-auction-helper/manifest.json`
- Create: `espn-auction-helper/.gitignore`
- Create: `espn-auction-helper/src/content.ts` (stub, replaced in Task 14)
- Create: `espn-auction-helper/src/capture/hook.ts` (stub, replaced in Task 15)
- Test: `espn-auction-helper/test/build.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test`, `npm run build` (emits `dist/manifest.json`, `dist/hook.js`, `dist/content.js`), `npm run typecheck`.

- [ ] **Step 1: Create the branch and commit the docs**

Run from `/Users/adarsh/myProjects/draftmachine`:

```bash
git checkout -b feat/espn-auction-helper
git add docs/superpowers/specs/2026-10-05-espn-auction-helper-design.md docs/superpowers/plans/2026-10-05-espn-auction-helper.md docs/superpowers/research/josh-lloyd-2026-auction-mock.csv docs/superpowers/research/josh-mock-sales.json
git commit -m "docs: ESPN auction helper spec, plan and Josh Lloyd research data" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --short
```

Expected: the commit succeeds, and `git status` still lists the 4 ` D draft-tracker/...` deletions, unstaged.

- [ ] **Step 2: Write `package.json`, `.gitignore`, `tsconfig.json`**

`espn-auction-helper/package.json`:

```json
{
  "name": "espn-auction-helper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "fetch-espn": "tsx scripts/fetch-espn.ts",
    "values": "tsx scripts/build-values.ts",
    "scrub": "tsx scripts/scrub-recording.ts",
    "analyze": "tsx scripts/analyze-recording.ts"
  }
}
```

`espn-auction-helper/.gitignore`:

```
node_modules/
dist/
recordings/
```

`espn-auction-helper/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome"],
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test", "scripts"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/adarsh/myProjects/draftmachine/espn-auction-helper
npm install --save-dev typescript esbuild vitest tsx @types/chrome jsdom
npm install preact htm
```

Expected: `package.json` gains `devDependencies` and `dependencies`. `package-lock.json` is git-ignored by the repo root `.gitignore`; that's fine.

- [ ] **Step 4: Write the failing build test**

`espn-auction-helper/test/build.test.ts`:

```ts
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('build', () => {
  it('emits the manifest and both bundles', () => {
    execSync('node build.mjs', { stdio: 'pipe' })
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'))
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.content_scripts[0]).toMatchObject({ js: ['hook.js'], world: 'MAIN', run_at: 'document_start' })
    expect(manifest.content_scripts[1]).toMatchObject({ js: ['content.js'], run_at: 'document_start' })
    expect(existsSync('dist/hook.js')).toBe(true)
    expect(existsSync('dist/content.js')).toBe(true)
  }, 30_000)
})
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run test/build.test.ts`
Expected: FAIL, `Cannot find module .../build.mjs`.

- [ ] **Step 6: Write `build.mjs`, `manifest.json` and the two stubs**

`espn-auction-helper/build.mjs`:

```js
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

const common = { bundle: true, format: 'iife', target: 'chrome120', sourcemap: true, logLevel: 'warning' }
await build({ ...common, entryPoints: ['src/capture/hook.ts'], outfile: 'dist/hook.js' })
await build({ ...common, entryPoints: ['src/content.ts'], outfile: 'dist/content.js' })
cpSync('manifest.json', 'dist/manifest.json')
```

`espn-auction-helper/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "ESPN Auction Helper",
  "version": "0.1.0",
  "description": "Josh Lloyd-style live advice for ESPN fantasy basketball salary-cap drafts.",
  "host_permissions": ["https://lm-api-reads.fantasy.espn.com/*"],
  "content_scripts": [
    {
      "matches": ["https://fantasy.espn.com/basketball/draft*"],
      "js": ["hook.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://fantasy.espn.com/basketball/draft*"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ]
}
```

`espn-auction-helper/src/content.ts`:

```ts
// Replaced in Task 14 by the controller + panel wiring.
export {}
```

`espn-auction-helper/src/capture/hook.ts`:

```ts
// Replaced in Task 15 by the page-world WebSocket hook.
export {}
```

- [ ] **Step 7: Run the test and typecheck**

Run: `npx vitest run test/build.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json build.mjs manifest.json .gitignore src/content.ts src/capture/hook.ts test/build.test.ts
git commit -m "feat(helper): scaffold MV3 extension with esbuild and vitest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Name normalization and Josh CSV parser

**Files:**
- Create: `espn-auction-helper/src/values/names.ts`
- Create: `espn-auction-helper/src/values/josh.ts`
- Create: `espn-auction-helper/data/josh-lloyd-2026-auction-mock.csv` (copy)
- Test: `espn-auction-helper/test/values/names.test.ts`
- Test: `espn-auction-helper/test/values/josh.test.ts`

**Interfaces:**
- Consumes: `docs/superpowers/research/josh-lloyd-2026-auction-mock.csv`.
- Produces:
  - `normalizeName(name: string): string`
  - `type JoshKind = 'value' | 'max' | 'avoid'`
  - `interface JoshRow { player: string; low: number | null; high: number | null; kind: JoshKind; sold: number | null; winner: string; take: string; confidence: 'high' | 'medium' | 'low' }`
  - `parseJoshCsv(text: string): JoshRow[]`
  - `joshMid(row: JoshRow): number | null`

- [ ] **Step 1: Copy the data file**

```bash
mkdir -p data && cp ../docs/superpowers/research/josh-lloyd-2026-auction-mock.csv data/
```

- [ ] **Step 2: Write the failing tests**

`test/values/names.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeName } from '../../src/values/names'

describe('normalizeName', () => {
  it.each([
    ['Nikola Jokić', 'nikola jokic'],
    ["De'Aaron Fox", 'deaaron fox'],
    ['Shai Gilgeous-Alexander', 'shai gilgeous alexander'],
    ['Jaren Jackson Jr.', 'jaren jackson'],
    ['Trey Murphy III', 'trey murphy'],
    ["Day'Ron Sharpe", 'dayron sharpe'],
    ['  Kevin   Porter Jr. ', 'kevin porter'],
    ['F12', 'f12'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected)
  })

  it('treats P.J. and PJ the same', () => {
    expect(normalizeName('P.J. Washington')).toBe(normalizeName('PJ Washington'))
  })
})
```

`test/values/josh.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { joshMid, parseJoshCsv } from '../../src/values/josh'

const HEADER = 'player,josh_low,josh_high,josh_kind,sold,winner,josh_take,name_confidence'
const SAMPLE = `${HEADER}
Luka Doncic,64,64,max,61,Atto Magic,bargain - best star value,high
Joel Embiid,,,avoid,16,Atto Magic,avoid,high
VJ Edgecombe,10,10,value,,Kingy,,high
`

describe('parseJoshCsv', () => {
  it('parses numbers, blanks and kinds', () => {
    const rows = parseJoshCsv(SAMPLE)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ player: 'Luka Doncic', low: 64, high: 64, kind: 'max', sold: 61, winner: 'Atto Magic', take: 'bargain - best star value', confidence: 'high' })
    expect(rows[1]).toMatchObject({ player: 'Joel Embiid', low: null, high: null, kind: 'avoid' })
    expect(rows[2]).toMatchObject({ sold: null, take: '' })
  })

  it('rejects a row with the wrong number of fields', () => {
    expect(() => parseJoshCsv(`${HEADER}\nBad,1,2\n`)).toThrow(/row 2 has 3 fields/)
  })

  it('rejects an unknown kind', () => {
    expect(() => parseJoshCsv(`${HEADER}\nX,1,2,maybe,,,,high\n`)).toThrow(/bad kind maybe/)
  })

  it('reads the real decoded file', () => {
    const rows = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))
    expect(rows).toHaveLength(115)
    expect(rows.map((r) => r.player)).toContain('Myles Turner')
  })
})

describe('joshMid', () => {
  it('is the midpoint of low and high, or null', () => {
    const [luka, embiid] = parseJoshCsv(SAMPLE)
    expect(joshMid(luka)).toBe(64)
    expect(joshMid(embiid)).toBeNull()
    expect(joshMid({ ...luka, low: 15, high: 23 })).toBe(19)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run test/values`
Expected: FAIL, cannot resolve `../../src/values/names` / `josh`.

- [ ] **Step 4: Implement**

`src/values/names.ts`:

```ts
/** Join key for player names across ESPN, Josh's CSV and manual entry. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`.]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    // digits survive: no NBA name has one, and test fixtures like "F1"/"F2" must stay distinct
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
```

`src/values/josh.ts`:

```ts
export type JoshKind = 'value' | 'max' | 'avoid'

export interface JoshRow {
  player: string
  low: number | null
  high: number | null
  kind: JoshKind
  sold: number | null
  winner: string
  take: string
  confidence: 'high' | 'medium' | 'low'
}

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))

export function parseJoshCsv(text: string): JoshRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const [header, ...rows] = lines
  if (!header?.startsWith('player,josh_low,josh_high')) throw new Error('unexpected Josh CSV header')
  return rows.map((line, i) => {
    const f = line.split(',')
    if (f.length !== 8) throw new Error(`Josh CSV row ${i + 2} has ${f.length} fields: ${line}`)
    const [player, low, high, kind, sold, winner, take, confidence] = f
    if (kind !== 'value' && kind !== 'max' && kind !== 'avoid') throw new Error(`Josh CSV row ${i + 2}: bad kind ${kind}`)
    return { player, low: num(low), high: num(high), kind, sold: num(sold), winner, take, confidence: confidence as JoshRow['confidence'] }
  })
}

export function joshMid(row: JoshRow): number | null {
  if (row.low === null || row.high === null) return null
  return (row.low + row.high) / 2
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/values && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add data/josh-lloyd-2026-auction-mock.csv src/values/names.ts src/values/josh.ts test/values/names.test.ts test/values/josh.test.ts
git commit -m "feat(helper): name normalization and Josh Lloyd value parser" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ESPN public player values snapshot

**Files:**
- Create: `espn-auction-helper/src/espn/common.ts`
- Create: `espn-auction-helper/src/espn/players.ts`
- Create: `espn-auction-helper/scripts/fetch-espn.ts`
- Create: `espn-auction-helper/data/espn-players-2027.json` (generated, committed)
- Test: `espn-auction-helper/test/espn/players.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SEASON = 2027`, `API_BASE`, `type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>` in `src/espn/common.ts`
  - `interface EspnPlayer { id: number; name: string; slots: number[]; roto: number; market: number }`
  - `trimPlayers(raw: unknown): EspnPlayer[]`
  - `fetchPlayers(fetchFn?: FetchLike): Promise<EspnPlayer[]>`
  - `data/espn-players-2027.json`: `EspnPlayer[]`, at least 300 entries

- [ ] **Step 1: Write the failing tests**

`test/espn/players.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FetchLike } from '../../src/espn/common'
import { fetchPlayers, PLAYERS_URL, trimPlayers } from '../../src/espn/players'

const RAW = {
  players: [
    {
      id: 3112335,
      player: {
        fullName: 'Nikola Jokic',
        eligibleSlots: [4, 9, 10, 11, 12, 13],
        draftRanksByRankType: { ROTO: { auctionValue: 68 }, STANDARD: { auctionValue: 65 } },
        ownership: { auctionValueAverage: 81.3247 },
      },
    },
    { id: 99, player: { fullName: 'No Ranks Guy', eligibleSlots: [0, 11, 12] } },
    { id: 100, player: {} },
  ],
}

describe('trimPlayers', () => {
  it('keeps id, name, lineup slots, ROTO value and market price', () => {
    expect(trimPlayers(RAW)).toEqual([
      { id: 3112335, name: 'Nikola Jokic', slots: [4, 9, 10, 11], roto: 68, market: 81.3 },
      { id: 99, name: 'No Ranks Guy', slots: [0, 11], roto: 0, market: 0 },
    ])
  })

  it('returns [] for junk', () => {
    expect(trimPlayers(null)).toEqual([])
    expect(trimPlayers({})).toEqual([])
  })
})

describe('fetchPlayers', () => {
  it('calls the public 2027 player endpoint with a filter header', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return { ok: true, status: 200, json: async () => RAW }
    }
    const players = await fetchPlayers(fake)
    expect(players).toHaveLength(2)
    expect(calls[0].url).toBe(PLAYERS_URL)
    expect(calls[0].url).toContain('/games/fba/seasons/2027/')
    const filter = JSON.parse((calls[0].init?.headers as Record<string, string>)['X-Fantasy-Filter'])
    expect(filter.players.limit).toBe(400)
  })

  it('throws on HTTP errors', async () => {
    const fake: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchPlayers(fake)).rejects.toThrow(/503/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/espn/players.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/espn/common.ts`:

```ts
/** ESPN names a season by its ending year: 2027 = the 2026-27 NBA season. */
export const SEASON = 2027
export const API_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons'

export type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
```

`src/espn/players.ts`:

```ts
import { API_BASE, SEASON, type FetchLike } from './common'

export interface EspnPlayer {
  id: number
  name: string
  /** eligible lineup slots 0-11 (bench 12 and IR 13 dropped) */
  slots: number[]
  /** ESPN's categories auction value (10 teams x $200 x 13 basis) */
  roto: number
  /** average price paid in ESPN auction drafts */
  market: number
}

export const PLAYERS_URL = `${API_BASE}/${SEASON}/segments/0/leaguedefaults/1?view=kona_player_info`
export const PLAYERS_FILTER = JSON.stringify({
  players: { limit: 400, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'STANDARD' } },
})

interface RawPlayer {
  id?: number
  player?: {
    id?: number
    fullName?: string
    eligibleSlots?: number[]
    draftRanksByRankType?: { ROTO?: { auctionValue?: number } }
    ownership?: { auctionValueAverage?: number }
  }
}

export function trimPlayers(raw: unknown): EspnPlayer[] {
  const list = (raw as { players?: RawPlayer[] } | null)?.players ?? []
  const out: EspnPlayer[] = []
  for (const p of list) {
    const pl = p.player
    const id = p.id ?? pl?.id
    if (!pl?.fullName || typeof id !== 'number') continue
    out.push({
      id,
      name: pl.fullName,
      slots: (pl.eligibleSlots ?? []).filter((s) => s <= 11),
      roto: pl.draftRanksByRankType?.ROTO?.auctionValue ?? 0,
      market: Math.round((pl.ownership?.auctionValueAverage ?? 0) * 10) / 10,
    })
  }
  return out
}

export async function fetchPlayers(fetchFn: FetchLike = fetch): Promise<EspnPlayer[]> {
  const res = await fetchFn(PLAYERS_URL, { headers: { Accept: 'application/json', 'X-Fantasy-Filter': PLAYERS_FILTER } })
  if (!res.ok) throw new Error(`ESPN players HTTP ${res.status}`)
  return trimPlayers(await res.json())
}
```

`scripts/fetch-espn.ts`:

```ts
import { writeFileSync } from 'node:fs'
import type { FetchLike } from '../src/espn/common'
import { fetchPlayers } from '../src/espn/players'

// ESPN rejects requests without a browser User-Agent.
const withUserAgent: FetchLike = (url, init) =>
  fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': 'Mozilla/5.0' } })

const players = await fetchPlayers(withUserAgent)
if (players.length < 300) throw new Error(`expected at least 300 players, got ${players.length}`)
writeFileSync('data/espn-players-2027.json', JSON.stringify(players, null, 1))
console.log(`wrote ${players.length} players; top: ${players.slice(0, 3).map((p) => `${p.name} $${p.roto}`).join(', ')}`)
```

- [ ] **Step 4: Run tests, then fetch the snapshot**

Run: `npx vitest run test/espn/players.test.ts && npm run fetch-espn`
Expected: tests PASS. The script prints `wrote 400 players; top: Nikola Jokic $68, ...` (exact dollars may drift day to day). If it throws "expected at least 300", inspect the response before changing anything; don't lower the threshold.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/espn/common.ts src/espn/players.ts scripts/fetch-espn.ts data/espn-players-2027.json test/espn/players.test.ts
git commit -m "feat(helper): ESPN 2026-27 player value snapshot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tiers and the Josh/ESPN value blend

**Files:**
- Create: `espn-auction-helper/src/values/types.ts`
- Create: `espn-auction-helper/src/values/tiers.ts`
- Create: `espn-auction-helper/src/values/blend.ts`
- Create: `espn-auction-helper/scripts/build-values.ts`
- Create: `espn-auction-helper/data/values.json` (generated, committed)
- Test: `espn-auction-helper/test/values/tiers.test.ts`
- Test: `espn-auction-helper/test/values/blend.test.ts`

**Interfaces:**
- Consumes: `normalizeName`, `JoshRow`, `parseJoshCsv`, `joshMid` (Task 2); `EspnPlayer` (Task 3).
- Produces:
  - `interface PlayerValue { key: string; espnId: number | null; name: string; slots: number[]; b: number; consensus: number; market: number; josh: number | null; avoid: boolean; tier: number }`
  - `TIER_BOUNDS = [12, 36, 72, 120]`, `TIER_COUNT = 5`, `tierForRank(rank: number): number`, `assignTiers(values: PlayerValue[]): PlayerValue[]` (sorted by b desc, tiers by rank)
  - `BLEND_WEIGHT = 0.5`, `RATIO_MIN = 0.6`, `RATIO_MAX = 1.5`
  - `median(xs: number[]): number`
  - `basisFactor(pairs: Array<{ josh: number; consensus: number }>): number`
  - `tierRatios(samples: Map<number, number[]>, min?: number, max?: number): Record<number, number>`
  - `interface BlendResult { values: PlayerValue[]; unmatchedJosh: string[]; basis: number; ratios: Record<number, number> }`
  - `blendValues(espn: EspnPlayer[], josh: JoshRow[], weight?: number): BlendResult`
  - `data/values.json`: `PlayerValue[]`

- [ ] **Step 1: Write the failing tests**

`test/values/tiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assignTiers, tierForRank } from '../../src/values/tiers'
import type { PlayerValue } from '../../src/values/types'

const v = (key: string, b: number): PlayerValue => ({ key, espnId: null, name: key, slots: [11], b, consensus: 0, market: 0, josh: null, avoid: false, tier: 0 })

describe('tiers', () => {
  it.each([[1, 1], [12, 1], [13, 2], [36, 2], [37, 3], [72, 3], [73, 4], [120, 4], [121, 5], [400, 5]])('rank %i -> tier %i', (rank, tier) => {
    expect(tierForRank(rank)).toBe(tier)
  })

  it('assignTiers sorts by b and tiers by rank', () => {
    const out = assignTiers(Array.from({ length: 14 }, (_, i) => v(`p${i}`, i + 1)))
    expect(out[0]).toMatchObject({ key: 'p13', b: 14, tier: 1 })
    expect(out[11].tier).toBe(1)
    expect(out[12].tier).toBe(2)
  })
})
```

`test/values/blend.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EspnPlayer } from '../../src/espn/players'
import { basisFactor, blendValues, median, tierRatios } from '../../src/values/blend'
import { parseJoshCsv, type JoshRow } from '../../src/values/josh'

const row = (player: string, low: number | null, high: number | null, kind: JoshRow['kind'] = 'value'): JoshRow =>
  ({ player, low, high, kind, sold: null, winner: '', take: '', confidence: 'high' })

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('basisFactor', () => {
  it('is sum(consensus)/sum(josh) over pairs where both are >= $5', () => {
    expect(basisFactor([{ josh: 50, consensus: 60 }, { josh: 30, consensus: 20 }, { josh: 2, consensus: 10 }])).toBe(1)
    expect(basisFactor([{ josh: 10, consensus: 20 }])).toBe(2)
    expect(basisFactor([])).toBe(1)
  })
})

describe('tierRatios', () => {
  it('clamps medians and lets thin tiers inherit the nearest tier (lower first)', () => {
    const r = tierRatios(new Map([[1, [0.5, 0.6, 0.7]], [3, [2, 2, 2, 2]]]))
    expect(r).toEqual({ 1: 0.6, 2: 0.6, 3: 1.5, 4: 1.5, 5: 1.5 })
  })

  it('falls back to 1 with no data', () => {
    expect(tierRatios(new Map())).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 })
  })
})

describe('blendValues', () => {
  const espn: EspnPlayer[] = [
    { id: 1, name: 'Star One', slots: [0], roto: 60, market: 70 },
    { id: 2, name: 'Mid Two', slots: [1], roto: 20, market: 15 },
    { id: 3, name: 'Cheap Three', slots: [4], roto: 2, market: 1 },
  ]
  const josh = [row('Star One', 50, 50), row('Mid Two', 30, 30), row('Ghost Four', 4, 4)]

  it('averages Josh and ESPN, scales ESPN-only players, keeps Josh-only players', () => {
    const r = blendValues(espn, josh)
    expect(r.basis).toBe(1)
    expect(r.unmatchedJosh).toEqual(['Ghost Four'])
    expect(r.values.map((v) => [v.name, v.b, v.tier])).toEqual([
      ['Star One', 55, 1],
      ['Mid Two', 25, 1],
      ['Ghost Four', 4, 1],
      ['Cheap Three', 2, 1],
    ])
    expect(r.values[0]).toMatchObject({ key: 'star one', espnId: 1, consensus: 60, market: 70, josh: 50, avoid: false })
    expect(r.values[2]).toMatchObject({ espnId: null, slots: [] })
  })

  it('carries the avoid flag', () => {
    const r = blendValues(espn, [row('Mid Two', null, null, 'avoid')])
    expect(r.values.find((v) => v.name === 'Mid Two')).toMatchObject({ avoid: true, josh: null })
  })

  it('on real data: every Josh row matches ESPN and Josh suppresses stars', () => {
    const real = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
    const r = blendValues(real, parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8')))
    expect(r.unmatchedJosh).toEqual([])
    expect(r.ratios[1]).toBeLessThan(1)
    expect(r.values.find((v) => v.name === 'Nikola Jokic')!.b).toBeGreaterThan(60)
    expect(r.values.every((v) => v.b >= 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/values/tiers.test.ts test/values/blend.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/values/types.ts`:

```ts
export interface PlayerValue {
  /** normalizeName(name): join key across ESPN, Josh's CSV, live events and manual entry */
  key: string
  espnId: number | null
  name: string
  /** ESPN eligible lineup slots 0-11 */
  slots: number[]
  /** base auction value in league dollars */
  b: number
  /** ESPN ROTO auction value, 0 when ESPN has none */
  consensus: number
  /** ESPN average price paid, 0 when unknown */
  market: number
  /** Josh Lloyd's midpoint (12-team dollars), null when he gave none */
  josh: number | null
  avoid: boolean
  /** 1 = top 12 by b, 2 = 13-36, 3 = 37-72, 4 = 73-120, 5 = rest */
  tier: number
}
```

`src/values/tiers.ts`:

```ts
import type { PlayerValue } from './types'

export const TIER_BOUNDS = [12, 36, 72, 120]
export const TIER_COUNT = TIER_BOUNDS.length + 1

export function tierForRank(rank: number): number {
  const i = TIER_BOUNDS.findIndex((bound) => rank <= bound)
  return i === -1 ? TIER_COUNT : i + 1
}

export function assignTiers(values: PlayerValue[]): PlayerValue[] {
  return [...values].sort((a, b) => b.b - a.b).map((v, i) => ({ ...v, tier: tierForRank(i + 1) }))
}
```

`src/values/blend.ts`:

```ts
import type { EspnPlayer } from '../espn/players'
import { joshMid, type JoshRow } from './josh'
import { normalizeName } from './names'
import { assignTiers, TIER_COUNT, tierForRank } from './tiers'
import type { PlayerValue } from './types'

export const BLEND_WEIGHT = 0.5
// Josh mostly names cheap players he likes, so raw mid/low-tier ratios run 2-3x (selection bias).
export const RATIO_MIN = 0.6
export const RATIO_MAX = 1.5

const round1 = (x: number) => Math.round(x * 10) / 10
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Converts Josh's 12-team dollars to ESPN's 10-team basis. */
export function basisFactor(pairs: Array<{ josh: number; consensus: number }>): number {
  const both = pairs.filter((p) => p.josh >= 5 && p.consensus >= 5)
  if (!both.length) return 1
  return both.reduce((s, p) => s + p.consensus, 0) / both.reduce((s, p) => s + p.josh, 0)
}

export function tierRatios(samples: Map<number, number[]>, min = RATIO_MIN, max = RATIO_MAX): Record<number, number> {
  const tiers = Array.from({ length: TIER_COUNT }, (_, i) => i + 1)
  const own = new Map<number, number>()
  for (const t of tiers) {
    const xs = samples.get(t) ?? []
    if (xs.length >= 3) own.set(t, clamp(median(xs), min, max))
  }
  const out: Record<number, number> = {}
  for (const t of tiers) {
    let ratio = own.get(t)
    for (let d = 1; ratio === undefined && d < TIER_COUNT; d++) ratio = own.get(t - d) ?? own.get(t + d)
    out[t] = ratio ?? 1
  }
  return out
}

export interface BlendResult {
  values: PlayerValue[]
  unmatchedJosh: string[]
  basis: number
  ratios: Record<number, number>
}

export function blendValues(espn: EspnPlayer[], josh: JoshRow[], weight = BLEND_WEIGHT): BlendResult {
  const consTier = new Map([...espn].sort((a, b) => b.roto - a.roto).map((p, i) => [normalizeName(p.name), tierForRank(i + 1)]))
  const joshByKey = new Map(josh.map((r) => [normalizeName(r.player), r]))
  const midFor = (key: string) => {
    const r = joshByKey.get(key)
    return r ? joshMid(r) : null
  }

  const pairs = espn.flatMap((p) => {
    const key = normalizeName(p.name)
    const mid = midFor(key)
    return mid === null ? [] : [{ key, josh: mid, consensus: p.roto }]
  })
  const basis = basisFactor(pairs)
  const samples = new Map<number, number[]>()
  for (const pr of pairs) {
    if (pr.consensus <= 0) continue
    const t = consTier.get(pr.key)!
    samples.set(t, [...(samples.get(t) ?? []), (pr.josh * basis) / pr.consensus])
  }
  const ratios = tierRatios(samples)

  const values: PlayerValue[] = espn.map((p) => {
    const key = normalizeName(p.name)
    const mid = midFor(key)
    const raw = mid !== null ? weight * mid * basis + (1 - weight) * p.roto : p.roto * ratios[consTier.get(key)!]
    return { key, espnId: p.id, name: p.name, slots: p.slots, b: Math.max(1, round1(raw)), consensus: p.roto, market: p.market, josh: mid, avoid: joshByKey.get(key)?.kind === 'avoid', tier: 0 }
  })

  const espnKeys = new Set(espn.map((p) => normalizeName(p.name)))
  const unmatchedJosh: string[] = []
  for (const r of josh) {
    const key = normalizeName(r.player)
    if (espnKeys.has(key)) continue
    unmatchedJosh.push(r.player)
    const mid = joshMid(r)
    values.push({ key, espnId: null, name: r.player, slots: [], b: Math.max(1, round1((mid ?? 1) * basis)), consensus: 0, market: 0, josh: mid, avoid: r.kind === 'avoid', tier: 0 })
  }

  return { values: assignTiers(values), unmatchedJosh, basis, ratios }
}
```

`scripts/build-values.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import type { EspnPlayer } from '../src/espn/players'
import { blendValues } from '../src/values/blend'
import { parseJoshCsv } from '../src/values/josh'

const espn = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
const josh = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))
const { values, unmatchedJosh, basis, ratios } = blendValues(espn, josh)
writeFileSync('data/values.json', JSON.stringify(values, null, 1))
console.log(`basis ${basis.toFixed(3)}  tier ratios ${JSON.stringify(ratios)}`)
console.log(`unmatched Josh rows: ${unmatchedJosh.length ? unmatchedJosh.join(', ') : 'none'}`)
console.log(values.slice(0, 12).map((v) => `${v.name} $${v.b}`).join('\n'))
```

- [ ] **Step 4: Run tests, then build values**

Run: `npx vitest run test/values && npm run values`
Expected: tests PASS. Script prints `basis ~1.00`, a tier-1 ratio below 1, `unmatched Josh rows: none`, and Jokic first at roughly $70.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/values/types.ts src/values/tiers.ts src/values/blend.ts scripts/build-values.ts data/values.json test/values/tiers.test.ts test/values/blend.test.ts
git commit -m "feat(helper): blend Josh Lloyd values with ESPN consensus" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rescale values to the league's settings

**Files:**
- Create: `espn-auction-helper/src/values/rescale.ts`
- Test: `espn-auction-helper/test/values/rescale.test.ts`

**Interfaces:**
- Consumes: `PlayerValue` (Task 4), `assignTiers`/`tierForRank` (Task 4).
- Produces:
  - `interface LeagueShape { teams: number; budget: number; rosterSize: number }`
  - `rescaleToLeague(values: PlayerValue[], shape: LeagueShape): PlayerValue[]` (sorted by b desc; top teams × rosterSize sum exactly to teams × budget; the rest are $1; tiers reassigned)

- [ ] **Step 1: Write the failing test**

`test/values/rescale.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rescaleToLeague } from '../../src/values/rescale'
import type { PlayerValue } from '../../src/values/types'

const v = (key: string, b: number): PlayerValue => ({ key, espnId: null, name: key, slots: [11], b, consensus: 0, market: 0, josh: null, avoid: false, tier: 0 })
const sumTop = (xs: PlayerValue[], k: number) => xs.slice(0, k).reduce((s, x) => s + x.b, 0)

describe('rescaleToLeague', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => v(`p${i}`, 40 - i))

  it('spends exactly the league money on the rostered players, surplus over the replacement player', () => {
    const out = rescaleToLeague(thirty, { teams: 2, budget: 100, rosterSize: 5 })
    expect(sumTop(out, 10)).toBeCloseTo(200, 6)
    expect(out[0].b).toBeCloseTo(1 + (10 * 190) / 55, 6)
    expect(out[9].b).toBeCloseTo(1 + 190 / 55, 6)
    expect(out.slice(10).every((x) => x.b === 1)).toBe(true)
  })

  it('reassigns tiers by new rank', () => {
    const out = rescaleToLeague(thirty, { teams: 2, budget: 100, rosterSize: 5 })
    expect(out[11].tier).toBe(1)
    expect(out[12].tier).toBe(2)
  })

  it('degenerates to $1 everywhere when nobody has surplus', () => {
    const out = rescaleToLeague([v('a', 1), v('b', 1)], { teams: 2, budget: 100, rosterSize: 5 })
    expect(out.map((x) => x.b)).toEqual([1, 1])
  })

  it('on real values: a 10-team league sums to $2000 and a 12-team league to $2400', () => {
    const real = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
    const ten = rescaleToLeague(real, { teams: 10, budget: 200, rosterSize: 13 })
    expect(sumTop(ten, 130)).toBeCloseTo(2000, 6)
    const jokic = ten.find((x) => x.name === 'Nikola Jokic')!
    expect(jokic.b).toBeGreaterThan(60)
    expect(jokic.b).toBeLessThan(80)
    expect(sumTop(rescaleToLeague(real, { teams: 12, budget: 200, rosterSize: 13 }), 156)).toBeCloseTo(2400, 6)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/values/rescale.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/values/rescale.ts`:

```ts
import { tierForRank } from './tiers'
import type { PlayerValue } from './types'

export interface LeagueShape {
  teams: number
  budget: number
  rosterSize: number
}

/**
 * Re-prices values for a league: the teams x rosterSize best players share the
 * money above $1 each, in proportion to their surplus over the first player
 * left out (the replacement level); everyone else is a $1 player.
 */
export function rescaleToLeague(values: PlayerValue[], shape: LeagueShape): PlayerValue[] {
  const sorted = [...values].sort((a, b) => b.b - a.b)
  const rostered = shape.teams * shape.rosterSize
  const pool = shape.teams * shape.budget - rostered
  const replacement = sorted.length > rostered ? sorted[rostered].b - 1 : 0
  const surplus = sorted.map((v, i) => (i < rostered ? Math.max(0, v.b - 1 - replacement) : 0))
  const total = surplus.reduce((s, x) => s + x, 0)
  return sorted.map((v, i) => ({
    ...v,
    b: total > 0 && i < rostered ? 1 + (surplus[i] * pool) / total : 1,
    tier: tierForRank(i + 1),
  }))
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/values/rescale.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/values/rescale.ts test/values/rescale.test.ts
git commit -m "feat(helper): rescale values to league teams, budget and roster" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Engine state, events and reducer

**Files:**
- Create: `espn-auction-helper/src/espn/slots.ts`
- Create: `espn-auction-helper/src/engine/types.ts`
- Create: `espn-auction-helper/src/engine/reducer.ts`
- Create: `espn-auction-helper/test/helpers.ts`
- Test: `espn-auction-helper/test/engine/reducer.test.ts`

**Interfaces:**
- Consumes: `PlayerValue` (Task 4), `normalizeName` (Task 2).
- Produces:
  - `BENCH_SLOT = 12`, `IR_SLOT = 13`, `UTIL_SLOT = 11`, `ESPN_DEFAULT_COUNTS` in `src/espn/slots.ts`
  - `interface Team { id: number; name: string }`
  - `interface Settings { teams: Team[]; budget: number; rosterSize: number; lineupSlotCounts: Record<number, number>; flyerReserve: number }`
  - `interface Sale { seq: number; playerKey: string; teamId: number; price: number }`
  - `interface Live { playerKey: string; price: number; leaderId: number }`
  - `interface DraftState { settings: Settings; myTeamId: number | null; values: Record<string, PlayerValue>; sales: Sale[]; live: Live | null; targets: string[]; nextSeq: number }`
  - `type DraftEvent = nominated | bid | sold | undo | editSale | setMyTeam | toggleTarget | setValue` (shapes below)
  - `placeholderValue(key: string, b?: number): PlayerValue`
  - `initialState(settings: Settings, values: PlayerValue[], myTeamId?: number | null): DraftState`
  - `reduce(state: DraftState, ev: DraftEvent): DraftState`
  - test helpers: `pv(name, b, extra?)`, `settings(teamCount?, extra?)`, `build(settings, values, events, myTeamId?)`, `sold(name, teamId, price)`, `nominated(name, teamId, amount)`

- [ ] **Step 1: Write `src/espn/slots.ts`, `src/engine/types.ts` and the test helpers**

`src/espn/slots.ts`:

```ts
/** ESPN fantasy basketball lineup slot ids (0 PG, 1 SG, 2 SF, 3 PF, 4 C, 5 G, 6 F, 7 SG/SF, 8 G/F, 9 PF/C, 10 F/C). */
export const UTIL_SLOT = 11
export const BENCH_SLOT = 12
export const IR_SLOT = 13
/** ESPN's default categories roster: PG, SG, SF, PF, C, G, F, 3 UTIL, 3 bench = 13. */
export const ESPN_DEFAULT_COUNTS: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3 }
```

`src/engine/types.ts`:

```ts
import type { PlayerValue } from '../values/types'

export interface Team {
  id: number
  name: string
}

export interface Settings {
  teams: Team[]
  budget: number
  rosterSize: number
  /** ESPN lineup slot id -> count, bench/IR included */
  lineupSlotCounts: Record<number, number>
  /** $1 streaming slots to hold back (Josh keeps 2) */
  flyerReserve: number
}

export interface Sale {
  seq: number
  playerKey: string
  teamId: number
  price: number
}

export interface Live {
  playerKey: string
  price: number
  leaderId: number
}

export interface DraftState {
  settings: Settings
  myTeamId: number | null
  values: Record<string, PlayerValue>
  sales: Sale[]
  live: Live | null
  targets: string[]
  nextSeq: number
}

export type DraftEvent =
  | { type: 'nominated'; playerKey: string; teamId: number; amount: number }
  | { type: 'bid'; teamId: number; amount: number }
  | { type: 'sold'; playerKey: string; teamId: number; price: number }
  | { type: 'undo' }
  | { type: 'editSale'; seq: number; teamId: number; price: number }
  | { type: 'setMyTeam'; teamId: number }
  | { type: 'toggleTarget'; playerKey: string }
  | { type: 'setValue'; playerKey: string; b: number }
```

`test/helpers.ts`:

```ts
import { initialState, reduce } from '../src/engine/reducer'
import type { DraftEvent, DraftState, Settings } from '../src/engine/types'
import { ESPN_DEFAULT_COUNTS } from '../src/espn/slots'
import { normalizeName } from '../src/values/names'
import type { PlayerValue } from '../src/values/types'

export function pv(name: string, b: number, extra: Partial<PlayerValue> = {}): PlayerValue {
  return { key: normalizeName(name), espnId: null, name, slots: [11], b, consensus: b, market: b, josh: null, avoid: false, tier: 3, ...extra }
}

export function settings(teamCount = 4, extra: Partial<Settings> = {}): Settings {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: i + 1, name: `T${i + 1}` })),
    budget: 200,
    rosterSize: 13,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    flyerReserve: 2,
    ...extra,
  }
}

export function build(s: Settings, values: PlayerValue[], events: DraftEvent[], myTeamId: number | null = 1): DraftState {
  return events.reduce(reduce, initialState(s, values, myTeamId))
}

export const sold = (name: string, teamId: number, price: number): DraftEvent => ({ type: 'sold', playerKey: normalizeName(name), teamId, price })
export const nominated = (name: string, teamId: number, amount: number): DraftEvent => ({ type: 'nominated', playerKey: normalizeName(name), teamId, amount })
```

- [ ] **Step 2: Write the failing reducer tests**

`test/engine/reducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { build, nominated, pv, settings, sold } from '../helpers'

const V = [pv('Alpha', 30), pv('Bravo', 20)]

describe('reduce', () => {
  it('a nomination puts the player on the block with the nominator leading', () => {
    expect(build(settings(), V, [nominated('Alpha', 2, 1)]).live).toEqual({ playerKey: 'alpha', price: 1, leaderId: 2 })
  })

  it('higher bids move price and leader; equal or lower bids are ignored', () => {
    const s = build(settings(), V, [nominated('Alpha', 2, 1), { type: 'bid', teamId: 3, amount: 5 }, { type: 'bid', teamId: 4, amount: 5 }, { type: 'bid', teamId: 4, amount: 3 }])
    expect(s.live).toEqual({ playerKey: 'alpha', price: 5, leaderId: 3 })
  })

  it('a bid with nothing on the block is ignored', () => {
    expect(build(settings(), V, [{ type: 'bid', teamId: 3, amount: 5 }]).live).toBeNull()
  })

  it('a sale records a sequence number, clears the block and ignores repeats', () => {
    const s = build(settings(), V, [nominated('Alpha', 2, 1), sold('Alpha', 3, 12), sold('Alpha', 4, 15)])
    expect(s.sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 3, price: 12 }])
    expect(s.live).toBeNull()
    expect(s.nextSeq).toBe(2)
  })

  it('nominating an already-sold player is ignored', () => {
    expect(build(settings(), V, [sold('Alpha', 3, 12), nominated('Alpha', 2, 1)]).live).toBeNull()
  })

  it('keeps sales of players missing from the values', () => {
    expect(build(settings(), V, [sold('Ghost', 2, 3)]).sales[0].playerKey).toBe('ghost')
  })

  it('undo removes the last sale and is a no-op with none', () => {
    expect(build(settings(), V, [sold('Alpha', 3, 12), sold('Bravo', 2, 9), { type: 'undo' }]).sales.map((x) => x.playerKey)).toEqual(['alpha'])
    expect(build(settings(), V, [{ type: 'undo' }]).sales).toEqual([])
  })

  it('editSale fixes team and price', () => {
    const s = build(settings(), V, [sold('Alpha', 3, 12), { type: 'editSale', seq: 1, teamId: 4, price: 14 }])
    expect(s.sales[0]).toEqual({ seq: 1, playerKey: 'alpha', teamId: 4, price: 14 })
  })

  it('toggleTarget adds then removes', () => {
    const t = { type: 'toggleTarget', playerKey: 'bravo' } as const
    expect(build(settings(), V, [t]).targets).toEqual(['bravo'])
    expect(build(settings(), V, [t, t]).targets).toEqual([])
  })

  it('setValue floors at $1 and creates an entry for an unknown player', () => {
    const s = build(settings(), V, [{ type: 'setValue', playerKey: 'alpha', b: 0 }, { type: 'setValue', playerKey: 'ghost', b: 7 }])
    expect(s.values.alpha.b).toBe(1)
    expect(s.values.ghost).toMatchObject({ key: 'ghost', name: 'ghost', b: 7, tier: 5 })
  })

  it('setMyTeam', () => {
    expect(build(settings(), V, [{ type: 'setMyTeam', teamId: 3 }], null).myTeamId).toBe(3)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/engine/reducer.test.ts`
Expected: FAIL, cannot resolve `../src/engine/reducer`.

- [ ] **Step 4: Implement the reducer**

`src/engine/reducer.ts`:

```ts
import { UTIL_SLOT } from '../espn/slots'
import type { PlayerValue } from '../values/types'
import type { DraftEvent, DraftState, Settings } from './types'

/** Stand-in for a player missing from values.json (rookie call-up, unknown ESPN id). */
export function placeholderValue(key: string, b = 1): PlayerValue {
  return { key, espnId: null, name: key, slots: [UTIL_SLOT], b, consensus: 0, market: 0, josh: null, avoid: false, tier: 5 }
}

export function initialState(settings: Settings, values: PlayerValue[], myTeamId: number | null = null): DraftState {
  return { settings, myTeamId, values: Object.fromEntries(values.map((v) => [v.key, v])), sales: [], live: null, targets: [], nextSeq: 1 }
}

const isSold = (s: DraftState, key: string) => s.sales.some((x) => x.playerKey === key)

export function reduce(s: DraftState, ev: DraftEvent): DraftState {
  switch (ev.type) {
    case 'nominated':
      if (isSold(s, ev.playerKey)) return s
      return { ...s, live: { playerKey: ev.playerKey, price: ev.amount, leaderId: ev.teamId } }
    case 'bid':
      if (!s.live || ev.amount <= s.live.price) return s
      return { ...s, live: { ...s.live, price: ev.amount, leaderId: ev.teamId } }
    case 'sold':
      if (isSold(s, ev.playerKey)) return s
      return {
        ...s,
        live: null,
        nextSeq: s.nextSeq + 1,
        sales: [...s.sales, { seq: s.nextSeq, playerKey: ev.playerKey, teamId: ev.teamId, price: ev.price }],
      }
    case 'undo':
      return s.sales.length ? { ...s, live: null, sales: s.sales.slice(0, -1) } : s
    case 'editSale':
      return { ...s, sales: s.sales.map((x) => (x.seq === ev.seq ? { ...x, teamId: ev.teamId, price: ev.price } : x)) }
    case 'setMyTeam':
      return { ...s, myTeamId: ev.teamId }
    case 'toggleTarget':
      return {
        ...s,
        targets: s.targets.includes(ev.playerKey) ? s.targets.filter((k) => k !== ev.playerKey) : [...s.targets, ev.playerKey],
      }
    case 'setValue': {
      const current = s.values[ev.playerKey] ?? placeholderValue(ev.playerKey)
      return { ...s, values: { ...s.values, [ev.playerKey]: { ...current, b: Math.max(1, ev.b) } } }
    }
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/engine/reducer.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/espn/slots.ts src/engine/types.ts src/engine/reducer.ts test/helpers.ts test/engine/reducer.test.ts
git commit -m "feat(helper): draft state reducer for nominations, bids and sales" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Budgets, inflation, room temperature, sale flags

**Files:**
- Create: `espn-auction-helper/src/engine/constants.ts`
- Create: `espn-auction-helper/src/engine/metrics.ts`
- Test: `espn-auction-helper/test/engine/metrics.test.ts`

**Interfaces:**
- Consumes: `DraftState`, `Sale` (Task 6), `placeholderValue` (Task 6), `PlayerValue` (Task 4).
- Produces (all in `src/engine/metrics.ts` unless noted):
  - every tunable in `src/engine/constants.ts` (listed in Step 3)
  - `valueOf(s: DraftState, key: string): PlayerValue`
  - `interface TeamSummary { id: number; name: string; budgetLeft: number; open: number; maxBid: number; perSlot: number; roster: Sale[] }`
  - `teamSummary(s, teamId): TeamSummary`, `allTeams(s): TeamSummary[]`
  - `soldKeys(s): Set<string>`, `available(s): PlayerValue[]` (unsold, b desc)
  - `inflation(s): number` (clamped to [0.8, 1.2])
  - `type TempLabel = 'Reading room' | 'Hot' | 'Warm' | 'Neutral' | 'Cold'`, `interface Temperature { T: number | null; label: TempLabel }`, `temperature(s): Temperature`
  - `adjustedValue(s, key, I?: number, label?: TempLabel): number`
  - `interface MyBudget { budgetLeft: number; open: number; reserve: number; core: number; perSlot: number; safeMax: number; hardMax: number }`, `myBudget(s): MyBudget | null`
  - `saleFlags(s): Map<number, { bargain: boolean }>` keyed by sale seq

- [ ] **Step 1: Write the failing tests**

`test/engine/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adjustedValue, available, inflation, myBudget, saleFlags, teamSummary, temperature } from '../../src/engine/metrics'
import type { DraftEvent } from '../../src/engine/types'
import { build, pv, settings, sold } from '../helpers'

const small = settings(2, { budget: 100, rosterSize: 3 })

describe('teamSummary', () => {
  it('derives budget, open slots, max bid and per-slot money from sales', () => {
    const s = build(small, [pv('A', 40)], [sold('A', 1, 40)])
    expect(teamSummary(s, 1)).toMatchObject({ name: 'T1', budgetLeft: 60, open: 2, maxBid: 59, perSlot: 30 })
    expect(teamSummary(s, 9).name).toBe('Team 9')
  })
})

describe('available', () => {
  it('drops sold players and sorts by value', () => {
    const s = build(small, [pv('A', 10), pv('B', 30), pv('C', 20)], [sold('B', 2, 30)])
    expect(available(s).map((v) => v.name)).toEqual(['C', 'A'])
  })
})

describe('inflation', () => {
  it('is (money left - open slots) / surplus of the best remaining players', () => {
    const s = build(small, ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => pv(n, [80, 60, 40, 20, 10, 5][i])), [])
    expect(inflation(s)).toBeCloseTo(194 / 209, 6)
  })

  it('clamps to [0.8, 1.2] and is 1 with no surplus left', () => {
    expect(inflation(build(small, [pv('A', 2)], []))).toBe(1.2)
    expect(inflation(build(small, [pv('A', 200), pv('B', 200)], []))).toBe(0.8)
    expect(inflation(build(small, [pv('A', 1)], []))).toBe(1)
  })
})

describe('temperature', () => {
  const four = ['P1', 'P2', 'P3', 'P4'].map((n) => pv(n, 100))
  const sellAll = (price: number): DraftEvent[] => ['P1', 'P2', 'P3', 'P4'].map((n, i) => sold(n, i + 1, price))

  it('needs 4 sales of $5+ players before reading the room', () => {
    const t = temperature(build(settings(), four, sellAll(100).slice(0, 3)))
    expect(t).toEqual({ T: null, label: 'Reading room' })
  })

  it.each([
    [106, 'Hot'],
    [103, 'Warm'],
    [100, 'Neutral'],
    [94, 'Cold'],
  ])('price %i on $100 players -> %s', (price, label) => {
    expect(temperature(build(settings(), four, sellAll(price))).label).toBe(label)
  })

  it('ignores players under $5', () => {
    const s = build(settings(), [...four, pv('Cheap', 2)], [...sellAll(100), sold('Cheap', 1, 50)])
    expect(temperature(s).label).toBe('Neutral')
  })

  it('only looks at the last 12 qualifying sales', () => {
    const names = Array.from({ length: 13 }, (_, i) => `Q${i}`)
    const events = names.map((n, i) => sold(n, (i % 4) + 1, i === 0 ? 50 : 10))
    expect(temperature(build(settings(), names.map((n) => pv(n, 10)), events)).label).toBe('Neutral')
  })
})

describe('adjustedValue', () => {
  const hotRoom = (extra: ReturnType<typeof pv>[]) =>
    build(settings(), [...['P1', 'P2', 'P3', 'P4'].map((n) => pv(n, 100)), ...extra], ['P1', 'P2', 'P3', 'P4'].map((n, i) => sold(n, i + 1, 106)))

  it('in a Hot room stars (tier <= 2) get no inflation credit', () => {
    const s = hotRoom([pv('Star', 50, { tier: 1 }), pv('Mid', 50, { tier: 3 })])
    expect(adjustedValue(s, 'star')).toBe(50)
    expect(adjustedValue(s, 'mid')).toBeCloseTo(1 + 49 * 1.2, 6)
  })

  it('accepts explicit inflation and label', () => {
    const s = hotRoom([pv('Mid', 50)])
    expect(adjustedValue(s, 'mid', 1, 'Neutral')).toBe(50)
  })

  it('treats unknown players as $1', () => {
    expect(adjustedValue(build(settings(), [], []), 'ghost')).toBe(1)
  })
})

describe('myBudget', () => {
  it('reserves 2 flyer slots and spreads the rest over core slots', () => {
    expect(myBudget(build(settings(), [], []))).toEqual({ budgetLeft: 200, open: 13, reserve: 2, core: 11, perSlot: 18, safeMax: 188, hardMax: 188 })
  })

  it('with only flyer slots left, safe max is the ESPN max bid', () => {
    const fillers = Array.from({ length: 11 }, (_, i) => sold(`F${i}`, 1, 10))
    expect(myBudget(build(settings(), [], fillers))).toEqual({ budgetLeft: 90, open: 2, reserve: 2, core: 0, perSlot: 0, safeMax: 89, hardMax: 89 })
  })

  it('a full roster has zero to spend and no NaN', () => {
    const fillers = Array.from({ length: 13 }, (_, i) => sold(`F${i}`, 1, 1))
    expect(myBudget(build(settings(), [], fillers))).toEqual({ budgetLeft: 187, open: 0, reserve: 0, core: 0, perSlot: 0, safeMax: 0, hardMax: 0 })
  })

  it('is null without my team', () => {
    expect(myBudget(build(settings(), [], [], null))).toBeNull()
  })
})

describe('saleFlags', () => {
  it('flags a star sold at or under 95% of its adjusted value at that moment', () => {
    const one = settings(1, { budget: 100, rosterSize: 2 })
    const s = build(one, [pv('Star', 60, { tier: 1 }), pv('Other', 41, { tier: 2 })], [sold('Star', 1, 50), sold('Other', 1, 48)])
    const flags = saleFlags(s)
    expect(flags.get(1)).toEqual({ bargain: true })
    expect(flags.get(2)).toEqual({ bargain: false })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/engine/metrics.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement constants and metrics**

`src/engine/constants.ts`:

```ts
// Tunables. Values validated on the Josh Lloyd replay (spec §9).
export const INFLATION_MIN = 0.8
export const INFLATION_MAX = 1.2
export const TEMP_WINDOW = 12
export const TEMP_MIN_SALES = 4
export const TEMP_MIN_VALUE = 5
export const HOT = 1.05
export const WARM = 1.02
export const COLD = 0.95
export const STAR_TIER_MAX = 2
export const BARGAIN_RATIO = 0.95
export const BID_GAP_MIN = 3
export const BID_GAP_FRACTION = 0.25
export const BID_UP_MARGIN = 2
export const NEED_BOOST = 1.1
export const THIN_FACTOR = 1.5
export const NEED_MIN_VALUE = 5
export const ONE_PLAYER_SHARE = 0.35
export const TWO_PLAYER_SHARE = 0.7
export const EARLY_MONEY = 0.6
export const DOLLAR_MONEY = 0.15
export const DECOY_MARKET_RATIO = 1.1
export const TARGET_BAND = 0.5
export const TARGET_LIMIT = 10
```

`src/engine/metrics.ts`:

```ts
import type { PlayerValue } from '../values/types'
import {
  BARGAIN_RATIO, COLD, HOT, INFLATION_MAX, INFLATION_MIN, STAR_TIER_MAX, TEMP_MIN_SALES, TEMP_MIN_VALUE, TEMP_WINDOW, WARM,
} from './constants'
import { placeholderValue } from './reducer'
import type { DraftState, Sale } from './types'

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export function valueOf(s: DraftState, key: string): PlayerValue {
  return s.values[key] ?? placeholderValue(key)
}

export interface TeamSummary {
  id: number
  name: string
  budgetLeft: number
  open: number
  maxBid: number
  perSlot: number
  roster: Sale[]
}

export function teamSummary(s: DraftState, teamId: number): TeamSummary {
  const roster = s.sales.filter((x) => x.teamId === teamId)
  const budgetLeft = s.settings.budget - sum(roster.map((x) => x.price))
  const open = Math.max(0, s.settings.rosterSize - roster.length)
  return {
    id: teamId,
    name: s.settings.teams.find((t) => t.id === teamId)?.name ?? `Team ${teamId}`,
    budgetLeft,
    open,
    maxBid: open > 0 ? Math.max(0, budgetLeft - (open - 1)) : 0,
    perSlot: open > 0 ? budgetLeft / open : 0,
    roster,
  }
}

export const allTeams = (s: DraftState): TeamSummary[] => s.settings.teams.map((t) => teamSummary(s, t.id))

export const soldKeys = (s: DraftState): Set<string> => new Set(s.sales.map((x) => x.playerKey))

export function available(s: DraftState): PlayerValue[] {
  const sold = soldKeys(s)
  return Object.values(s.values).filter((v) => !sold.has(v.key)).sort((a, b) => b.b - a.b)
}

export function inflation(s: DraftState): number {
  const teams = allTeams(s)
  const money = sum(teams.map((t) => t.budgetLeft))
  const open = sum(teams.map((t) => t.open))
  const surplus = sum(available(s).slice(0, open).map((v) => v.b - 1))
  if (surplus <= 0) return 1
  return Math.min(INFLATION_MAX, Math.max(INFLATION_MIN, (money - open) / surplus))
}

export type TempLabel = 'Reading room' | 'Hot' | 'Warm' | 'Neutral' | 'Cold'
export interface Temperature {
  T: number | null
  label: TempLabel
}

export function temperature(s: DraftState): Temperature {
  const window = s.sales.filter((x) => valueOf(s, x.playerKey).b >= TEMP_MIN_VALUE).slice(-TEMP_WINDOW)
  if (window.length < TEMP_MIN_SALES) return { T: null, label: 'Reading room' }
  const T = sum(window.map((x) => x.price)) / sum(window.map((x) => valueOf(s, x.playerKey).b))
  return { T, label: T > HOT ? 'Hot' : T > WARM ? 'Warm' : T >= COLD ? 'Neutral' : 'Cold' }
}

export function adjustedValue(s: DraftState, key: string, I = inflation(s), label: TempLabel = temperature(s).label): number {
  const v = valueOf(s, key)
  if (label === 'Hot' && v.tier <= STAR_TIER_MAX) return v.b
  return 1 + (v.b - 1) * I
}

export interface MyBudget {
  budgetLeft: number
  open: number
  reserve: number
  core: number
  perSlot: number
  safeMax: number
  hardMax: number
}

export function myBudget(s: DraftState): MyBudget | null {
  if (s.myTeamId === null) return null
  const t = teamSummary(s, s.myTeamId)
  const reserve = Math.min(s.settings.flyerReserve, t.open)
  const core = t.open - reserve
  return {
    budgetLeft: t.budgetLeft,
    open: t.open,
    reserve,
    core,
    perSlot: core > 0 ? (t.budgetLeft - reserve) / core : 0,
    safeMax: core >= 1 ? Math.max(0, t.budgetLeft - reserve - (core - 1)) : t.maxBid,
    hardMax: t.maxBid,
  }
}

/** Replays the sales, judging each against the room as it stood just before it. */
export function saleFlags(s: DraftState): Map<number, { bargain: boolean }> {
  const out = new Map<number, { bargain: boolean }>()
  let before: DraftState = { ...s, sales: [], live: null }
  for (const sale of s.sales) {
    const a = adjustedValue(before, sale.playerKey)
    out.set(sale.seq, { bargain: valueOf(s, sale.playerKey).tier <= STAR_TIER_MAX && sale.price <= BARGAIN_RATIO * a })
    before = { ...before, sales: [...before.sales, sale] }
  }
  return out
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/engine/metrics.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/constants.ts src/engine/metrics.ts test/engine/metrics.test.ts
git commit -m "feat(helper): budgets, inflation and room temperature" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Positional need boost

**Files:**
- Create: `espn-auction-helper/src/engine/need.ts`
- Test: `espn-auction-helper/test/engine/need.test.ts`

**Interfaces:**
- Consumes: `available`, `valueOf` (Task 7); `NEED_BOOST`, `NEED_MIN_VALUE`, `THIN_FACTOR` (Task 7); `BENCH_SLOT`, `IR_SLOT` (Task 6).
- Produces:
  - `startingSlots(counts: Record<number, number>): number[]` (expanded, ascending, no bench/IR)
  - `maxMatching(players: number[][], slots: number[]): { size: number; unfilled: number[] }`
  - `needBoost(s: DraftState, playerKey: string): number` (1.10 or 1)

- [ ] **Step 1: Write the failing tests**

`test/engine/need.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { maxMatching, needBoost, startingSlots } from '../../src/engine/need'
import { build, pv, settings, sold } from '../helpers'

describe('startingSlots', () => {
  it('expands counts and drops bench and IR', () => {
    expect(startingSlots({ 11: 3, 0: 1, 4: 2, 12: 3, 13: 1 })).toEqual([0, 4, 4, 11, 11, 11])
  })
})

describe('maxMatching', () => {
  it('re-routes earlier players to fill more slots', () => {
    expect(maxMatching([[0, 11], [0]], [0, 11])).toEqual({ size: 2, unfilled: [] })
  })

  it('reports unfilled slots', () => {
    expect(maxMatching([[0]], [0, 4])).toEqual({ size: 1, unfilled: [4] })
  })
})

describe('needBoost', () => {
  const S = settings(2, { lineupSlotCounts: { 4: 1, 11: 1, 12: 1 }, rosterSize: 3 })
  const C = (n: string, b: number) => pv(n, b, { slots: [4, 11] })
  const G = (n: string) => pv(n, 10, { slots: [0, 11] })
  const guards = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map(G)

  it('boosts a player who fills my open slot when that position is thin', () => {
    expect(needBoost(build(S, [C('C1', 20), C('C2', 10), ...guards], []), 'c1')).toBe(1.1)
  })

  it('no boost when the position is deep', () => {
    const centers = ['C2', 'C3', 'C4', 'C5', 'C6'].map((n) => C(n, 10))
    expect(needBoost(build(S, [C('C1', 20), ...centers, ...guards], []), 'c1')).toBe(1)
  })

  it('no boost when my starting slots are already full', () => {
    const s = build(S, [C('C1', 20), C('C2', 10), ...guards], [sold('C2', 1, 5), sold('G1', 1, 5)])
    expect(needBoost(s, 'c1')).toBe(1)
  })

  it('no boost without my team', () => {
    expect(needBoost(build(S, [C('C1', 20)], [], null), 'c1')).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/engine/need.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/engine/need.ts`:

```ts
import { BENCH_SLOT, IR_SLOT } from '../espn/slots'
import { NEED_BOOST, NEED_MIN_VALUE, THIN_FACTOR } from './constants'
import { available, valueOf } from './metrics'
import type { DraftState } from './types'

export function startingSlots(counts: Record<number, number>): number[] {
  const out: number[] = []
  for (const [id, n] of Object.entries(counts)) {
    const slot = Number(id)
    if (slot === BENCH_SLOT || slot === IR_SLOT) continue
    for (let i = 0; i < n; i++) out.push(slot)
  }
  // Specific positions (0-4) come before flexible ones, so "unfilled" names the real hole.
  return out.sort((a, b) => a - b)
}

/** Bipartite matching (Kuhn's algorithm) of players' eligible slots onto lineup slots. */
export function maxMatching(players: number[][], slots: number[]): { size: number; unfilled: number[] } {
  const owner = new Array<number>(slots.length).fill(-1)
  const assign = (p: number, seen: boolean[]): boolean => {
    for (let j = 0; j < slots.length; j++) {
      if (seen[j] || !players[p].includes(slots[j])) continue
      seen[j] = true
      if (owner[j] === -1 || assign(owner[j], seen)) {
        owner[j] = p
        return true
      }
    }
    return false
  }
  let size = 0
  for (let p = 0; p < players.length; p++) if (assign(p, new Array<boolean>(slots.length).fill(false))) size++
  return { size, unfilled: slots.filter((_, j) => owner[j] === -1) }
}

const rosterSlots = (s: DraftState, teamId: number) => s.sales.filter((x) => x.teamId === teamId).map((x) => valueOf(s, x.playerKey).slots)

export function needBoost(s: DraftState, playerKey: string): number {
  if (s.myTeamId === null) return 1
  const slots = startingSlots(s.settings.lineupSlotCounts)
  const mine = rosterSlots(s, s.myTeamId)
  const before = maxMatching(mine, slots)
  const candidate = valueOf(s, playerKey).slots
  if (maxMatching([...mine, candidate], slots).size <= before.size) return 1

  const needed = [...new Set(before.unfilled.filter((slot) => candidate.includes(slot)))]
  const supplyPool = available(s).filter((v) => v.key !== playerKey && v.b >= NEED_MIN_VALUE)
  const demand = new Map<number, number>()
  for (const t of s.settings.teams) {
    for (const slot of maxMatching(rosterSlots(s, t.id), slots).unfilled) demand.set(slot, (demand.get(slot) ?? 0) + 1)
  }
  const thin = needed.some((slot) => supplyPool.filter((v) => v.slots.includes(slot)).length < THIN_FACTOR * (demand.get(slot) ?? 0))
  return thin ? NEED_BOOST : 1
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/engine/need.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/need.ts test/engine/need.test.ts
git commit -m "feat(helper): positional need boost via lineup matching" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ceiling and verdict for the player on the block

**Files:**
- Create: `espn-auction-helper/src/engine/verdict.ts`
- Test: `espn-auction-helper/test/engine/verdict.test.ts`

**Interfaces:**
- Consumes: Task 7 metrics (`adjustedValue`, `inflation`, `temperature`, `myBudget`, `teamSummary`, `valueOf`), `needBoost` (Task 8), constants.
- Produces:
  - `ceilingFor(s: DraftState, key: string, a?: number): number` (integer ≥ 0)
  - `concentrationWarnings(s: DraftState, winPrice: number): string[]` (messages start with `One player` or `Two players`)
  - `type VerdictKind = 'BID' | 'BID_UP' | 'LET_THEM' | 'PASS' | 'LEADING'`
  - `interface Verdict { kind: VerdictKind; playerKey: string; name: string; price: number; leaderId: number; adjusted: number; ceiling: number; boost: number; pushTo: number | null; rivalPerSlotAfter: number | null; warnings: string[]; unvalued: boolean }`
  - `verdict(s: DraftState): Verdict | null` (null with no live player or no my-team)

- [ ] **Step 1: Write the failing tests**

`test/engine/verdict.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DraftEvent } from '../../src/engine/types'
import { ceilingFor, verdict } from '../../src/engine/verdict'
import { build, nominated, pv, settings, sold } from '../helpers'

// All-bench lineup: no starting slots, so need boost is always 1.
// 4 teams x $200 chasing 3 valued players keeps inflation pinned at 1.2: Alpha a = 1 + 29 * 1.2 = 35.8.
const S = settings(4, { lineupSlotCounts: { 12: 13 } })
const V = [pv('Alpha', 30), pv('Bravo', 30, { avoid: true }), pv('Star', 70, { tier: 1 })]
const at = (events: DraftEvent[], me: number | null = 1) => build(S, V, events, me)
const bid = (teamId: number, amount: number): DraftEvent => ({ type: 'bid', teamId, amount })

describe('verdict', () => {
  it('is null with nothing on the block or without my team', () => {
    expect(verdict(at([]))).toBeNull()
    expect(verdict(at([nominated('Alpha', 2, 1)], null))).toBeNull()
  })

  it('BID up to the ceiling while the price is far under value', () => {
    const v = verdict(at([nominated('Alpha', 2, 1)]))!
    expect(v.kind).toBe('BID')
    expect(v.adjusted).toBeCloseTo(35.8, 6)
    expect(v.ceiling).toBe(35)
  })

  it('BID UP to a safe level once the gap is small', () => {
    expect(verdict(at([nominated('Alpha', 2, 1), bid(3, 30)]))).toMatchObject({ kind: 'BID_UP', pushTo: 33 })
  })

  it('PASS around value', () => {
    expect(verdict(at([nominated('Alpha', 2, 1), bid(3, 34)]))!.kind).toBe('PASS')
  })

  it('LET THEM when a rival pays over value, showing their money per slot afterwards', () => {
    const v = verdict(at([nominated('Alpha', 2, 1), bid(3, 36)]))!
    expect(v.kind).toBe('LET_THEM')
    expect(v.rivalPerSlotAfter).toBeCloseTo((200 - 36) / 12, 6)
  })

  it('a pinned target gets BID even when the gap is small', () => {
    expect(verdict(at([{ type: 'toggleTarget', playerKey: 'alpha' }, nominated('Alpha', 2, 1), bid(3, 30)]))!.kind).toBe('BID')
  })

  it('LEADING when I am the high bidder', () => {
    expect(verdict(at([nominated('Alpha', 1, 5)]))!.kind).toBe('LEADING')
  })

  it('never BIDs on an avoid player', () => {
    expect(verdict(at([nominated('Bravo', 2, 5)]))!.kind).toBe('PASS')
    expect(verdict(at([nominated('Bravo', 2, 5), bid(3, 40)]))!.kind).toBe('LET_THEM')
  })

  it('a player missing from values is priced at $1 and flagged', () => {
    const v = verdict(at([nominated('Ghost', 2, 1)]))!
    expect(v).toMatchObject({ kind: 'PASS', unvalued: true, ceiling: 1, name: 'ghost' })
  })

  it('the ceiling never exceeds my safe max', () => {
    const fillers = Array.from({ length: 10 }, (_, i) => sold(`F${i}`, 1, 18))
    expect(verdict(at([...fillers, nominated('Alpha', 2, 1)]))).toMatchObject({ kind: 'BID', ceiling: 18 })
  })

  it('the ceiling is 0, never negative, on a full roster', () => {
    const fillers = Array.from({ length: 13 }, (_, i) => sold(`F${i}`, 1, 1))
    expect(ceilingFor(at(fillers), 'alpha')).toBe(0)
  })

  it('warns about stars-and-scrubs concentration', () => {
    const two = verdict(at([sold('Star', 1, 80), nominated('Alpha', 2, 60)]))!
    expect(two.warnings.some((w) => w.startsWith('Two players'))).toBe(true)
    const one = verdict(at([nominated('Alpha', 2, 70)]))!
    expect(one.warnings.some((w) => w.startsWith('One player'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/engine/verdict.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/engine/verdict.ts`:

```ts
import { BID_GAP_FRACTION, BID_GAP_MIN, BID_UP_MARGIN, ONE_PLAYER_SHARE, TWO_PLAYER_SHARE } from './constants'
import { adjustedValue, inflation, myBudget, teamSummary, temperature, valueOf } from './metrics'
import { needBoost } from './need'
import type { DraftState } from './types'

export type VerdictKind = 'BID' | 'BID_UP' | 'LET_THEM' | 'PASS' | 'LEADING'

export interface Verdict {
  kind: VerdictKind
  playerKey: string
  name: string
  price: number
  leaderId: number
  adjusted: number
  ceiling: number
  boost: number
  pushTo: number | null
  rivalPerSlotAfter: number | null
  warnings: string[]
  unvalued: boolean
}

/** Most I should pay: adjusted value (with positional need), capped by what keeps my roster fillable. */
export function ceilingFor(s: DraftState, key: string, a = adjustedValue(s, key)): number {
  const mb = myBudget(s)
  if (!mb) return 0
  return Math.max(0, Math.floor(Math.min(a * needBoost(s, key), mb.safeMax)))
}

export function concentrationWarnings(s: DraftState, winPrice: number): string[] {
  if (s.myTeamId === null) return []
  const budget = s.settings.budget
  const prices = s.sales.filter((x) => x.teamId === s.myTeamId).map((x) => x.price)
  const top = prices.length ? Math.max(...prices) : 0
  const out: string[] = []
  if (winPrice > ONE_PLAYER_SHARE * budget) out.push(`One player at $${winPrice} is over ${ONE_PLAYER_SHARE * 100}% of your $${budget} budget`)
  if (top > 0 && winPrice + top > TWO_PLAYER_SHARE * budget) {
    out.push(`Two players ($${top} + $${winPrice}) would be over ${TWO_PLAYER_SHARE * 100}% of your budget: no margin for error`)
  }
  return out
}

export function verdict(s: DraftState): Verdict | null {
  const live = s.live
  if (!live || !myBudget(s)) return null
  const v = valueOf(s, live.playerKey)
  const a = adjustedValue(s, live.playerKey, inflation(s), temperature(s).label)
  const ceiling = ceilingFor(s, live.playerKey, a)
  const base = {
    playerKey: live.playerKey,
    name: v.name,
    price: live.price,
    leaderId: live.leaderId,
    adjusted: a,
    ceiling,
    boost: needBoost(s, live.playerKey),
    pushTo: null,
    rivalPerSlotAfter: null,
    warnings: concentrationWarnings(s, live.price + 1),
    unvalued: !(live.playerKey in s.values),
  }
  const letThem = (): Verdict => {
    const r = teamSummary(s, live.leaderId)
    return { ...base, kind: 'LET_THEM', rivalPerSlotAfter: r.open > 1 ? (r.budgetLeft - live.price) / (r.open - 1) : 0 }
  }

  if (live.leaderId === s.myTeamId) return { ...base, kind: 'LEADING', warnings: concentrationWarnings(s, live.price) }
  if (v.avoid) return live.price > a ? letThem() : { ...base, kind: 'PASS' }
  const isTarget = s.targets.includes(live.playerKey)
  if (live.price < ceiling && (isTarget || a - live.price >= Math.max(BID_GAP_MIN, BID_GAP_FRACTION * a))) return { ...base, kind: 'BID' }
  const pushTo = Math.min(ceiling, Math.floor(a - BID_UP_MARGIN))
  if (live.price < pushTo) return { ...base, kind: 'BID_UP', pushTo }
  if (live.price > a) return letThem()
  return { ...base, kind: 'PASS' }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/engine/verdict.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/verdict.ts test/engine/verdict.test.ts
git commit -m "feat(helper): live bid ceiling and BID/BID UP/LET THEM/PASS verdict" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Nomination suggestion and targets list

**Files:**
- Create: `espn-auction-helper/src/engine/nominate.ts`
- Create: `espn-auction-helper/src/engine/targets.ts`
- Test: `espn-auction-helper/test/engine/nominate.test.ts`
- Test: `espn-auction-helper/test/engine/targets.test.ts`

**Interfaces:**
- Consumes: Task 7 metrics, `ceilingFor` (Task 9), constants.
- Produces:
  - `rivals(s): TeamSummary[]`, `rivalsAbove(s, ceiling: number): TeamSummary[]` (rivals whose max bid > ceiling)
  - `type Phase = 'early' | 'mid' | 'dollar'`, `nominationPhase(s): Phase`
  - `interface Nomination { phase: Phase; playerKey: string; name: string; reason: string }`, `suggestNomination(s): Nomination | null`
  - `interface TargetRow { playerKey: string; name: string; adjusted: number; expected: number; gap: number; ceiling: number; pinned: boolean; outbidBy: string[] }`, `targetList(s, limit?: number): TargetRow[]`

- [ ] **Step 1: Write the failing tests**

`test/engine/nominate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nominationPhase, suggestNomination } from '../../src/engine/nominate'
import type { DraftEvent } from '../../src/engine/types'
import { build, pv, settings, sold } from '../helpers'

const S2 = settings(2, { budget: 100, rosterSize: 3, lineupSlotCounts: { 12: 3 } })
const S3 = settings(3, { budget: 100, rosterSize: 3, lineupSlotCounts: { 12: 3 } })
const V = [pv('Decoy', 20, { market: 30 }), pv('Dud', 25, { market: 20 }), pv('Target', 15, { market: 15 })]
const pin: DraftEvent = { type: 'toggleTarget', playerKey: 'target' }

describe('nominationPhase', () => {
  it('early while the room still holds over 60% of its money', () => {
    expect(nominationPhase(build(S2, V, []))).toBe('early')
  })
  it('mid between 15% and 60%', () => {
    expect(nominationPhase(build(S2, V, [sold('F1', 2, 60), sold('F2', 2, 30)]))).toBe('mid')
  })
  it('dollar once no rival can bid over $2', () => {
    expect(nominationPhase(build(S2, V, [sold('F1', 2, 99)]))).toBe('dollar')
  })
})

describe('suggestNomination', () => {
  it('early: the best player the room overpays for (market > 1.1 x my value)', () => {
    expect(suggestNomination(build(S2, V, []))).toMatchObject({ phase: 'early', name: 'Decoy' })
  })

  it('early with no overpaid player: best player I am not targeting', () => {
    const s = build(S2, [pv('A', 20, { market: 10 }), pv('B', 10, { market: 5 })], [])
    expect(suggestNomination(s)).toMatchObject({ name: 'A', reason: expect.stringContaining('not targeting') })
  })

  it('mid: my target once at most one rival can outbid my ceiling', () => {
    expect(suggestNomination(build(S2, V, [pin, sold('F1', 2, 60), sold('F2', 2, 30)]))).toMatchObject({ phase: 'mid', name: 'Target' })
  })

  it('mid: a decoy while two rivals can still outbid me', () => {
    const s = build(S3, V, [pin, sold('F1', 2, 40), sold('F2', 3, 40), sold('F3', 1, 60)])
    expect(suggestNomination(s)).toMatchObject({ phase: 'mid', name: 'Decoy' })
  })

  it('dollar: my target when no rival can bid over $1', () => {
    expect(suggestNomination(build(S2, V, [pin, sold('F1', 2, 99)]))).toMatchObject({ phase: 'dollar', name: 'Target', reason: expect.stringContaining('$1') })
  })

  it('is null without my team', () => {
    expect(suggestNomination(build(S2, V, [], null))).toBeNull()
  })
})
```

`test/engine/targets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { targetList } from '../../src/engine/targets'
import { build, pv, settings } from '../helpers'

// Me: 6 spots, 2 flyers -> 4 core slots, $98 / 4 = $24.5 per slot -> band $12.25-$36.75. Inflation pinned at 1.2.
const S = settings(2, { budget: 100, rosterSize: 6, lineupSlotCounts: { 12: 6 } })
const V = [pv('X1', 30), pv('X2', 20), pv('X3', 5), pv('X4', 80), pv('X5', 25, { avoid: true })]

describe('targetList', () => {
  it('lists players priced near my per-slot money, best value gap first, pinned on top', () => {
    const rows = targetList(build(S, V, [{ type: 'toggleTarget', playerKey: 'x3' }]))
    expect(rows.map((r) => r.name)).toEqual(['X3', 'X1', 'X2'])
    expect(rows[1]).toMatchObject({ pinned: false, ceiling: 35, outbidBy: ['T2'] })
    expect(rows[1].gap).toBeCloseTo(0.2 * 29, 6)
  })

  it('is empty without my team', () => {
    expect(targetList(build(S, V, [], null))).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/engine/nominate.test.ts test/engine/targets.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/engine/nominate.ts`:

```ts
import { DECOY_MARKET_RATIO, DOLLAR_MONEY, EARLY_MONEY } from './constants'
import { allTeams, available, type TeamSummary } from './metrics'
import type { DraftState } from './types'
import { ceilingFor } from './verdict'

export const rivals = (s: DraftState): TeamSummary[] => allTeams(s).filter((t) => t.id !== s.myTeamId)
export const rivalsAbove = (s: DraftState, ceiling: number): TeamSummary[] => rivals(s).filter((t) => t.maxBid > ceiling)

export type Phase = 'early' | 'mid' | 'dollar'

export function nominationPhase(s: DraftState): Phase {
  const money = allTeams(s).reduce((sum, t) => sum + t.budgetLeft, 0)
  const ratio = money / (s.settings.teams.length * s.settings.budget)
  const r = rivals(s)
  if (ratio < DOLLAR_MONEY || (r.length > 0 && r.every((t) => t.maxBid <= 2))) return 'dollar'
  return ratio > EARLY_MONEY ? 'early' : 'mid'
}

export interface Nomination {
  phase: Phase
  playerKey: string
  name: string
  reason: string
}

export function suggestNomination(s: DraftState): Nomination | null {
  if (s.myTeamId === null) return null
  const avail = available(s)
  if (!avail.length) return null
  const phase = nominationPhase(s)
  const notMine = avail.filter((v) => !s.targets.includes(v.key))
  const targets = avail.filter((v) => s.targets.includes(v.key))

  const decoy = (): Nomination => {
    const overpaid = notMine.find((v) => v.market > DECOY_MARKET_RATIO * v.b)
    if (overpaid) {
      return { phase, playerKey: overpaid.key, name: overpaid.name, reason: `Room pays ~$${Math.round(overpaid.market)}, you value $${Math.round(overpaid.b)}: get money off the board` }
    }
    const best = notMine[0] ?? avail[0]
    return { phase, playerKey: best.key, name: best.name, reason: 'Best player you are not targeting: drain rival budgets' }
  }

  if (phase === 'early') return decoy()
  if (phase === 'mid') {
    const t = targets.find((v) => rivalsAbove(s, ceilingFor(s, v.key)).length <= 1)
    return t ? { phase, playerKey: t.key, name: t.name, reason: 'At most one rival can outbid your ceiling: nominate your target now' } : decoy()
  }
  if (rivals(s).every((r) => r.maxBid <= 1)) {
    const t = targets[0] ?? avail[0]
    return { phase, playerKey: t.key, name: t.name, reason: 'No rival can bid over $1: nominate him for $1' }
  }
  return decoy()
}
```

`src/engine/targets.ts`:

```ts
import { TARGET_BAND, TARGET_LIMIT } from './constants'
import { adjustedValue, available, inflation, myBudget, temperature } from './metrics'
import { rivalsAbove } from './nominate'
import type { DraftState } from './types'
import { ceilingFor } from './verdict'

export interface TargetRow {
  playerKey: string
  name: string
  adjusted: number
  expected: number
  gap: number
  ceiling: number
  pinned: boolean
  outbidBy: string[]
}

export function targetList(s: DraftState, limit = TARGET_LIMIT): TargetRow[] {
  const mb = myBudget(s)
  if (!mb) return []
  const temp = temperature(s)
  const I = inflation(s)
  const T = temp.T ?? 1
  const perSlot = mb.core > 0 ? mb.perSlot : mb.safeMax
  const lo = perSlot * (1 - TARGET_BAND)
  const hi = perSlot * (1 + TARGET_BAND)
  return available(s)
    .filter((v) => !v.avoid)
    .map((v) => ({ v, expected: v.b * T, pinned: s.targets.includes(v.key) }))
    .filter(({ expected, pinned }) => pinned || (expected >= lo && expected <= hi))
    .map(({ v, expected, pinned }) => {
      const adjusted = adjustedValue(s, v.key, I, temp.label)
      const ceiling = ceilingFor(s, v.key, adjusted)
      return { playerKey: v.key, name: v.name, adjusted, expected, gap: adjusted - expected, ceiling, pinned, outbidBy: rivalsAbove(s, ceiling).map((t) => t.name) }
    })
    .sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.gap - x.gap)
    .slice(0, limit)
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/engine && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/nominate.ts src/engine/targets.ts test/engine/nominate.test.ts test/engine/targets.test.ts
git commit -m "feat(helper): nomination strategy and value targets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `advise()` and the Josh Lloyd replay acceptance test

**Files:**
- Create: `espn-auction-helper/src/engine/advise.ts`
- Create: `espn-auction-helper/test/fixtures/josh-mock-sales.json` (copy)
- Test: `espn-auction-helper/test/engine/advise.test.ts`
- Test: `espn-auction-helper/test/replay.test.ts`

**Interfaces:**
- Consumes: everything in `src/engine/*` (Tasks 6-10), `assignTiers` (Task 4), `parseJoshCsv`/`joshMid` (Task 2), `EspnPlayer` (Task 3).
- Produces:
  - `interface FeedRow { seq: number; name: string; teamId: number; teamName: string; price: number; bargain: boolean }`
  - `interface Advice { budget: MyBudget | null; temperature: Temperature; inflation: number; verdict: Verdict | null; nomination: Nomination | null; targets: TargetRow[]; teams: TeamSummary[]; feed: FeedRow[] }`
  - `FEED_LIMIT = 15`, `advise(s: DraftState): Advice`

- [ ] **Step 1: Copy the replay fixture**

```bash
mkdir -p test/fixtures && cp ../docs/superpowers/research/josh-mock-sales.json test/fixtures/
```

- [ ] **Step 2: Write the failing tests**

`test/engine/advise.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { advise } from '../../src/engine/advise'
import { build, nominated, pv, settings, sold } from '../helpers'

describe('advise', () => {
  it('bundles every card, newest sale first', () => {
    const a = advise(build(settings(), [pv('Alpha', 30), pv('Bravo', 20)], [sold('Alpha', 2, 31), sold('Bravo', 3, 9)]))
    expect(a.feed.map((f) => [f.name, f.teamName, f.price])).toEqual([['Bravo', 'T3', 9], ['Alpha', 'T2', 31]])
    expect(a.verdict).toBeNull()
    expect(a.teams).toHaveLength(4)
    expect(a.budget).toMatchObject({ budgetLeft: 200 })
    expect(a.temperature.label).toBe('Reading room')
  })

  it('includes the verdict when a player is on the block', () => {
    expect(advise(build(settings(), [pv('Alpha', 30)], [nominated('Alpha', 2, 1)])).verdict?.kind).toBe('BID')
  })
})
```

`test/replay.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { saleFlags, temperature } from '../src/engine/metrics'
import { rivalsAbove } from '../src/engine/nominate'
import { initialState, reduce } from '../src/engine/reducer'
import type { DraftState, Settings } from '../src/engine/types'
import { ceilingFor, verdict } from '../src/engine/verdict'
import type { EspnPlayer } from '../src/espn/players'
import { ESPN_DEFAULT_COUNTS } from '../src/espn/slots'
import { joshMid, parseJoshCsv } from '../src/values/josh'
import { normalizeName } from '../src/values/names'
import { assignTiers } from '../src/values/tiers'
import type { PlayerValue } from '../src/values/types'

interface Fixture { teams: string[]; settings: { teams: number; budget: number; rosterSize: number }; sales: Array<{ player: string; team: string; price: number }> }
const fixture = JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as Fixture
const espn = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
const josh = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))

/** Josh's own numbers (12-team dollars); ESPN ROTO for players he never priced; $1 for caption-garbled names. */
function replayValues(): PlayerValue[] {
  const byKey = new Map<string, PlayerValue>()
  const blank = (key: string, name: string): PlayerValue => ({ key, espnId: null, name, slots: [11], b: 1, consensus: 0, market: 0, josh: null, avoid: false, tier: 0 })
  for (const p of espn) {
    const key = normalizeName(p.name)
    byKey.set(key, { ...blank(key, p.name), espnId: p.id, slots: p.slots, b: Math.max(1, p.roto), consensus: p.roto, market: p.market })
  }
  for (const r of josh) {
    const key = normalizeName(r.player)
    const mid = joshMid(r)
    const base = byKey.get(key) ?? blank(key, r.player)
    byKey.set(key, { ...base, b: mid !== null ? Math.max(1, mid) : base.b, josh: mid, avoid: r.kind === 'avoid' })
  }
  for (const sale of fixture.sales) {
    const key = normalizeName(sale.player)
    if (!byKey.has(key)) byKey.set(key, blank(key, sale.player))
  }
  return assignTiers([...byKey.values()])
}

const values = replayValues()
const teamId = (name: string) => fixture.teams.indexOf(name) + 1
const JOSH = teamId('Josh')
const RIVAL = teamId('Irish Turk')
const settings: Settings = {
  teams: fixture.teams.map((name, i) => ({ id: i + 1, name })),
  budget: fixture.settings.budget,
  rosterSize: fixture.settings.rosterSize,
  lineupSlotCounts: ESPN_DEFAULT_COUNTS,
  flyerReserve: 2,
}
const idx = (player: string) => {
  const i = fixture.sales.findIndex((x) => x.player === player)
  if (i < 0) throw new Error(`not in fixture: ${player}`)
  return i
}
function before(n: number, me = JOSH): DraftState {
  return fixture.sales.slice(0, n).reduce(
    (s, x) => reduce(s, { type: 'sold', playerKey: normalizeName(x.player), teamId: teamId(x.team), price: x.price }),
    initialState(settings, values, me),
  )
}
/** The call just before the winning bid: player on the block at (price - 1), a rival leading. */
function callAt(player: string, price: number, me = JOSH) {
  const s = reduce(before(idx(player), me), { type: 'nominated', playerKey: normalizeName(player), teamId: RIVAL, amount: price })
  return verdict(s)!
}

describe('Josh Lloyd replay (12 teams, $200, 13 spots)', () => {
  it('fixture is complete: 156 sales, 13 per team', () => {
    expect(fixture.sales).toHaveLength(156)
    for (const t of fixture.teams) expect(fixture.sales.filter((x) => x.team === t)).toHaveLength(13)
  })

  it('1. the room reads Hot after SGA ($68) and after Cade ($48)', () => {
    expect(temperature(before(idx('Shai Gilgeous-Alexander') + 1)).label).toBe('Hot')
    expect(temperature(before(idx('Cade Cunningham') + 1)).label).toBe('Hot')
  })

  it('2. Luka at $61 is flagged a bargain', () => {
    const s = before(fixture.sales.length)
    const luka = s.sales.find((x) => x.playerKey === normalizeName('Luka Doncic'))!
    expect(saleFlags(s).get(luka.seq)?.bargain).toBe(true)
  })

  it('3. the Wemby $80 + Jokic $80 team gets the concentration warning', () => {
    const v = callAt('Nikola Jokic', 79, teamId('NY Strangers'))
    expect(v.warnings.some((w) => w.startsWith('Two players'))).toBe(true)
  })

  it.each([
    ['Nickeil Alexander-Walker', 13],
    ['Derrick White', 13],
    ['Dyson Daniels', 16],
    ['Norman Powell', 2],
  ])('4/8/9. %s at $%i is a BID', (player, price) => {
    expect(callAt(player, price).kind).toBe('BID')
  })

  it.each([
    ['Zach Edey', 21],
    ['Walker Kessler', 26],
  ])('5/10. %s at $%i is LET THEM', (player, price) => {
    expect(callAt(player, price).kind).toBe('LET_THEM')
  })

  it('6. on Keegan Murray the $8 rival can outbid Josh', () => {
    const s = before(idx('Keegan Murray'))
    const names = rivalsAbove(s, ceilingFor(s, normalizeName('Keegan Murray'))).map((t) => t.name)
    expect(names).toContain('Hast Tatum')
  })

  it("7. at least 11 of Josh's 13 buys are within the engine's ceiling + $2", () => {
    const buys = fixture.sales.filter((x) => x.team === 'Josh')
    expect(buys).toHaveLength(13)
    const within = buys.filter((x) => x.price <= callAt(x.player, x.price - 1).ceiling + 2)
    expect(within.length).toBeGreaterThanOrEqual(11)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/engine/advise.test.ts test/replay.test.ts`
Expected: advise test FAILS (module not found). The replay test may already pass, since it only uses existing modules. If any replay check fails, stop and compare against the prototype numbers in the spec's §9 R8 before touching constants.

- [ ] **Step 4: Implement `advise`**

`src/engine/advise.ts`:

```ts
import { allTeams, inflation, myBudget, saleFlags, teamSummary, temperature, valueOf, type MyBudget, type TeamSummary, type Temperature } from './metrics'
import { suggestNomination, type Nomination } from './nominate'
import { targetList, type TargetRow } from './targets'
import type { DraftState } from './types'
import { verdict, type Verdict } from './verdict'

export const FEED_LIMIT = 15

export interface FeedRow {
  seq: number
  name: string
  teamId: number
  teamName: string
  price: number
  bargain: boolean
}

export interface Advice {
  budget: MyBudget | null
  temperature: Temperature
  inflation: number
  verdict: Verdict | null
  nomination: Nomination | null
  targets: TargetRow[]
  teams: TeamSummary[]
  feed: FeedRow[]
}

export function advise(s: DraftState): Advice {
  const flags = saleFlags(s)
  return {
    budget: myBudget(s),
    temperature: temperature(s),
    inflation: inflation(s),
    verdict: verdict(s),
    nomination: suggestNomination(s),
    targets: targetList(s),
    teams: allTeams(s),
    feed: s.sales
      .slice(-FEED_LIMIT)
      .reverse()
      .map((x) => ({
        seq: x.seq,
        name: valueOf(s, x.playerKey).name,
        teamId: x.teamId,
        teamName: teamSummary(s, x.teamId).name,
        price: x.price,
        bargain: flags.get(x.seq)?.bargain ?? false,
      })),
  }
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: everything PASSES, including all 10 replay checks.

- [ ] **Step 6: Commit**

```bash
git add src/engine/advise.ts test/fixtures/josh-mock-sales.json test/engine/advise.test.ts test/replay.test.ts
git commit -m "feat(helper): advise() and Josh Lloyd mock replay acceptance test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: ESPN league settings client

**Files:**
- Create: `espn-auction-helper/src/espn/league.ts`
- Create: `espn-auction-helper/test/fixtures/league-settings.json`
- Test: `espn-auction-helper/test/espn/league.test.ts`

**Interfaces:**
- Consumes: `API_BASE`, `SEASON`, `FetchLike` (Task 3); `ESPN_DEFAULT_COUNTS`, `IR_SLOT` (Task 6); `Settings` (Task 6).
- Produces:
  - `interface LeagueTeam { id: number; name: string; owners: string[] }`
  - `interface LeagueInfo { id: number; draftType: string; budget: number; rosterSize: number; lineupSlotCounts: Record<number, number>; teams: LeagueTeam[] }`
  - `parseLeague(json: unknown): LeagueInfo`
  - `leagueUrl(leagueId: number): string`
  - `fetchLeague(leagueId: number, fetchFn?: FetchLike): Promise<LeagueInfo>` (401 → error mentioning "log in")
  - `swidFromCookie(cookie: string): string | null`
  - `findMyTeam(league: LeagueInfo, swid: string): number | null`
  - `toSettings(league: LeagueInfo, flyerReserve?: number): Settings`
  - `fallbackSettings(teamCount?: number): Settings` (10 teams, $200, 13 spots)

- [ ] **Step 1: Write the fixture (synthetic, shaped like ESPN's `mSettings` + `mTeam` views)**

`test/fixtures/league-settings.json`:

```json
{
  "id": 123,
  "settings": {
    "size": 10,
    "draftSettings": { "type": "AUCTION", "auctionBudget": 200 },
    "rosterSettings": {
      "lineupSlotCounts": { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, "10": 0, "11": 3, "12": 3, "13": 1 }
    }
  },
  "teams": [
    { "id": 1, "name": "Adarsh Ballers", "owners": ["{AAAAAAAA-0000-0000-0000-000000000001}"] },
    { "id": 2, "location": "Team", "nickname": "Two", "owners": ["{AAAAAAAA-0000-0000-0000-000000000002}"] },
    { "id": 3, "name": "T3", "owners": [] },
    { "id": 4, "name": "T4", "owners": [] },
    { "id": 5, "name": "T5", "owners": [] },
    { "id": 6, "name": "T6", "owners": [] },
    { "id": 7, "name": "T7", "owners": [] },
    { "id": 8, "name": "T8", "owners": [] },
    { "id": 9, "name": "T9", "owners": [] },
    { "id": 10, "name": "T10", "owners": [] }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

`test/espn/league.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FetchLike } from '../../src/espn/common'
import { fallbackSettings, fetchLeague, findMyTeam, leagueUrl, parseLeague, swidFromCookie, toSettings } from '../../src/espn/league'

const RAW = JSON.parse(readFileSync('test/fixtures/league-settings.json', 'utf8'))
const SWID = '{AAAAAAAA-0000-0000-0000-000000000001}'

describe('parseLeague', () => {
  it('reads budget, roster size (IR excluded), slot counts and teams', () => {
    const l = parseLeague(RAW)
    expect(l).toMatchObject({ id: 123, draftType: 'AUCTION', budget: 200, rosterSize: 13 })
    expect(l.lineupSlotCounts).toEqual({ 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3, 13: 1 })
    expect(l.teams).toHaveLength(10)
    expect(l.teams[1].name).toBe('Team Two')
  })

  it('falls back to ESPN defaults when settings are missing', () => {
    expect(parseLeague({ teams: [] })).toMatchObject({ draftType: 'UNKNOWN', budget: 200, rosterSize: 13 })
  })
})

describe('my team', () => {
  it('reads SWID from the cookie string, URL-encoded or not', () => {
    expect(swidFromCookie(`a=1; SWID=${SWID}; espn_s2=x`)).toBe(SWID)
    expect(swidFromCookie(`SWID=${encodeURIComponent(SWID)}`)).toBe(SWID)
    expect(swidFromCookie('a=1')).toBeNull()
  })

  it('matches owners case-insensitively', () => {
    const l = parseLeague(RAW)
    expect(findMyTeam(l, SWID.toLowerCase())).toBe(1)
    expect(findMyTeam(l, '{BBBBBBBB-0000-0000-0000-000000000009}')).toBeNull()
  })
})

describe('settings', () => {
  it('toSettings keeps teams and roster shape, with a 2-slot flyer reserve', () => {
    const s = toSettings(parseLeague(RAW))
    expect(s.teams[0]).toEqual({ id: 1, name: 'Adarsh Ballers' })
    expect(s).toMatchObject({ budget: 200, rosterSize: 13, flyerReserve: 2 })
  })

  it('fallbackSettings is a 10-team, $200, 13-spot league', () => {
    const s = fallbackSettings()
    expect(s.teams).toHaveLength(10)
    expect(s).toMatchObject({ budget: 200, rosterSize: 13, flyerReserve: 2 })
  })
})

describe('fetchLeague', () => {
  it('asks for mSettings + mTeam with the browser session', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const fake: FetchLike = async (url, init) => {
      seen = { url, init }
      return { ok: true, status: 200, json: async () => RAW }
    }
    expect((await fetchLeague(123, fake)).teams).toHaveLength(10)
    expect(seen!.url).toBe(leagueUrl(123))
    expect(seen!.url).toContain('/seasons/2027/segments/0/leagues/123?view=mSettings&view=mTeam')
    expect(seen!.init?.credentials).toBe('include')
  })

  it('explains a 401 and reports other failures', async () => {
    const status = (code: number): FetchLike => async () => ({ ok: false, status: code, json: async () => ({}) })
    await expect(fetchLeague(1, status(401))).rejects.toThrow(/log in/)
    await expect(fetchLeague(1, status(500))).rejects.toThrow(/HTTP 500/)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/espn/league.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`src/espn/league.ts`:

```ts
import type { Settings } from '../engine/types'
import { API_BASE, SEASON, type FetchLike } from './common'
import { ESPN_DEFAULT_COUNTS, IR_SLOT } from './slots'

export interface LeagueTeam {
  id: number
  name: string
  owners: string[]
}

export interface LeagueInfo {
  id: number
  draftType: string
  budget: number
  rosterSize: number
  lineupSlotCounts: Record<number, number>
  teams: LeagueTeam[]
}

interface RawLeague {
  id?: number
  settings?: {
    draftSettings?: { type?: string; auctionBudget?: number }
    rosterSettings?: { lineupSlotCounts?: Record<string, number> }
  }
  teams?: Array<{ id: number; name?: string; location?: string; nickname?: string; owners?: string[] }>
}

export function parseLeague(json: unknown): LeagueInfo {
  const raw = json as RawLeague
  const counts: Record<number, number> = {}
  for (const [slot, n] of Object.entries(raw.settings?.rosterSettings?.lineupSlotCounts ?? ESPN_DEFAULT_COUNTS)) {
    if (Number(n) > 0) counts[Number(slot)] = Number(n)
  }
  const rosterSize = Object.entries(counts)
    .filter(([slot]) => Number(slot) !== IR_SLOT)
    .reduce((sum, [, n]) => sum + n, 0)
  const teams = (raw.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name?.trim() || `${t.location ?? ''} ${t.nickname ?? ''}`.trim() || `Team ${t.id}`,
    owners: t.owners ?? [],
  }))
  return {
    id: raw.id ?? 0,
    draftType: raw.settings?.draftSettings?.type ?? 'UNKNOWN',
    budget: raw.settings?.draftSettings?.auctionBudget ?? 200,
    rosterSize,
    lineupSlotCounts: counts,
    teams,
  }
}

export const leagueUrl = (leagueId: number) => `${API_BASE}/${SEASON}/segments/0/leagues/${leagueId}?view=mSettings&view=mTeam`

/** Runs in the content script: ESPN allows fantasy.espn.com to read with the user's cookies. */
export async function fetchLeague(leagueId: number, fetchFn: FetchLike = fetch): Promise<LeagueInfo> {
  const res = await fetchFn(leagueUrl(leagueId), { credentials: 'include', headers: { Accept: 'application/json' } })
  if (res.status === 401) throw new Error('ESPN returned 401: log in to ESPN in this browser')
  if (!res.ok) throw new Error(`ESPN league HTTP ${res.status}`)
  return parseLeague(await res.json())
}

export function swidFromCookie(cookie: string): string | null {
  const m = cookie.match(/(?:^|;\s*)SWID=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function findMyTeam(league: LeagueInfo, swid: string): number | null {
  const want = swid.toUpperCase()
  return league.teams.find((t) => t.owners.some((o) => o.toUpperCase() === want))?.id ?? null
}

export function toSettings(league: LeagueInfo, flyerReserve = 2): Settings {
  return {
    teams: league.teams.map(({ id, name }) => ({ id, name })),
    budget: league.budget,
    rosterSize: league.rosterSize,
    lineupSlotCounts: league.lineupSlotCounts,
    flyerReserve,
  }
}

export function fallbackSettings(teamCount = 10): Settings {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}` })),
    budget: 200,
    rosterSize: 13,
    lineupSlotCounts: ESPN_DEFAULT_COUNTS,
    flyerReserve: 2,
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/espn/league.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/espn/league.ts test/fixtures/league-settings.json test/espn/league.test.ts
git commit -m "feat(helper): read ESPN league settings and detect my team" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Panel UI with manual entry

**Files:**
- Create: `espn-auction-helper/src/ui/html.ts`
- Create: `espn-auction-helper/src/ui/format.ts`
- Create: `espn-auction-helper/src/ui/styles.ts`
- Create: `espn-auction-helper/src/ui/ManualEntry.ts`
- Create: `espn-auction-helper/src/ui/Panel.ts`
- Create: `espn-auction-helper/src/ui/mount.ts`
- Test: `espn-auction-helper/test/ui/format.test.ts`
- Test: `espn-auction-helper/test/ui/panel.test.ts`

**Interfaces:**
- Consumes: `Advice` (Task 11), `DraftEvent`/`DraftState` (Task 6), `available`/`teamSummary` (Task 7), `Verdict` (Task 9), `normalizeName` (Task 2).
- Produces:
  - `html` (htm bound to Preact `h`)
  - `money(n: number): string`, `verdictText(v: Verdict): string`
  - `type Health = 'live' | 'manual'`
  - `interface PanelProps { advice: Advice; state: DraftState; health: Health; banner: string | null; frameCount: number; onEvent: (ev: DraftEvent) => void; onDownloadRecording: () => void }`
  - `Panel(props: PanelProps)`, `ManualEntry(props: { state: DraftState; onEvent: (ev: DraftEvent) => void })`
  - `mountPanel(doc: Document): HTMLElement` (returns the render container inside a Shadow DOM host `#eah-host`)

- [ ] **Step 1: Write the failing tests**

`test/ui/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Verdict } from '../../src/engine/verdict'
import { money, verdictText } from '../../src/ui/format'

const base: Verdict = { kind: 'BID', playerKey: 'a', name: 'A', price: 30, leaderId: 2, adjusted: 35.8, ceiling: 35, boost: 1, pushTo: null, rivalPerSlotAfter: null, warnings: [], unvalued: false }

describe('format', () => {
  it('rounds money', () => {
    expect(money(35.8)).toBe('$36')
  })

  it.each([
    [{ kind: 'BID' }, 'BID up to $35'],
    [{ kind: 'BID_UP', pushTo: 33 }, 'BID UP to $33'],
    [{ kind: 'LET_THEM', price: 40 }, 'LET THEM ($40 > value $36)'],
    [{ kind: 'PASS' }, 'PASS'],
    [{ kind: 'LEADING' }, 'You lead at $30 (ceiling $35)'],
  ] as const)('%o -> %s', (patch, text) => {
    expect(verdictText({ ...base, ...patch })).toBe(text)
  })
})
```

`test/ui/panel.test.ts`:

```ts
// @vitest-environment jsdom
import { render } from 'preact'
import { describe, expect, it, vi } from 'vitest'
import { advise } from '../../src/engine/advise'
import type { DraftState } from '../../src/engine/types'
import { html } from '../../src/ui/html'
import { mountPanel } from '../../src/ui/mount'
import { Panel } from '../../src/ui/Panel'
import { build, nominated, pv, settings, sold } from '../helpers'

const S = settings(4, { lineupSlotCounts: { 12: 13 } })
const V = [pv('Alpha', 30), pv('Beta', 18)]

function show(state: DraftState) {
  const el = document.createElement('div')
  const onEvent = vi.fn()
  render(html`<${Panel} advice=${advise(state)} state=${state} health="manual" banner=${null} frameCount=${0} onEvent=${onEvent} onDownloadRecording=${() => {}} />`, el)
  return { el, onEvent }
}
const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!
const fill = (el: HTMLElement, player: string, team: string, amount: string) => {
  ;(el.querySelector('input[name=player]') as HTMLInputElement).value = player
  ;(el.querySelector('select[name=team]') as HTMLSelectElement).value = team
  ;(el.querySelector('input[name=amount]') as HTMLInputElement).value = amount
}

describe('Panel', () => {
  it('shows the call for the player on the block', () => {
    expect(show(build(S, V, [nominated('Alpha', 2, 1)])).el.textContent).toContain('BID up to $35')
  })

  it('asks which team is mine when it is unknown', () => {
    const { el, onEvent } = show(build(S, V, [], null))
    const select = el.querySelector('.picker select') as HTMLSelectElement
    select.value = '3'
    select.dispatchEvent(new Event('change'))
    expect(onEvent).toHaveBeenCalledWith({ type: 'setMyTeam', teamId: 3 })
  })

  it('flags a player on the block who has no value', () => {
    expect(show(build(S, V, [nominated('Ghost', 2, 1)])).el.textContent).toContain('ghost has no value')
  })

  it('pins a target', () => {
    const { el, onEvent } = show(build(S, V, []))
    ;(el.querySelector('button.pin') as HTMLButtonElement).click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'toggleTarget', playerKey: 'beta' })
  })

  it('fixes a sale through a prompt ("price team")', () => {
    const { el, onEvent } = show(build(S, V, [sold('Alpha', 2, 12)]))
    vi.spyOn(window, 'prompt').mockReturnValue('14 3')
    ;(el.querySelector('button.fix') as HTMLButtonElement).click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'editSale', seq: 1, teamId: 3, price: 14 })
  })
})

describe('ManualEntry', () => {
  it('Nominated dispatches a nomination', () => {
    const { el, onEvent } = show(build(S, V, []))
    fill(el, 'Alpha', '2', '5')
    button(el, 'Nominated').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'nominated', playerKey: 'alpha', teamId: 2, amount: 5 })
  })

  it('Bid dispatches a bid', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 2, 1)]))
    fill(el, '', '3', '9')
    button(el, 'Bid').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'bid', teamId: 3, amount: 9 })
  })

  it('Sold closes the live auction at its price and leader', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 3, 7)]))
    button(el, 'Sold').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'sold', playerKey: 'alpha', teamId: 3, price: 7 })
  })

  it('Set value dispatches a value edit', () => {
    const { el, onEvent } = show(build(S, V, []))
    fill(el, 'Ghost', '1', '4')
    button(el, 'Set value').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'setValue', playerKey: 'ghost', b: 4 })
  })
})

describe('mountPanel', () => {
  it('mounts a container inside a shadow root', () => {
    const container = mountPanel(document)
    const host = document.getElementById('eah-host')!
    expect(host.shadowRoot!.contains(container)).toBe(true)
    expect(host.shadowRoot!.querySelector('style')!.textContent).toContain('.panel')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/ui`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/ui/html.ts`:

```ts
import htm from 'htm'
import { h } from 'preact'

export const html = htm.bind(h)
```

`src/ui/format.ts`:

```ts
import type { Verdict } from '../engine/verdict'

export const money = (n: number) => `$${Math.round(n)}`

export function verdictText(v: Verdict): string {
  switch (v.kind) {
    case 'BID':
      return `BID up to ${money(v.ceiling)}`
    case 'BID_UP':
      return `BID UP to ${money(v.pushTo ?? v.ceiling)}`
    case 'LET_THEM':
      return `LET THEM (${money(v.price)} > value ${money(v.adjusted)})`
    case 'PASS':
      return 'PASS'
    case 'LEADING':
      return `You lead at ${money(v.price)} (ceiling ${money(v.ceiling)})`
  }
}
```

`src/ui/styles.ts`:

```ts
export const PANEL_CSS = `
:host { all: initial; }
.panel { width: 340px; max-height: 85vh; overflow: auto; background: #111827; color: #e5e7eb; font: 12px/1.4 system-ui, sans-serif; border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .4); }
header { display: flex; gap: 8px; align-items: center; padding: 8px 10px; background: #1f2937; cursor: move; border-radius: 10px 10px 0 0; }
.health.live { color: #34d399; }
.health.manual { color: #9ca3af; }
.temp { margin-left: auto; color: #fbbf24; }
section, .picker, .banner, form, footer { display: block; padding: 6px 10px; border-top: 1px solid #374151; }
.banner { background: #7c2d12; }
.call { font-size: 18px; font-weight: 700; }
.call.BID { color: #34d399; }
.call.BID_UP { color: #a3e635; }
.call.LET_THEM { color: #f87171; }
.call.PASS { color: #9ca3af; }
.call.LEADING { color: #60a5fa; }
.muted { color: #9ca3af; }
.warn { color: #fca5a5; }
h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #9ca3af; }
table { width: 100%; border-collapse: collapse; }
td { padding: 1px 4px; }
button { font: inherit; background: #374151; color: inherit; border: 0; border-radius: 4px; padding: 2px 6px; cursor: pointer; }
input, select { font: inherit; background: #1f2937; color: inherit; border: 1px solid #4b5563; border-radius: 4px; padding: 2px 4px; margin: 2px 0; width: 100%; box-sizing: border-box; }
.row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.pin { background: none; color: #fbbf24; padding: 0; }
.fix { background: none; color: #9ca3af; padding: 0 2px; }
`
```

`src/ui/ManualEntry.ts`:

```ts
import { available } from '../engine/metrics'
import type { DraftEvent, DraftState } from '../engine/types'
import { normalizeName } from '../values/names'
import { html } from './html'

type Action = 'nominate' | 'bid' | 'sold' | 'value'

function read(form: HTMLFormElement) {
  const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value
  return { playerKey: normalizeName(field('player')), teamId: Number(field('team')), amount: Number(field('amount')) }
}

/** Fallback when the socket isn't decoding: type what happens in the room. */
export function ManualEntry({ state, onEvent }: { state: DraftState; onEvent: (ev: DraftEvent) => void }) {
  const act = (action: Action) => (e: Event) => {
    const f = read((e.currentTarget as HTMLButtonElement).form!)
    if (action === 'nominate' && f.playerKey && f.amount > 0) onEvent({ type: 'nominated', playerKey: f.playerKey, teamId: f.teamId, amount: f.amount })
    if (action === 'bid' && f.amount > 0) onEvent({ type: 'bid', teamId: f.teamId, amount: f.amount })
    if (action === 'sold') {
      if (state.live) onEvent({ type: 'sold', playerKey: state.live.playerKey, teamId: state.live.leaderId, price: state.live.price })
      else if (f.playerKey && f.amount > 0) onEvent({ type: 'sold', playerKey: f.playerKey, teamId: f.teamId, price: f.amount })
    }
    if (action === 'value' && f.playerKey && f.amount > 0) onEvent({ type: 'setValue', playerKey: f.playerKey, b: f.amount })
  }
  return html`
    <form class="manual" onSubmit=${(e: Event) => e.preventDefault()}>
      <h4>Manual entry</h4>
      <input name="player" list="eah-players" placeholder="player" autocomplete="off" />
      <datalist id="eah-players">${available(state).slice(0, 300).map((v) => html`<option value=${v.name} />`)}</datalist>
      <select name="team">${state.settings.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select>
      <input name="amount" type="number" min="1" placeholder="$" />
      <div class="row">
        <button type="button" onClick=${act('nominate')}>Nominated</button>
        <button type="button" onClick=${act('bid')}>Bid</button>
        <button type="button" onClick=${act('sold')}>Sold</button>
        <button type="button" onClick=${act('value')}>Set value</button>
      </div>
    </form>`
}
```

`src/ui/Panel.ts`:

```ts
import type { Advice, FeedRow } from '../engine/advise'
import { teamSummary } from '../engine/metrics'
import type { DraftEvent, DraftState } from '../engine/types'
import { money, verdictText } from './format'
import { html } from './html'
import { ManualEntry } from './ManualEntry'

export type Health = 'live' | 'manual'

export interface PanelProps {
  advice: Advice
  state: DraftState
  health: Health
  banner: string | null
  frameCount: number
  onEvent: (ev: DraftEvent) => void
  onDownloadRecording: () => void
}

export function Panel(p: PanelProps) {
  const { advice, state } = p
  const v = advice.verdict
  const teamName = (id: number) => teamSummary(state, id).name
  const temp = advice.temperature
  const fixSale = (f: FeedRow) => {
    const answer = window.prompt(`Fix ${f.name}: price and team number`, `${f.price} ${f.teamId}`)
    const [price, teamId] = (answer ?? '').trim().split(/\s+/).map(Number)
    if (price > 0 && state.settings.teams.some((t) => t.id === teamId)) p.onEvent({ type: 'editSale', seq: f.seq, teamId, price })
  }
  return html`
    <div class="panel">
      <header data-drag="1">
        <strong>Josh Mode</strong>
        <span class=${`health ${p.health}`}>${p.health === 'live' ? '● live' : '○ manual'}</span>
        <span class="temp">${temp.label}${temp.T !== null ? ` ${temp.T.toFixed(2)}` : ''} · infl ${advice.inflation.toFixed(2)}</span>
      </header>
      ${p.banner && html`<div class="banner">${p.banner}</div>`}
      ${state.myTeamId === null &&
      html`<label class="picker">Which team is yours?
        <select onChange=${(e: Event) => p.onEvent({ type: 'setMyTeam', teamId: Number((e.target as HTMLSelectElement).value) })}>
          <option value="">choose…</option>
          ${state.settings.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}
        </select>
      </label>`}
      <section class="now">
        ${v
          ? html`
              <div class=${`call ${v.kind}`}>${verdictText(v)}</div>
              <div>${v.name} · ${money(v.price)} by ${teamName(v.leaderId)}</div>
              <div class="muted">value ${money(v.adjusted)} · ceiling ${money(v.ceiling)}${v.boost > 1 ? ' · positional need +10%' : ''}</div>
              ${v.unvalued && html`<div class="warn">${v.name} has no value: set one below</div>`}
              ${v.rivalPerSlotAfter !== null && html`<div class="muted">${teamName(v.leaderId)} left with ${money(v.rivalPerSlotAfter)}/slot after this</div>`}
              ${v.warnings.map((w) => html`<div class="warn">${w}</div>`)}
            `
          : html`<div class="muted">Waiting for a nomination</div>`}
      </section>
      ${advice.budget &&
      html`<section class="budget">
        ${money(advice.budget.budgetLeft)} left · ${advice.budget.open} spots · ${money(advice.budget.perSlot)}/slot · safe max ${money(advice.budget.safeMax)}
      </section>`}
      ${advice.nomination &&
      html`<section class="nominate">
        <b>Nominate:</b> ${advice.nomination.name} <span class="muted">(${advice.nomination.phase})</span>
        <div class="muted">${advice.nomination.reason}</div>
      </section>`}
      <section>
        <h4>Targets</h4>
        <table>
          ${advice.targets.map(
            (t) => html`<tr>
              <td><button class="pin" title="pin target" onClick=${() => p.onEvent({ type: 'toggleTarget', playerKey: t.playerKey })}>${t.pinned ? '★' : '☆'}</button></td>
              <td>${t.name}</td>
              <td>${money(t.adjusted)}</td>
              <td>≤${money(t.ceiling)}</td>
              <td class="muted">${t.outbidBy.length ? `outbid: ${t.outbidBy.join(', ')}` : ''}</td>
            </tr>`,
          )}
        </table>
      </section>
      <section>
        <h4>Rivals</h4>
        <table>
          ${advice.teams
            .filter((t) => t.id !== state.myTeamId)
            .map((t) => html`<tr><td>${t.name}</td><td>${money(t.budgetLeft)}</td><td>${t.open} open</td><td>max ${money(t.maxBid)}</td></tr>`)}
        </table>
      </section>
      <section>
        <h4>Sales</h4>
        ${advice.feed.map(
          (f) => html`<div>
            ${f.bargain ? '⭐ ' : ''}${f.name} → ${f.teamName} ${money(f.price)}
            <button class="fix" title="fix this sale" onClick=${() => fixSale(f)}>✎</button>
          </div>`,
        )}
      </section>
      <${ManualEntry} state=${state} onEvent=${p.onEvent} />
      <footer class="row">
        <button onClick=${() => p.onEvent({ type: 'undo' })}>Undo last sale</button>
        <button onClick=${p.onDownloadRecording}>Download recording (${p.frameCount} frames)</button>
      </footer>
    </div>`
}
```

`src/ui/mount.ts`:

```ts
import { PANEL_CSS } from './styles'

/** Shadow DOM keeps ESPN's styles out of the panel and ours out of ESPN. */
export function mountPanel(doc: Document): HTMLElement {
  const host = doc.createElement('div')
  host.id = 'eah-host'
  host.style.cssText = 'position:fixed;top:72px;right:12px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent = PANEL_CSS
  const container = doc.createElement('div')
  root.append(style, container)
  doc.body.appendChild(host)
  enableDrag(host, root)
  return container
}

function enableDrag(host: HTMLElement, root: ShadowRoot): void {
  let start: { x: number; y: number; left: number; top: number } | null = null
  root.addEventListener('mousedown', (e) => {
    const ev = e as MouseEvent
    if (!(ev.target as HTMLElement).closest('[data-drag]')) return
    const r = host.getBoundingClientRect()
    start = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top }
    ev.preventDefault()
  })
  host.ownerDocument.addEventListener('mousemove', (e) => {
    if (!start) return
    host.style.left = `${start.left + e.clientX - start.x}px`
    host.style.top = `${start.top + e.clientY - start.y}px`
    host.style.right = 'auto'
  })
  host.ownerDocument.addEventListener('mouseup', () => {
    start = null
  })
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/ui && npm run typecheck`
Expected: PASS. If the "pins a target" test can't find `button.pin`, check `targetList` output for the state. With 4 teams × $200 and 13 spots, per-slot money is $18 (band $9-$27), so Beta ($18) must be listed and Alpha ($30) not.

- [ ] **Step 5: Commit**

```bash
git add src/ui test/ui
git commit -m "feat(helper): Josh Mode panel with manual entry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Controller, persistence and a loadable extension (manual mode)

**Files:**
- Create: `espn-auction-helper/src/storage.ts`
- Create: `espn-auction-helper/src/controller.ts`
- Modify: `espn-auction-helper/src/content.ts` (replace the Task 1 stub)
- Modify: `espn-auction-helper/test/helpers.ts` (append `memoryStore`)
- Test: `espn-auction-helper/test/storage.test.ts`
- Test: `espn-auction-helper/test/controller.test.ts`

**Interfaces:**
- Consumes: `advise` (Task 11), `initialState`/`reduce` (Task 6), league functions (Task 12), `rescaleToLeague` (Task 5), `Panel`/`Health`/`mountPanel`/`html` (Task 13), `data/values.json` (Task 4).
- Produces:
  - `type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>`, `loadEvents(store, leagueId): DraftEvent[]`, `saveEvents(store, leagueId, events): void` (key `eah:<leagueId>:events`)
  - `interface View { advice: Advice; state: DraftState; health: Health; banner: string | null; frameCount: number }`
  - `interface ControllerDeps { leagueId: number; storage: KeyValueStore; values: PlayerValue[]; cookie: string; loadLeague: () => Promise<LeagueInfo>; render: (view: View) => void }`
  - `interface Controller { dispatch(ev: DraftEvent): void; getState(): DraftState }` (extended in Tasks 15 and 17)
  - `createController(deps: ControllerDeps): Promise<Controller>`
  - test helper `memoryStore(init?: Record<string, string>): KeyValueStore & { data: Record<string, string> }`

- [ ] **Step 1: Append `memoryStore` to `test/helpers.ts`**

```ts
import type { KeyValueStore } from '../src/storage'

export function memoryStore(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}
```

(Move the new `import type` line up to sit with the other imports at the top of the file.)

- [ ] **Step 2: Write the failing tests**

`test/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadEvents, saveEvents } from '../src/storage'
import { memoryStore, sold } from './helpers'

describe('event log storage', () => {
  it('round-trips events per league', () => {
    const store = memoryStore()
    saveEvents(store, 7, [sold('Alpha', 2, 12)])
    expect(loadEvents(store, 7)).toEqual([sold('Alpha', 2, 12)])
    expect(loadEvents(store, 8)).toEqual([])
  })

  it('treats corrupt or non-array data as empty', () => {
    expect(loadEvents(memoryStore({ 'eah:7:events': '{oops' }), 7)).toEqual([])
    expect(loadEvents(memoryStore({ 'eah:7:events': '{"a":1}' }), 7)).toEqual([])
  })

  it('keeps going when storage refuses writes', () => {
    const store = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
    expect(() => saveEvents(store, 7, [])).not.toThrow()
  })
})
```

`test/controller.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createController, type ControllerDeps, type View } from '../src/controller'
import { parseLeague } from '../src/espn/league'
import { memoryStore, nominated, pv, sold } from './helpers'

const LEAGUE = parseLeague(JSON.parse(readFileSync('test/fixtures/league-settings.json', 'utf8')))
const COOKIE = 'SWID={AAAAAAAA-0000-0000-0000-000000000001}'

async function make(over: Partial<ControllerDeps> = {}) {
  const views: View[] = []
  const deps: ControllerDeps = {
    leagueId: 7,
    storage: memoryStore(),
    values: [pv('Alpha', 30), pv('Bravo', 20)],
    cookie: COOKIE,
    loadLeague: async () => LEAGUE,
    render: (v) => views.push(v),
    ...over,
  }
  return { c: await createController(deps), views, deps }
}

describe('createController', () => {
  it('renders on start with league settings and my team', async () => {
    const { views } = await make()
    expect(views).toHaveLength(1)
    expect(views[0].state.settings.teams).toHaveLength(10)
    expect(views[0].state.myTeamId).toBe(1)
    expect(views[0]).toMatchObject({ health: 'manual', banner: null, frameCount: 0 })
  })

  it('falls back to a default league with a banner when ESPN fails', async () => {
    const { views } = await make({ loadLeague: async () => { throw new Error('ESPN returned 401: log in to ESPN in this browser') } })
    expect(views[0].banner).toContain('unavailable')
    expect(views[0].state.settings.teams).toHaveLength(10)
    expect(views[0].state.myTeamId).toBeNull()
  })

  it('warns when the league is not an auction', async () => {
    const { views } = await make({ loadLeague: async () => ({ ...LEAGUE, draftType: 'SNAKE' }) })
    expect(views[0].banner).toContain('SNAKE')
  })

  it('dispatch re-renders and persists; a reload restores the draft', async () => {
    const first = await make()
    first.c.dispatch(nominated('Alpha', 2, 1))
    first.c.dispatch(sold('Alpha', 2, 12))
    expect(first.views).toHaveLength(3)
    const second = await make({ storage: first.deps.storage })
    expect(second.c.getState().sales).toEqual([{ seq: 1, playerKey: 'alpha', teamId: 2, price: 12 }])
  })

  it('starts clean from corrupt storage', async () => {
    const { c } = await make({ storage: memoryStore({ 'eah:7:events': '{oops' }) })
    expect(c.getState().sales).toEqual([])
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/storage.test.ts test/controller.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement storage and controller**

`src/storage.ts`:

```ts
import type { DraftEvent } from './engine/types'

/** The page's sessionStorage in production: per tab, survives a refresh. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

const keyFor = (leagueId: number) => `eah:${leagueId}:events`

export function loadEvents(store: KeyValueStore, leagueId: number): DraftEvent[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(keyFor(leagueId)) ?? '[]')
    return Array.isArray(parsed) ? (parsed as DraftEvent[]) : []
  } catch {
    return []
  }
}

export function saveEvents(store: KeyValueStore, leagueId: number, events: DraftEvent[]): void {
  try {
    store.setItem(keyFor(leagueId), JSON.stringify(events))
  } catch {
    // Storage full or blocked: keep drafting from memory.
  }
}
```

`src/controller.ts`:

```ts
import { advise, type Advice } from './engine/advise'
import { initialState, reduce } from './engine/reducer'
import type { DraftEvent, DraftState } from './engine/types'
import { fallbackSettings, findMyTeam, swidFromCookie, toSettings, type LeagueInfo } from './espn/league'
import { loadEvents, saveEvents, type KeyValueStore } from './storage'
import type { Health } from './ui/Panel'
import { rescaleToLeague } from './values/rescale'
import type { PlayerValue } from './values/types'

export interface View {
  advice: Advice
  state: DraftState
  health: Health
  banner: string | null
  frameCount: number
}

export interface ControllerDeps {
  leagueId: number
  storage: KeyValueStore
  values: PlayerValue[]
  cookie: string
  loadLeague: () => Promise<LeagueInfo>
  render: (view: View) => void
}

export interface Controller {
  dispatch(ev: DraftEvent): void
  getState(): DraftState
}

export async function createController(deps: ControllerDeps): Promise<Controller> {
  let banner: string | null = null
  let league: LeagueInfo | null = null
  try {
    league = await deps.loadLeague()
  } catch (e) {
    banner = `ESPN league settings unavailable (${(e as Error).message}); assuming 10 teams, $200, 13 spots`
  }
  if (league && league.draftType !== 'AUCTION') banner = `This league's draft type is ${league.draftType}; this helper is built for auctions`

  const settings = league ? toSettings(league) : fallbackSettings()
  const values = rescaleToLeague(deps.values, { teams: settings.teams.length, budget: settings.budget, rosterSize: settings.rosterSize })
  const swid = swidFromCookie(deps.cookie)
  let state = initialState(settings, values, league && swid ? findMyTeam(league, swid) : null)
  const log = loadEvents(deps.storage, deps.leagueId)
  for (const ev of log) state = reduce(state, ev)

  const health: Health = 'manual'
  const publish = () => deps.render({ advice: advise(state), state, health, banner, frameCount: 0 })
  publish()

  return {
    dispatch(ev) {
      state = reduce(state, ev)
      log.push(ev)
      saveEvents(deps.storage, deps.leagueId, log)
      publish()
    },
    getState: () => state,
  }
}
```

- [ ] **Step 5: Replace `src/content.ts`**

```ts
import { render } from 'preact'
import valuesJson from '../data/values.json'
import { createController, type Controller } from './controller'
import type { DraftEvent } from './engine/types'
import { fetchLeague } from './espn/league'
import { html } from './ui/html'
import { mountPanel } from './ui/mount'
import { Panel } from './ui/Panel'
import type { PlayerValue } from './values/types'

const leagueId = Number(new URLSearchParams(location.search).get('leagueId'))

function whenReady(fn: () => void): void {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true })
  else fn()
}

whenReady(async () => {
  const container = mountPanel(document)
  let controller: Controller | null = null
  controller = await createController({
    leagueId,
    storage: sessionStorage,
    values: valuesJson as unknown as PlayerValue[],
    cookie: document.cookie,
    loadLeague: () => fetchLeague(leagueId),
    render: (view) =>
      render(html`<${Panel} ...${view} onEvent=${(ev: DraftEvent) => controller?.dispatch(ev)} onDownloadRecording=${() => {}} />`, container),
  })
})
```

- [ ] **Step 6: Run everything and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS; `dist/content.js` now bundles Preact and `values.json` (a few hundred KB).

- [ ] **Step 7: [HUMAN, optional] Manual smoke check (2 minutes)**

An agent executor skips this step and lists it in its report for the user.

1. Chrome → `chrome://extensions` → Developer mode on → "Load unpacked" → select `espn-auction-helper/dist`.
2. Open `https://fantasy.espn.com/basketball/draft?leagueId=<any league id you belong to>` while logged in to ESPN.

Expected: a dark "Josh Mode ○ manual" panel at top right, draggable by its header. If the league's draft room isn't open yet, ESPN may redirect away from `/basketball/draft`; the panel only mounts on that path, so redirection is fine. Record what you saw in the task report.

- [ ] **Step 8: Commit**

```bash
git add src/storage.ts src/controller.ts src/content.ts test/helpers.ts test/storage.test.ts test/controller.test.ts
git commit -m "feat(helper): controller with sessionStorage log; extension works in manual mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Socket capture: page-world hook, bridge, recorder

**Files:**
- Create: `espn-auction-helper/src/capture/frames.ts`
- Create: `espn-auction-helper/src/capture/bridge.ts`
- Create: `espn-auction-helper/src/capture/patch.ts`
- Create: `espn-auction-helper/src/capture/recording.ts`
- Modify: `espn-auction-helper/src/capture/hook.ts` (replace the Task 1 stub)
- Modify: `espn-auction-helper/src/controller.ts` (full replacement below)
- Modify: `espn-auction-helper/src/content.ts` (full replacement below)
- Test: `espn-auction-helper/test/capture/bridge.test.ts`
- Test: `espn-auction-helper/test/capture/patch.test.ts`
- Test: `espn-auction-helper/test/capture/recording.test.ts`
- Modify: `espn-auction-helper/test/controller.test.ts` (append one test)

**Interfaces:**
- Consumes: controller (Task 14), Panel (Task 13).
- Produces:
  - `interface Frame { dir: 'in' | 'out'; data: string; t: number; url: string }`, `DRAFT_SOCKET_HOST = 'fantasydraft.espn.com'`, `splitLines(data: string): string[]`
  - `NS = 'espn-auction-helper/v1'`, `interface Bus { post(msg: unknown): void; listen(cb: (msg: unknown) => void): void }`, `windowBus(win: Window): Bus`, `startHookSide(bus: Bus, makeNonce?: () => string): { emit(frame: Frame): void }`, `startContentSide(bus: Bus, onFrame: (frame: Frame) => void): void`
  - `patchWebSocket(win: { WebSocket: typeof WebSocket }, emit: (frame: Frame) => void, now?: () => number): void`
  - `interface Recording { leagueId: number; startedAt: string; savedAt: string; frames: Frame[] }`, `buildRecording(leagueId, startedAt: Date, frames, now?: Date): Recording`, `downloadText(doc: Document, filename: string, text: string): void`
  - `Controller` gains `onFrame(frame: Frame): void` and `recordingJson(): string`; `View.frameCount` counts frames.

- [ ] **Step 1: Write the failing tests**

`test/capture/bridge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NS, startContentSide, startHookSide, type Bus } from '../../src/capture/bridge'
import type { Frame } from '../../src/capture/frames'

/** Like window.postMessage: every listener, including the poster's own, sees every message. */
function memoryBus(): Bus & { sent: unknown[] } {
  const listeners: Array<(m: unknown) => void> = []
  const sent: unknown[] = []
  return {
    sent,
    post: (m) => {
      sent.push(m)
      for (const l of [...listeners]) l(m)
    },
    listen: (cb) => void listeners.push(cb),
  }
}
const frame = (data: string): Frame => ({ dir: 'in', data, t: 1, url: 'wss://fantasydraft.espn.com/x' })

describe('bridge', () => {
  it('replays frames captured before the content script was ready, then streams', () => {
    const bus = memoryBus()
    const hook = startHookSide(bus, () => 'n1')
    hook.emit(frame('CLOCK 0 100'))
    const got: Frame[] = []
    startContentSide(bus, (f) => got.push(f))
    hook.emit(frame('STATE 1'))
    expect(got.map((f) => f.data)).toEqual(['CLOCK 0 100', 'STATE 1'])
  })

  it('trusts only the first hello and only frames carrying its nonce', () => {
    const bus = memoryBus()
    const got: Frame[] = []
    startContentSide(bus, (f) => got.push(f))
    bus.post({ ns: NS, type: 'frame', nonce: 'x', frame: frame('BEFORE_HELLO') })
    bus.post({ ns: NS, type: 'hello', nonce: 'good' })
    bus.post({ ns: NS, type: 'frame', nonce: 'bad', frame: frame('WRONG_NONCE') })
    bus.post({ ns: NS, type: 'frame', nonce: 'good', frame: frame('REAL') })
    bus.post({ ns: NS, type: 'hello', nonce: 'evil' })
    bus.post({ ns: NS, type: 'frame', nonce: 'evil', frame: frame('SECOND_HELLO') })
    expect(got.map((f) => f.data)).toEqual(['REAL'])
  })

  it('the hook answers only the first ready and ignores foreign messages', () => {
    const bus = memoryBus()
    let n = 0
    startHookSide(bus, () => `n${++n}`)
    bus.post('noise')
    bus.post({ ns: 'someone-else', type: 'ready' })
    bus.post({ ns: NS, type: 'ready' })
    bus.post({ ns: NS, type: 'ready' })
    expect(bus.sent.filter((m) => (m as { type?: string }).type === 'hello')).toHaveLength(1)
  })
})
```

`test/capture/patch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Frame } from '../../src/capture/frames'
import { patchWebSocket } from '../../src/capture/patch'

const DRAFT_URL = 'wss://fantasydraft.espn.com/game-1/league-1/JOIN?1=1'

function makeFakeWs() {
  return class FakeWS {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    sent: unknown[] = []
    listeners: Array<(ev: { data: unknown }) => void> = []
    constructor(public url: string, public protocols?: string | string[]) {}
    addEventListener(_type: string, cb: (ev: { data: unknown }) => void) {
      this.listeners.push(cb)
    }
    send(data: unknown) {
      this.sent.push(data)
    }
    receive(data: unknown) {
      for (const l of this.listeners) l({ data })
    }
  }
}

function setup() {
  const FakeWS = makeFakeWs()
  const win = { WebSocket: FakeWS as unknown as typeof WebSocket }
  const frames: Frame[] = []
  const early = new FakeWS(DRAFT_URL)
  patchWebSocket(win, (f) => frames.push(f), () => 42)
  const open = (url: string) => new win.WebSocket(url) as unknown as InstanceType<typeof FakeWS>
  return { win, frames, early, open, FakeWS }
}

describe('patchWebSocket', () => {
  it('captures incoming text frames on the ESPN draft socket', () => {
    const { frames, open } = setup()
    open(DRAFT_URL).receive('CLOCK 6 85495 1\n')
    expect(frames).toEqual([{ dir: 'in', data: 'CLOCK 6 85495 1\n', t: 42, url: DRAFT_URL }])
  })

  it('captures outgoing frames and still sends them', () => {
    const { frames, open } = setup()
    const ws = open(DRAFT_URL)
    ws.send('PING PING%2042\n')
    expect(ws.sent).toEqual(['PING PING%2042\n'])
    expect(frames).toEqual([{ dir: 'out', data: 'PING PING%2042\n', t: 42, url: DRAFT_URL }])
  })

  it('ignores other sockets and binary frames', () => {
    const { frames, open } = setup()
    open('wss://example.com/chat').receive('hello')
    open(DRAFT_URL).receive(new ArrayBuffer(4))
    expect(frames).toEqual([])
  })

  it('keeps instanceof and the readyState constants', () => {
    const { win, open } = setup()
    expect(open(DRAFT_URL) instanceof win.WebSocket).toBe(true)
    expect(win.WebSocket.OPEN).toBe(1)
  })

  it('catches a socket opened before the patch on its next send', () => {
    const { frames, early } = setup()
    early.send('PING PING%201\n')
    early.receive('PONG PING%201')
    expect(frames.map((f) => [f.dir, f.data])).toEqual([['out', 'PING PING%201\n'], ['in', 'PONG PING%201']])
  })
})
```

`test/capture/recording.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitLines } from '../../src/capture/frames'
import { buildRecording } from '../../src/capture/recording'

describe('recording', () => {
  it('wraps frames with league and timestamps', () => {
    const frames = [{ dir: 'in' as const, data: 'STATE 1', t: 5, url: 'u' }]
    expect(buildRecording(7, new Date('2026-10-05T01:00:00Z'), frames, new Date('2026-10-05T02:00:00Z'))).toEqual({
      leagueId: 7,
      startedAt: '2026-10-05T01:00:00.000Z',
      savedAt: '2026-10-05T02:00:00.000Z',
      frames,
    })
  })

  it('splitLines trims and drops blank lines', () => {
    expect(splitLines('CLOCK 6 1 2\n\n  STATE 1 \n')).toEqual(['CLOCK 6 1 2', 'STATE 1'])
  })
})
```

Append to `test/controller.test.ts`:

```ts
describe('socket frames', () => {
  it('records frames and offers them as a recording', async () => {
    const { c, views } = await make()
    c.onFrame({ dir: 'in', data: 'CLOCK 6 85495 1', t: 1, url: 'wss://fantasydraft.espn.com/x' })
    expect(views.at(-1)!.frameCount).toBe(1)
    expect(JSON.parse(c.recordingJson())).toMatchObject({ leagueId: 7, frames: [{ data: 'CLOCK 6 85495 1' }] })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/capture test/controller.test.ts`
Expected: FAIL, capture modules missing; `c.onFrame is not a function`.

- [ ] **Step 3: Implement the capture modules**

`src/capture/frames.ts`:

```ts
export interface Frame {
  dir: 'in' | 'out'
  data: string
  t: number
  url: string
}

export const DRAFT_SOCKET_HOST = 'fantasydraft.espn.com'

/** ESPN batches several space-delimited commands per frame, one per line. */
export const splitLines = (data: string): string[] =>
  data
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
```

`src/capture/bridge.ts`:

```ts
import type { Frame } from './frames'

export const NS = 'espn-auction-helper/v1'

export interface Bus {
  post(msg: unknown): void
  listen(cb: (msg: unknown) => void): void
}

type Msg =
  | { ns: typeof NS; type: 'ready' }
  | { ns: typeof NS; type: 'hello'; nonce: string }
  | { ns: typeof NS; type: 'frame'; nonce: string; frame: Frame }

const isMsg = (m: unknown): m is Msg => typeof m === 'object' && m !== null && (m as { ns?: unknown }).ns === NS

export function windowBus(win: Window): Bus {
  return {
    post: (msg) => win.postMessage(msg, win.location.origin),
    listen: (cb) =>
      win.addEventListener('message', (ev) => {
        if (ev.source === win) cb(ev.data)
      }),
  }
}

/** Page world: buffers every frame until the content script says ready, then replays and streams. */
export function startHookSide(bus: Bus, makeNonce: () => string = () => crypto.randomUUID()): { emit(frame: Frame): void } {
  const log: Frame[] = []
  let nonce: string | null = null
  bus.listen((m) => {
    if (!isMsg(m) || m.type !== 'ready' || nonce) return
    nonce = makeNonce()
    bus.post({ ns: NS, type: 'hello', nonce })
    for (const frame of log) bus.post({ ns: NS, type: 'frame', nonce, frame })
  })
  return {
    emit(frame) {
      log.push(frame)
      if (nonce) bus.post({ ns: NS, type: 'frame', nonce, frame })
    },
  }
}

/** Content script: trusts the first hello after its ready, then only frames with that nonce. */
export function startContentSide(bus: Bus, onFrame: (frame: Frame) => void): void {
  let nonce: string | null = null
  bus.listen((m) => {
    if (!isMsg(m)) return
    if (m.type === 'hello' && !nonce) nonce = m.nonce
    else if (m.type === 'frame' && nonce !== null && m.nonce === nonce) onFrame(m.frame)
  })
  bus.post({ ns: NS, type: 'ready' })
}
```

`src/capture/patch.ts`:

```ts
import { DRAFT_SOCKET_HOST, type Frame } from './frames'

/**
 * Observes ESPN's draft socket without touching it: wraps the constructor for
 * sockets opened later, and send() for one already open (ESPN pings every 15s).
 */
export function patchWebSocket(win: { WebSocket: typeof WebSocket }, emit: (frame: Frame) => void, now: () => number = Date.now): void {
  const Native = win.WebSocket
  const watched = new WeakSet<WebSocket>()
  const isDraft = (url: string) => url.includes(DRAFT_SOCKET_HOST)
  const watch = (ws: WebSocket) => {
    if (watched.has(ws) || !isDraft(ws.url)) return
    watched.add(ws)
    ws.addEventListener('message', (ev: MessageEvent) => {
      if (typeof ev.data === 'string') emit({ dir: 'in', data: ev.data, t: now(), url: ws.url })
    })
  }

  function Patched(url: string | URL, protocols?: string | string[]): WebSocket {
    const ws = protocols === undefined ? new Native(url) : new Native(url, protocols)
    watch(ws)
    return ws
  }
  Patched.prototype = Native.prototype
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const) Object.defineProperty(Patched, k, { value: Native[k] })

  const nativeSend = Native.prototype.send
  Native.prototype.send = function (this: WebSocket, data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    watch(this)
    if (typeof data === 'string' && isDraft(this.url)) emit({ dir: 'out', data, t: now(), url: this.url })
    return nativeSend.call(this, data)
  }
  win.WebSocket = Patched as unknown as typeof WebSocket
}
```

`src/capture/recording.ts`:

```ts
import type { Frame } from './frames'

export interface Recording {
  leagueId: number
  startedAt: string
  savedAt: string
  frames: Frame[]
}

export function buildRecording(leagueId: number, startedAt: Date, frames: Frame[], now = new Date()): Recording {
  return { leagueId, startedAt: startedAt.toISOString(), savedAt: now.toISOString(), frames }
}

export function downloadText(doc: Document, filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = doc.createElement('a')
  a.href = url
  a.download = filename
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
```

Replace `src/capture/hook.ts`:

```ts
import { startHookSide, windowBus } from './bridge'
import { patchWebSocket } from './patch'

// Page world at document_start: patch before ESPN's draft client opens its socket.
patchWebSocket(window, startHookSide(windowBus(window)).emit)
```

- [ ] **Step 4: Extend the controller**

Replace `src/controller.ts` with:

```ts
import type { Frame } from './capture/frames'
import { buildRecording } from './capture/recording'
import { advise, type Advice } from './engine/advise'
import { initialState, reduce } from './engine/reducer'
import type { DraftEvent, DraftState } from './engine/types'
import { fallbackSettings, findMyTeam, swidFromCookie, toSettings, type LeagueInfo } from './espn/league'
import { loadEvents, saveEvents, type KeyValueStore } from './storage'
import type { Health } from './ui/Panel'
import { rescaleToLeague } from './values/rescale'
import type { PlayerValue } from './values/types'

export interface View {
  advice: Advice
  state: DraftState
  health: Health
  banner: string | null
  frameCount: number
}

export interface ControllerDeps {
  leagueId: number
  storage: KeyValueStore
  values: PlayerValue[]
  cookie: string
  loadLeague: () => Promise<LeagueInfo>
  render: (view: View) => void
}

export interface Controller {
  dispatch(ev: DraftEvent): void
  getState(): DraftState
  onFrame(frame: Frame): void
  recordingJson(): string
}

export async function createController(deps: ControllerDeps): Promise<Controller> {
  let banner: string | null = null
  let league: LeagueInfo | null = null
  try {
    league = await deps.loadLeague()
  } catch (e) {
    banner = `ESPN league settings unavailable (${(e as Error).message}); assuming 10 teams, $200, 13 spots`
  }
  if (league && league.draftType !== 'AUCTION') banner = `This league's draft type is ${league.draftType}; this helper is built for auctions`

  const settings = league ? toSettings(league) : fallbackSettings()
  const values = rescaleToLeague(deps.values, { teams: settings.teams.length, budget: settings.budget, rosterSize: settings.rosterSize })
  const swid = swidFromCookie(deps.cookie)
  let state = initialState(settings, values, league && swid ? findMyTeam(league, swid) : null)
  const log = loadEvents(deps.storage, deps.leagueId)
  for (const ev of log) state = reduce(state, ev)

  const startedAt = new Date()
  const frames: Frame[] = []
  const health: Health = 'manual'
  const publish = () => deps.render({ advice: advise(state), state, health, banner, frameCount: frames.length })
  publish()

  return {
    dispatch(ev) {
      state = reduce(state, ev)
      log.push(ev)
      saveEvents(deps.storage, deps.leagueId, log)
      publish()
    },
    getState: () => state,
    onFrame(frame) {
      frames.push(frame)
      publish()
    },
    recordingJson: () => JSON.stringify(buildRecording(deps.leagueId, startedAt, frames)),
  }
}
```

- [ ] **Step 5: Wire the bridge into `src/content.ts`**

Replace `src/content.ts` with:

```ts
import { render } from 'preact'
import valuesJson from '../data/values.json'
import { startContentSide, windowBus } from './capture/bridge'
import type { Frame } from './capture/frames'
import { downloadText } from './capture/recording'
import { createController, type Controller } from './controller'
import type { DraftEvent } from './engine/types'
import { fetchLeague } from './espn/league'
import { html } from './ui/html'
import { mountPanel } from './ui/mount'
import { Panel } from './ui/Panel'
import type { PlayerValue } from './values/types'

const leagueId = Number(new URLSearchParams(location.search).get('leagueId'))

// Listen from document_start so no socket frame is lost while the league loads.
const pending: Frame[] = []
let controller: Controller | null = null
startContentSide(windowBus(window), (frame) => {
  if (controller) controller.onFrame(frame)
  else pending.push(frame)
})

function whenReady(fn: () => void): void {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true })
  else fn()
}

const download = () => {
  if (controller) downloadText(document, `espn-draft-${leagueId}-${Date.now()}.json`, controller.recordingJson())
}

whenReady(async () => {
  const container = mountPanel(document)
  const ready = await createController({
    leagueId,
    storage: sessionStorage,
    values: valuesJson as unknown as PlayerValue[],
    cookie: document.cookie,
    loadLeague: () => fetchLeague(leagueId),
    render: (view) =>
      render(html`<${Panel} ...${view} onEvent=${(ev: DraftEvent) => controller?.dispatch(ev)} onDownloadRecording=${download} />`, container),
  })
  controller = ready
  for (const frame of pending.splice(0)) ready.onFrame(frame)
})
```

- [ ] **Step 6: Run everything and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/capture src/controller.ts src/content.ts test/capture test/controller.test.ts
git commit -m "feat(helper): observe ESPN draft socket and record frames" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Record a real ESPN auction (HUMAN step) and build fixtures

This task needs the user: a logged-in ESPN session in a live salary-cap draft room. ESPN's draft room only opens about an hour before a scheduled draft, and the auction socket frames are undocumented. **Do this as early as possible; the user's real draft must not be the first time it runs.**

**Files:**
- Modify: `espn-auction-helper/src/capture/recording.ts` (add scrubbing)
- Create: `espn-auction-helper/src/capture/analyze.ts`
- Create: `espn-auction-helper/scripts/scrub-recording.ts`
- Create: `espn-auction-helper/scripts/analyze-recording.ts`
- Create: `espn-auction-helper/test/fixtures/espn-auction-recording.json` (scrubbed)
- Create: `espn-auction-helper/test/fixtures/league-real.json` (scrubbed)
- Create: `espn-auction-helper/test/fixtures/espn-auction-notes.json`
- Test: `espn-auction-helper/test/capture/scrub.test.ts`
- Test: `espn-auction-helper/test/capture/analyze.test.ts`
- Modify: `espn-auction-helper/test/espn/league.test.ts` (append real-league test)

**Interfaces:**
- Consumes: `Frame`, `splitLines`, `Recording` (Task 15); `parseLeague` (Task 12); `EspnPlayer` (Task 3).
- Produces:
  - `ZERO_GUID`, `scrubFrame(f: Frame): Frame | null` (drops `TOKEN` and `INIT` lines, zeroes GUIDs, strips the socket URL query), `scrubRecording(r: Recording): Recording`, `scrubLeagueJson(text: string): string` (drops `members`, renames teams `Team <id>`, zeroes GUIDs)
  - `interface VerbStat { verb: string; count: number; samples: string[] }`, `verbStats(frames: Frame[], dir?: 'in' | 'out', sampleCount?: number): VerbStat[]`
  - `test/fixtures/espn-auction-notes.json` with shape `{ "source": string, "firstNomination": { "playerName": string, "espnId": number, "teamId": number, "amount": number }, "firstBid": { "teamId": number, "amount": number }, "firstSale": { "playerName": string, "espnId": number, "teamId": number, "price": number } }`

- [ ] **Step 1: Write the failing tests for the tooling**

`test/capture/scrub.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { scrubFrame, scrubLeagueJson, ZERO_GUID } from '../../src/capture/recording'

const GUID = '{8398089B-19B2-4A9B-AD56-C97626BAD9B5}'

describe('scrubbing', () => {
  it('drops TOKEN and INIT lines, zeroes GUIDs and strips the join query', () => {
    const f = { dir: 'in' as const, data: `TOKEN 1:1:2:${GUID}:123\nJOINED 2 ${GUID}\nINIT abc###`, t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-1/JOIN?4=secret' }
    expect(scrubFrame(f)).toEqual({ dir: 'in', data: `JOINED 2 ${ZERO_GUID}`, t: 1, url: 'wss://fantasydraft.espn.com/game-1/league-1/JOIN' })
  })

  it('returns null when nothing is left', () => {
    expect(scrubFrame({ dir: 'in', data: `TOKEN 1:1:2:${GUID}:1`, t: 1, url: '' })).toBeNull()
  })

  it('strips league members, team names and owner ids', () => {
    const text = JSON.stringify({ members: [{ id: GUID, firstName: 'Real' }], teams: [{ id: 3, name: 'Secret Squad', abbrev: 'SS', owners: [GUID] }] })
    const out = JSON.parse(scrubLeagueJson(text))
    expect(out.members).toBeUndefined()
    expect(out.teams[0]).toEqual({ id: 3, name: 'Team 3', owners: [ZERO_GUID] })
  })
})
```

`test/capture/analyze.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { verbStats } from '../../src/capture/analyze'
import type { Frame } from '../../src/capture/frames'

const f = (data: string, dir: Frame['dir'] = 'in'): Frame => ({ dir, data, t: 0, url: '' })

describe('verbStats', () => {
  const frames = [f('CLOCK 6 1 2\nCLOCK 6 1 3'), f('SELECTED 1 3112335 4'), f('PING PING%2012', 'out')]

  it('counts incoming verbs, most common first, with samples', () => {
    expect(verbStats(frames)).toEqual([
      { verb: 'CLOCK', count: 2, samples: ['CLOCK 6 1 2', 'CLOCK 6 1 3'] },
      { verb: 'SELECTED', count: 1, samples: ['SELECTED 1 3112335 4'] },
    ])
  })

  it('can look at outgoing frames and cap samples', () => {
    expect(verbStats(frames, 'out')).toEqual([{ verb: 'PING', count: 1, samples: ['PING PING%2012'] }])
    expect(verbStats(frames, 'in', 1)[0].samples).toEqual(['CLOCK 6 1 2'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/capture/scrub.test.ts test/capture/analyze.test.ts`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement the tooling**

Append to `src/capture/recording.ts` (and add `splitLines` to its `./frames` import):

```ts
const GUID = /\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?/g
export const ZERO_GUID = '{00000000-0000-0000-0000-000000000000}'

/** Safe to commit: no SWID/join code (TOKEN, URL query), no member GUIDs, no INIT state blob. */
export function scrubFrame(f: Frame): Frame | null {
  const data = splitLines(f.data)
    .filter((l) => !/^(TOKEN|INIT)\b/.test(l))
    .join('\n')
    .replace(GUID, ZERO_GUID)
  return data ? { ...f, data, url: f.url.split('?')[0] } : null
}

export function scrubRecording(r: Recording): Recording {
  return { ...r, frames: r.frames.map(scrubFrame).filter((f): f is Frame => f !== null) }
}

export function scrubLeagueJson(text: string): string {
  const raw = JSON.parse(text) as { members?: unknown; teams?: Array<Record<string, unknown>> }
  delete raw.members
  for (const t of raw.teams ?? []) {
    t.name = `Team ${t.id}`
    for (const k of ['location', 'nickname', 'abbrev', 'primaryOwner', 'logo']) delete t[k]
  }
  return JSON.stringify(raw, null, 1).replace(GUID, ZERO_GUID)
}
```

`src/capture/analyze.ts`:

```ts
import { splitLines, type Frame } from './frames'

export interface VerbStat {
  verb: string
  count: number
  samples: string[]
}

export function verbStats(frames: Frame[], dir: Frame['dir'] = 'in', sampleCount = 5): VerbStat[] {
  const byVerb = new Map<string, VerbStat>()
  for (const frame of frames) {
    if (frame.dir !== dir) continue
    for (const line of splitLines(frame.data)) {
      const verb = line.split(/\s+/)[0]
      const stat = byVerb.get(verb) ?? { verb, count: 0, samples: [] }
      stat.count++
      if (stat.samples.length < sampleCount) stat.samples.push(line)
      byVerb.set(verb, stat)
    }
  }
  return [...byVerb.values()].sort((a, b) => b.count - a.count)
}
```

`scripts/scrub-recording.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { scrubLeagueJson, scrubRecording, type Recording } from '../src/capture/recording'

const [kind, input, output] = process.argv.slice(2)
if ((kind !== 'recording' && kind !== 'league') || !input || !output) {
  throw new Error('usage: npm run scrub -- recording|league <raw.json> <out.json>')
}
const text = readFileSync(input, 'utf8')
if (kind === 'league') {
  writeFileSync(output, scrubLeagueJson(text))
  console.log(`wrote ${output}`)
} else {
  const raw = JSON.parse(text) as Recording
  const clean = scrubRecording(raw)
  writeFileSync(output, JSON.stringify(clean, null, 1))
  console.log(`kept ${clean.frames.length} of ${raw.frames.length} frames`)
}
```

`scripts/analyze-recording.ts`:

```ts
import { readFileSync } from 'node:fs'
import { verbStats } from '../src/capture/analyze'
import type { Recording } from '../src/capture/recording'
import type { EspnPlayer } from '../src/espn/players'

const file = process.argv[2]
if (!file) throw new Error('usage: npm run analyze -- <recording.json>')
const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording
const players = new Map((JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]).map((p) => [String(p.id), p.name]))

for (const dir of ['in', 'out'] as const) {
  console.log(`\n=== ${dir} ===`)
  for (const s of verbStats(rec.frames, dir)) {
    console.log(`${s.verb.padEnd(16)}${String(s.count).padStart(6)}`)
    for (const line of s.samples) {
      const named = line.split(/\s+/).filter((tok) => players.has(tok)).map((tok) => `${tok}=${players.get(tok)}`)
      console.log(`    ${line.slice(0, 140)}${named.length ? `   [${named.join(', ')}]` : ''}`)
    }
  }
}
```

- [ ] **Step 4: Run tooling tests, commit tooling**

```bash
npx vitest run test/capture && npm run typecheck
git add src/capture/recording.ts src/capture/analyze.ts scripts/scrub-recording.ts scripts/analyze-recording.ts test/capture/scrub.test.ts test/capture/analyze.test.ts
git commit -m "feat(helper): scrub and analyze ESPN draft recordings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: [HUMAN] Record a live salary-cap draft room**

Hand these instructions to the user and wait for the files.

1. `cd espn-auction-helper && npm run build`, then reload the unpacked extension in `chrome://extensions`.
2. Get into an ESPN **basketball salary-cap** draft room, in this order of preference:
   - **ESPN mock lobby** (`https://fantasy.espn.com/basketball/mockdraftlobby`), if it offers a Salary Cap mock. If the mock room's URL doesn't start with `https://fantasy.espn.com/basketball/draft`, tell the executor the URL; it adds that pattern to both `matches` entries in `manifest.json`, rebuilds, and you reload.
   - **A throwaway test league:** create a new ESPN basketball league, 10 teams, Draft Type "Salary Cap", draft time as soon as ESPN allows. Unclaimed teams autodraft. Open the room when it unlocks (about 1 hour before).
3. During the draft: nominate at least 2 players yourself, bid on at least 2 players others nominated, and let at least 5 players sell. Jot down exactly what the screen showed for:
   - the **first nomination**: player, nominating team, opening $
   - the **first bid** after it: team, $
   - the **first sale**: player, winning team, final $
4. Click **Download recording** in the panel. Move the file to `espn-auction-helper/recordings/raw-<date>.json` (`recordings/` is git-ignored).
5. In the same browser, open `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2027/segments/0/leagues/<leagueId>?view=mSettings&view=mTeam` and save the page as `espn-auction-helper/recordings/league-raw.json`.
6. Send the executor the three noted events, plus the mapping from ESPN team names to team ids, read from `league-raw.json` `teams[].id` / `name`.

- [ ] **Step 6: Scrub and inspect**

```bash
npm run scrub -- recording recordings/raw-<date>.json test/fixtures/espn-auction-recording.json
npm run scrub -- league recordings/league-raw.json test/fixtures/league-real.json
grep -ohiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' test/fixtures/espn-auction-recording.json test/fixtures/league-real.json | sort -u
npm run analyze -- test/fixtures/espn-auction-recording.json
```

Expected: the `grep` prints only `00000000-0000-0000-0000-000000000000` (or nothing). If anything else prints, stop: do not commit, and fix `scrubFrame`/`scrubLeagueJson` first. The `analyze` output lists every incoming verb with samples, and player ids annotated with names.

From the analysis, identify:
- the **nominate verb**: its first sample carries the first nominated player's id and the opening amount
- the **bid verb**: carries the first bid's team and amount
- the **sold verb**: carries the first sale's player id and team. Check whether it carries the price; snake drafts use `SELECTED <team> <playerId> <slot> [memberGuid]`.

Write down each verb and the 1-based token index of team / player / amount (token 0 is the verb). **If one verb carries both nominations and bids, or a sale needs two frames to reconstruct, stop and report back: that's a design change, not something to improvise.**

- [ ] **Step 7: Write the notes fixture**

`test/fixtures/espn-auction-notes.json`. Fill in from Step 5's notes. Get ESPN ids from `data/espn-players-2027.json` and team ids from `league-raw.json`:

```json
{
  "source": "ESPN salary-cap mock | test league <id>, recorded <date>",
  "firstNomination": { "playerName": "<name>", "espnId": 0, "teamId": 0, "amount": 1 },
  "firstBid": { "teamId": 0, "amount": 0 },
  "firstSale": { "playerName": "<name>", "espnId": 0, "teamId": 0, "price": 0 }
}
```

- [ ] **Step 8: Pin the real league shape**

Append to `test/espn/league.test.ts`:

```ts
describe('real ESPN league (scrubbed)', () => {
  it('parses as an auction with a full roster', () => {
    const l = parseLeague(JSON.parse(readFileSync('test/fixtures/league-real.json', 'utf8')))
    expect(l.draftType).toBe('AUCTION')
    expect(l.budget).toBeGreaterThan(0)
    expect(l.rosterSize).toBeGreaterThanOrEqual(10)
    expect(l.teams.length).toBeGreaterThanOrEqual(4)
  })
})
```

Run: `npx vitest run test/espn/league.test.ts`
Expected: PASS. If `budget` came out as the default 200 while the league uses a different budget, ESPN names the field differently from `draftSettings.auctionBudget`. Find the right field in `league-real.json`, fix `parseLeague`, and add that field to the synthetic fixture.

- [ ] **Step 9: Commit the fixtures**

```bash
git add test/fixtures/espn-auction-recording.json test/fixtures/league-real.json test/fixtures/espn-auction-notes.json test/espn/league.test.ts src/espn/league.ts
git commit -m "test(helper): scrubbed ESPN salary-cap draft recording and league fixtures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Decode the auction socket and go live

**Files:**
- Create: `espn-auction-helper/src/capture/decoder.ts`
- Create: `espn-auction-helper/src/capture/assembler.ts`
- Modify: `espn-auction-helper/src/controller.ts`
- Modify: `espn-auction-helper/test/helpers.ts` (append `lineFor`)
- Test: `espn-auction-helper/test/capture/decoder.test.ts`
- Test: `espn-auction-helper/test/capture/assembler.test.ts`
- Test: `espn-auction-helper/test/capture/recorded-draft.test.ts`
- Modify: `espn-auction-helper/test/controller.test.ts` (append live tests)

**Interfaces:**
- Consumes: Task 16's verb findings and fixtures; `splitLines`, `Frame` (Task 15); `DraftEvent` (Task 6).
- Produces:
  - `interface VerbMap { verb: string; team: number; player: number | null; amount: number | null }`, `interface AuctionGrammar { nominate: VerbMap; bid: VerbMap; sold: VerbMap }`, `GRAMMAR: AuctionGrammar`, `NOISE_VERBS: Set<string>`
  - `type RawEvent = { kind: 'nominated'; teamId; playerId; amount } | { kind: 'bid'; teamId; playerId: number | null; amount } | { kind: 'sold'; teamId; playerId; amount: number | null } | { kind: 'unknown'; verb }`
  - `decodeLine(line: string, g?: AuctionGrammar): RawEvent | null`, `decodeFrame(data: string, g?: AuctionGrammar): RawEvent[]`
  - `createAssembler(idToKey: (espnId: number) => string): { push(raw: RawEvent): DraftEvent[] }`
  - controller: incoming frames decode to events; `health` becomes `'live'` on the first decoded event; live events go to the same persisted log as manual ones.
  - test helper `lineFor(m: VerbMap, v: { team: number; player?: number; amount?: number }): string`

- [ ] **Step 1: Write the decoder with the grammar found in Task 16**

`src/capture/decoder.ts`. Replace the three `VerbMap` literals in `GRAMMAR` with Task 16's findings, and add every other incoming verb that `npm run analyze` listed to `NOISE_VERBS`:

```ts
import { splitLines } from './frames'

/** Where a verb's fields sit: 1-based token indexes (token 0 is the verb itself). */
export interface VerbMap {
  verb: string
  team: number
  player: number | null
  amount: number | null
}

export interface AuctionGrammar {
  nominate: VerbMap
  bid: VerbMap
  sold: VerbMap
}

// From the scrubbed recording in test/fixtures/espn-auction-recording.json (Task 16).
export const GRAMMAR: AuctionGrammar = {
  nominate: { verb: 'NOMINATE', team: 1, player: 2, amount: 3 },
  bid: { verb: 'BID', team: 1, player: null, amount: 2 },
  sold: { verb: 'SELECTED', team: 1, player: 2, amount: null },
}

/** Socket verbs that carry nothing the engine needs. */
export const NOISE_VERBS = new Set(['PING', 'PONG', 'CLOCK', 'TOKEN', 'INIT', 'JOINED', 'LEFT', 'STATE', 'SELECTING', 'AUTOSUGGEST', 'AUTODRAFT', 'DRAFT_LIST', 'ERROR'])

export type RawEvent =
  | { kind: 'nominated'; teamId: number; playerId: number; amount: number }
  | { kind: 'bid'; teamId: number; playerId: number | null; amount: number }
  | { kind: 'sold'; teamId: number; playerId: number; amount: number | null }
  | { kind: 'unknown'; verb: string }

const field = (tokens: string[], i: number | null): number | null => {
  if (i === null) return null
  const n = Number(tokens[i])
  return tokens[i] !== undefined && Number.isFinite(n) ? n : null
}

export function decodeLine(line: string, g: AuctionGrammar = GRAMMAR): RawEvent | null {
  const tokens = line.trim().split(/\s+/)
  const verb = tokens[0]
  if (!verb) return null
  if (verb === g.nominate.verb) {
    const teamId = field(tokens, g.nominate.team)
    const playerId = field(tokens, g.nominate.player)
    const amount = field(tokens, g.nominate.amount)
    return teamId !== null && playerId !== null && amount !== null ? { kind: 'nominated', teamId, playerId, amount } : null
  }
  if (verb === g.bid.verb) {
    const teamId = field(tokens, g.bid.team)
    const amount = field(tokens, g.bid.amount)
    return teamId !== null && amount !== null ? { kind: 'bid', teamId, playerId: field(tokens, g.bid.player), amount } : null
  }
  if (verb === g.sold.verb) {
    const teamId = field(tokens, g.sold.team)
    const playerId = field(tokens, g.sold.player)
    return teamId !== null && playerId !== null ? { kind: 'sold', teamId, playerId, amount: field(tokens, g.sold.amount) } : null
  }
  return NOISE_VERBS.has(verb) ? null : { kind: 'unknown', verb }
}

export function decodeFrame(data: string, g: AuctionGrammar = GRAMMAR): RawEvent[] {
  return splitLines(data)
    .map((line) => decodeLine(line, g))
    .filter((e): e is RawEvent => e !== null)
}
```

- [ ] **Step 2: Append `lineFor` to `test/helpers.ts`** (move its import up with the others)

```ts
import type { VerbMap } from '../src/capture/decoder'

/** Builds a socket line for a grammar entry, so tests hold whatever verbs ESPN uses. */
export function lineFor(m: VerbMap, v: { team: number; player?: number; amount?: number }): string {
  const tokens = Array.from({ length: Math.max(m.team, m.player ?? 0, m.amount ?? 0) + 1 }, () => '0')
  tokens[0] = m.verb
  tokens[m.team] = String(v.team)
  if (m.player !== null && v.player !== undefined) tokens[m.player] = String(v.player)
  if (m.amount !== null && v.amount !== undefined) tokens[m.amount] = String(v.amount)
  return tokens.join(' ')
}
```

- [ ] **Step 3: Write the failing tests**

`test/capture/decoder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeFrame, decodeLine, GRAMMAR as g } from '../../src/capture/decoder'
import { lineFor } from '../helpers'

describe('decodeLine', () => {
  it('decodes a nomination', () => {
    expect(decodeLine(lineFor(g.nominate, { team: 3, player: 3112335, amount: 1 }))).toEqual({ kind: 'nominated', teamId: 3, playerId: 3112335, amount: 1 })
  })

  it('decodes a bid', () => {
    expect(decodeLine(lineFor(g.bid, { team: 4, player: 3112335, amount: 7 }))).toEqual({ kind: 'bid', teamId: 4, playerId: g.bid.player === null ? null : 3112335, amount: 7 })
  })

  it('decodes a sale', () => {
    expect(decodeLine(lineFor(g.sold, { team: 4, player: 3112335, amount: 7 }))).toEqual({ kind: 'sold', teamId: 4, playerId: 3112335, amount: g.sold.amount === null ? null : 7 })
  })

  it('skips noise and flags unknown verbs', () => {
    expect(decodeLine('CLOCK 6 85495 1')).toBeNull()
    expect(decodeLine('PONG PING%201')).toBeNull()
    expect(decodeLine('ZZZ_NOT_A_VERB 1 2')).toEqual({ kind: 'unknown', verb: 'ZZZ_NOT_A_VERB' })
  })

  it('drops a known verb with garbage fields', () => {
    expect(decodeLine(`${g.nominate.verb} x y z`)).toBeNull()
  })
})

describe('decodeFrame', () => {
  it('decodes every line of a batched frame', () => {
    const data = `CLOCK 6 1 2\n${lineFor(g.nominate, { team: 3, player: 9, amount: 1 })}\n`
    expect(decodeFrame(data)).toEqual([{ kind: 'nominated', teamId: 3, playerId: 9, amount: 1 }])
  })
})
```

`test/capture/assembler.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createAssembler } from '../../src/capture/assembler'

const key = (id: number) => `p${id}`

describe('createAssembler', () => {
  it('turns nomination, bids and sale into draft events, pricing the sale from the last bid', () => {
    const a = createAssembler(key)
    expect(a.push({ kind: 'nominated', teamId: 2, playerId: 9, amount: 1 })).toEqual([{ type: 'nominated', playerKey: 'p9', teamId: 2, amount: 1 }])
    expect(a.push({ kind: 'bid', teamId: 3, playerId: null, amount: 5 })).toEqual([{ type: 'bid', teamId: 3, amount: 5 }])
    expect(a.push({ kind: 'sold', teamId: 3, playerId: 9, amount: null })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 3, price: 5 }])
  })

  it('prefers the price on the sale frame when there is one', () => {
    const a = createAssembler(key)
    a.push({ kind: 'nominated', teamId: 2, playerId: 9, amount: 1 })
    expect(a.push({ kind: 'sold', teamId: 2, playerId: 9, amount: 6 })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 2, price: 6 }])
  })

  it('ignores bids with nothing on the block or for another player', () => {
    const a = createAssembler(key)
    expect(a.push({ kind: 'bid', teamId: 3, playerId: null, amount: 5 })).toEqual([])
    a.push({ kind: 'nominated', teamId: 2, playerId: 9, amount: 1 })
    expect(a.push({ kind: 'bid', teamId: 3, playerId: 10, amount: 5 })).toEqual([])
  })

  it('prices a sale it never saw nominated at $1 (fix it with ✎ in the panel)', () => {
    expect(createAssembler(key).push({ kind: 'sold', teamId: 2, playerId: 9, amount: null })).toEqual([{ type: 'sold', playerKey: 'p9', teamId: 2, price: 1 }])
  })

  it('drops unknown events', () => {
    expect(createAssembler(key).push({ kind: 'unknown', verb: 'X' })).toEqual([])
  })
})
```

`test/capture/recorded-draft.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createAssembler } from '../../src/capture/assembler'
import { decodeFrame } from '../../src/capture/decoder'
import type { Recording } from '../../src/capture/recording'
import type { DraftEvent } from '../../src/engine/types'

const rec = JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording
const notes = JSON.parse(readFileSync('test/fixtures/espn-auction-notes.json', 'utf8'))
const incoming = rec.frames.filter((f) => f.dir === 'in')
const raws = incoming.flatMap((f) => decodeFrame(f.data))
const assembler = createAssembler((id) => `espn:${id}`)
const events: DraftEvent[] = raws.flatMap((r) => assembler.push(r))

describe('recorded ESPN salary-cap draft', () => {
  it('every incoming verb is either decoded or known noise', () => {
    expect([...new Set(raws.filter((r) => r.kind === 'unknown').map((r) => (r as { verb: string }).verb))]).toEqual([])
  })

  it('the first nomination, bid and sale match what was on screen', () => {
    expect(events.find((e) => e.type === 'nominated')).toEqual({ type: 'nominated', playerKey: `espn:${notes.firstNomination.espnId}`, teamId: notes.firstNomination.teamId, amount: notes.firstNomination.amount })
    expect(events.find((e) => e.type === 'bid')).toEqual({ type: 'bid', teamId: notes.firstBid.teamId, amount: notes.firstBid.amount })
    expect(events.find((e) => e.type === 'sold')).toEqual({ type: 'sold', playerKey: `espn:${notes.firstSale.espnId}`, teamId: notes.firstSale.teamId, price: notes.firstSale.price })
  })
})
```

Append to `test/controller.test.ts` (add `lineFor` to the `./helpers` import and `import { GRAMMAR } from '../src/capture/decoder'` at the top):

```ts
describe('live decoding', () => {
  const nominate = (dir: 'in' | 'out') => ({ dir, data: lineFor(GRAMMAR.nominate, { team: 2, player: 3112335, amount: 1 }), t: 1, url: 'wss://fantasydraft.espn.com/x' })

  it('decodes incoming frames into draft events and goes live', async () => {
    const { c, views } = await make({ values: [pv('Alpha', 30, { espnId: 3112335 }), pv('Bravo', 20)] })
    c.onFrame(nominate('in'))
    expect(views.at(-1)!.health).toBe('live')
    expect(c.getState().live).toEqual({ playerKey: 'alpha', price: 1, leaderId: 2 })
  })

  it('records outgoing frames without decoding them', async () => {
    const { c, views } = await make({ values: [pv('Alpha', 30, { espnId: 3112335 })] })
    c.onFrame(nominate('out'))
    expect(views.at(-1)!.health).toBe('manual')
    expect(c.getState().live).toBeNull()
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run test/capture test/controller.test.ts`
Expected: FAIL. The assembler module is missing; controller live tests fail (`health` stays `manual`).

- [ ] **Step 5: Implement the assembler and wire the controller**

`src/capture/assembler.ts`:

```ts
import type { DraftEvent } from '../engine/types'
import type { RawEvent } from './decoder'

/** Tracks the player on the block so bids without a player id, and sales without a price, resolve. */
export function createAssembler(idToKey: (espnId: number) => string) {
  let live: { playerKey: string; price: number } | null = null
  return {
    push(raw: RawEvent): DraftEvent[] {
      switch (raw.kind) {
        case 'nominated': {
          const playerKey = idToKey(raw.playerId)
          live = { playerKey, price: raw.amount }
          return [{ type: 'nominated', playerKey, teamId: raw.teamId, amount: raw.amount }]
        }
        case 'bid': {
          if (!live || (raw.playerId !== null && idToKey(raw.playerId) !== live.playerKey)) return []
          live = { ...live, price: Math.max(live.price, raw.amount) }
          return [{ type: 'bid', teamId: raw.teamId, amount: raw.amount }]
        }
        case 'sold': {
          const playerKey = idToKey(raw.playerId)
          const price = raw.amount ?? (live?.playerKey === playerKey ? live.price : 1)
          live = null
          return [{ type: 'sold', playerKey, teamId: raw.teamId, price }]
        }
        default:
          return []
      }
    },
  }
}
```

In `src/controller.ts`, make these exact changes:

1. Add imports:

```ts
import { createAssembler } from './capture/assembler'
import { decodeFrame } from './capture/decoder'
```

2. Replace `const health: Health = 'manual'` and the `publish` line with:

```ts
  const byEspnId = new Map(values.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, v.key] as const])))
  const assembler = createAssembler((id) => byEspnId.get(id) ?? `espn:${id}`)
  let health: Health = 'manual'
  const publish = () => deps.render({ advice: advise(state), state, health, banner, frameCount: frames.length })
  const apply = (ev: DraftEvent) => {
    state = reduce(state, ev)
    log.push(ev)
    saveEvents(deps.storage, deps.leagueId, log)
  }
```

3. Replace the returned `dispatch` and `onFrame` with:

```ts
    dispatch(ev) {
      apply(ev)
      publish()
    },
    onFrame(frame) {
      frames.push(frame)
      if (frame.dir === 'in') {
        for (const raw of decodeFrame(frame.data)) {
          for (const ev of assembler.push(raw)) {
            health = 'live'
            apply(ev)
          }
        }
      }
      publish()
    },
```

- [ ] **Step 6: Run everything and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS, including `recorded-draft.test.ts` against the real recording.

- [ ] **Step 7: Commit**

```bash
git add src/capture/decoder.ts src/capture/assembler.ts src/controller.ts test/helpers.ts test/capture/decoder.test.ts test/capture/assembler.test.ts test/capture/recorded-draft.test.ts test/controller.test.ts
git commit -m "feat(helper): decode ESPN auction socket into live draft events" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: README, draft-day refresh, and dry run

**Files:**
- Create: `espn-auction-helper/README.md`

**Interfaces:**
- Consumes: every npm script defined above.
- Produces: user-facing docs; a verified dry run.

- [ ] **Step 1: Write the README**

`espn-auction-helper/README.md`:

````markdown
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

**Download recording** saves every socket frame. Raw recordings contain your ESPN SWID and draft join code: keep them in `recordings/` (git-ignored) and only commit the output of `npm run scrub -- recording <raw> <out>`.

## Tuning

All thresholds live in `src/engine/constants.ts`. `test/replay.test.ts` replays Josh's 156-sale mock: run `npm test` after any change to make sure the engine still makes his calls.
````

- [ ] **Step 2: Final automated verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: every test PASSES, typecheck is clean, `dist/` is rebuilt. Paste the vitest summary line into the task report.

- [ ] **Step 3: [HUMAN] Dry run in a live room**

In an ESPN salary-cap mock or test league draft, with the freshly built extension:

- [ ] Panel shows **● live** within one nomination.
- [ ] Each sale in the panel matches ESPN's board: player, team, price.
- [ ] Every team's money left matches ESPN's display.
- [ ] The call updates within about a second of each bid.
- [ ] Refresh the page mid-draft: sales and pins survive.
- [ ] Manual entry works: type one sale by hand and confirm it appears and isn't duplicated when the live one arrives.

Record results in the task report. If a check fails, file the failing frame lines (scrubbed) and stop.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(helper): README with setup, draft-day steps and privacy notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
