import { execSync } from 'node:child_process'
import { copyFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseProjectionsCsv } from '../src/values/projections'

// Brings the projections sheet's Export CSV into the repo: data/auction-values.csv, then data/values.json.
// Usage: npm run sync-sheet [-- path/to/export.csv]   (default: the newest ~/Downloads/auction-values*.csv)
const DEST = 'data/auction-values.csv'
const MIN_PLAYERS = 150

function newestExport(): string {
  const dir = join(homedir(), 'Downloads')
  const files = readdirSync(dir).filter((f) => /^auction-values.*\.csv$/.test(f)).map((f) => join(dir, f))
  if (!files.length) throw new Error(`No auction-values*.csv in ${dir}: click Export CSV in the projections sheet first`)
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

try {
  const src = process.argv[2] ?? newestExport()
  const players = parseProjectionsCsv(readFileSync(src, 'utf8'))
  if (players.length < MIN_PLAYERS) throw new Error(`${src} has ${players.length} players; expected at least ${MIN_PLAYERS}`)
  copyFileSync(src, DEST)
  console.log(`${src} -> ${DEST} (${players.length} players)`)
  execSync('npm run -s values', { stdio: 'inherit' })
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}
