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
