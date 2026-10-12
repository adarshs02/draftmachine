import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('simulator page bundle', () => {
  it('bundles src/sim/page.ts with its JSON data', async () => {
    const result = await build({ entryPoints: ['src/sim/page.ts'], bundle: true, write: false, format: 'esm', target: 'es2022', logLevel: 'silent' })
    expect(result.errors).toHaveLength(0)
    expect(result.outputFiles[0].text).toContain('Draft simulator')
  }, 60_000)
})
