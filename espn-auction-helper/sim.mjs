import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { basename } from 'node:path'
import * as esbuild from 'esbuild'

// Dev server for the simulator page: rebuilds on save and reloads the page.
const PORT = Number(process.env.SIM_PORT ?? 5173)
// Projections the page scores with: the Hashtag export, plus the sheet's GP/MPG edits when present.
// Copied at start: restart after editing them.
const STATS = 'data/hashtag-projections.csv'
const PLAYTIME = 'data/auction-values.csv'

mkdirSync('sim/dist', { recursive: true })
for (const file of [STATS, PLAYTIME]) if (existsSync(file)) copyFileSync(file, `sim/dist/${basename(file)}`)
if (!existsSync(STATS)) console.warn(`No ${STATS}: the page will skip projected standings.`)

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
