import { readFileSync } from 'node:fs'
import { verbStats } from '../src/capture/analyze'
import type { Recording } from '../src/capture/recording'
import type { EspnPlayer } from '../src/espn/players'

const file = process.argv[2]
if (!file) throw new Error('usage: npm run analyze -- <recording.json>')
const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording
const players = new Map((JSON.parse(readFileSync('data/espn-players-2027.json', 'utf8')) as EspnPlayer[]).map((p) => [String(p.id), p.name]))

for (const dir of ['in', 'out'] as const) {
  console.log(`\n=== ${dir} ===`)
  for (const s of verbStats(rec.frames, dir)) {
    console.log(`${s.verb.padEnd(16)}${String(s.count).padStart(6)}`)
    for (const line of s.samples) {
      const named = line.split(/\s+/).filter((tok) => players.has(tok)).map((tok) => `${tok}=${players.get(tok)}`)
      console.log(`    ${line.slice(0, 140)}${named.length ? `   [${named.join(', ')}]` : ''}`)
    }
  }
}
