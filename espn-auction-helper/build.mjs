import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Tests build into a temp dir (EAH_OUT) so they never wipe the dist/ loaded in Chrome.
const out = process.env.EAH_OUT ?? 'dist'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const common = { bundle: true, format: 'iife', target: 'chrome120', sourcemap: true, logLevel: 'warning' }
await build({ ...common, entryPoints: ['src/capture/hook.ts'], outfile: join(out, 'hook.js') })
await build({ ...common, entryPoints: ['src/content.ts'], outfile: join(out, 'content.js') })
cpSync('manifest.json', join(out, 'manifest.json'))
