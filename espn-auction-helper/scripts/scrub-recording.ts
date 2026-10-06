import { readFileSync, writeFileSync } from 'node:fs'
import { scrubLeagueJson, scrubRecording, type Recording } from '../src/capture/recording'

const [kind, input, output] = process.argv.slice(2)
if ((kind !== 'recording' && kind !== 'league') || !input || !output) {
  throw new Error('usage: npm run scrub -- recording|league <raw.json> <out.json>')
}
const text = readFileSync(input, 'utf8')
if (kind === 'league') {
  writeFileSync(output, scrubLeagueJson(text))
  console.log(`wrote ${output}`)
} else {
  const raw = JSON.parse(text) as Recording
  const clean = scrubRecording(raw)
  writeFileSync(output, JSON.stringify(clean, null, 1))
  console.log(`kept ${clean.frames.length} of ${raw.frames.length} frames`)
}
