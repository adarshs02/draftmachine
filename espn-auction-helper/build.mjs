import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

const common = { bundle: true, format: 'iife', target: 'chrome120', sourcemap: true, logLevel: 'warning' }
await build({ ...common, entryPoints: ['src/capture/hook.ts'], outfile: 'dist/hook.js' })
await build({ ...common, entryPoints: ['src/content.ts'], outfile: 'dist/content.js' })
cpSync('manifest.json', 'dist/manifest.json')
