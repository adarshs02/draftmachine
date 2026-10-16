import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { HISTORY_PATH, type GamesHistory } from '../src/espn/history'
import type { EspnPlayer } from '../src/espn/players'
import { blendValues } from '../src/values/blend'
import { withInjuries } from '../src/values/injury'
import { parseJoshCsv } from '../src/values/josh'
import { parseProjectionsCsv } from '../src/values/projections'
import { PLAYTIME_PATH, STATS_PATH, withLines } from '../src/values/seasonStats'

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
const espn = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
const josh = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))
const projections = parseProjectionsCsv(readFileSync('data/auction-values.csv', 'utf8'))
const { values: blended, unmatchedJosh, unmatchedProjections, basis, ratios } = blendValues(espn, josh, projections)
const stats = read(STATS_PATH)
const history = read(HISTORY_PATH)
const values = withInjuries(withLines(blended, stats, read(PLAYTIME_PATH)), history === null ? null : (JSON.parse(history) as GamesHistory))
writeFileSync('data/values.json', JSON.stringify(values, null, 1))
console.log(`basis ${basis.toFixed(3)}  tier ratios ${JSON.stringify(ratios)}`)
console.log(`unmatched Josh rows: ${unmatchedJosh.length ? unmatchedJosh.join(', ') : 'none'}`)
console.log(`projected players missing from ESPN: ${unmatchedProjections.length ? unmatchedProjections.join(', ') : 'none'}`)
console.log(stats === null ? `No ${STATS_PATH}: no stat lines, so category fit is off.` : `stat lines: ${values.filter((v) => v.line).length} of ${values.length} players`)
const labelled = (label: string) => values.filter((v) => v.injury?.label === label).length
console.log(history === null ? `No ${HISTORY_PATH}: no injury labels (npm run fetch-history).` : `injury labels: ${labelled('prone')} injury prone, ${labelled('recent')} coming off injury`)
console.log(values.slice(0, 12).map((v) => `${v.name} $${v.b}`).join('\n'))
