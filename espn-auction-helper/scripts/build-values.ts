import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { EspnPlayer } from '../src/espn/players'
import { blendValues } from '../src/values/blend'
import { parseJoshCsv } from '../src/values/josh'
import { parseProjectionsCsv } from '../src/values/projections'
import { PLAYTIME_PATH, STATS_PATH, withLines } from '../src/values/seasonStats'

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
const espn = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
const josh = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))
const projections = parseProjectionsCsv(readFileSync('data/auction-values.csv', 'utf8'))
const { values: blended, unmatchedJosh, unmatchedProjections, basis, ratios } = blendValues(espn, josh, projections)
const stats = read(STATS_PATH)
const values = withLines(blended, stats, read(PLAYTIME_PATH))
writeFileSync('data/values.json', JSON.stringify(values, null, 1))
console.log(`basis ${basis.toFixed(3)}  tier ratios ${JSON.stringify(ratios)}`)
console.log(`unmatched Josh rows: ${unmatchedJosh.length ? unmatchedJosh.join(', ') : 'none'}`)
console.log(`projected players missing from ESPN: ${unmatchedProjections.length ? unmatchedProjections.join(', ') : 'none'}`)
console.log(stats === null ? `No ${STATS_PATH}: no stat lines, so category fit is off.` : `stat lines: ${values.filter((v) => v.line).length} of ${values.length} players`)
console.log(values.slice(0, 12).map((v) => `${v.name} $${v.b}`).join('\n'))
