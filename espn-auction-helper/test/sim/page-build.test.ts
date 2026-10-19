import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('simulator page bundle', () => {
  it('bundles src/sim/page.ts with its data, projection CSVs included so edits reload the page', async () => {
    const result = await build({ entryPoints: ['src/sim/page.ts'], bundle: true, write: false, format: 'esm', target: 'es2022', logLevel: 'silent', loader: { '.csv': 'text' } })
    expect(result.errors).toHaveLength(0)
    const js = result.outputFiles[0].text
    expect(js).toContain('Draft simulator')
    expect(js).toContain('"R#","PLAYER","ADP"') // data/hashtag-projections.csv
    expect(js).toContain('"VALUED AT","Y! AVG"') // data/auction-values.csv
  }, 60_000)
})
