import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('build', () => {
  // Builds into a temp dir: never wipes the dist/ loaded in Chrome.
  it('emits the manifest and both bundles', () => {
    const out = mkdtempSync(join(tmpdir(), 'eah-'))
    try {
      execSync('node build.mjs', { stdio: 'pipe', env: { ...process.env, EAH_OUT: out } })
      const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
      expect(manifest.manifest_version).toBe(3)
      expect(manifest.content_scripts[0]).toMatchObject({ js: ['hook.js'], world: 'MAIN', run_at: 'document_start' })
      expect(manifest.content_scripts[1]).toMatchObject({ js: ['content.js'], run_at: 'document_start' })
      expect(existsSync(join(out, 'hook.js'))).toBe(true)
      expect(existsSync(join(out, 'content.js'))).toBe(true)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 30_000)
})
