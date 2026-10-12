import { spawn } from 'node:child_process'
import * as esbuild from 'esbuild'

// Dev server for the simulator page: rebuilds on save and reloads the page. Data files are bundled
// (values.json, and the projection CSVs as text), so syncing projections reloads it too.
const PORT = Number(process.env.SIM_PORT ?? 5173)

const ctx = await esbuild.context({
  entryPoints: ['src/sim/page.ts'],
  outfile: 'sim/dist/page.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  loader: { '.csv': 'text' },
  logLevel: 'info',
  banner: { js: "new EventSource('/esbuild').addEventListener('change', () => location.reload());" },
})
await ctx.watch()
const { port } = await ctx.serve({ servedir: 'sim', host: '127.0.0.1', port: PORT })
const url = `http://127.0.0.1:${port}/`
console.log(`Draft simulator: ${url}`)
if (process.argv.includes('--open')) spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
