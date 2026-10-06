import { readFileSync, writeFileSync } from 'node:fs'
import type { EspnPlayer } from '../src/espn/players'
import { blendValues } from '../src/values/blend'
import { parseJoshCsv } from '../src/values/josh'

const espn = JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]
const josh = parseJoshCsv(readFileSync('data/josh-lloyd-2026-auction-mock.csv', 'utf8'))
const { values, unmatchedJosh, basis, ratios } = blendValues(espn, josh)
writeFileSync('data/values.json', JSON.stringify(values, null, 1))
console.log(`basis ${basis.toFixed(3)}  tier ratios ${JSON.stringify(ratios)}`)
console.log(`unmatched Josh rows: ${unmatchedJosh.length ? unmatchedJosh.join(', ') : 'none'}`)
console.log(values.slice(0, 12).map((v) => `${v.name} $${v.b}`).join('\n'))
