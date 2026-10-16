import { existsSync, readFileSync } from 'node:fs'
import { runBatch } from '../src/sim/batch'
import { BATCH_USAGE, inertNote, parseBatchArgs, type BatchArgs } from '../src/sim/batchArgs'
import { formatTable } from '../src/sim/run'
import { PLAYTIME_PATH, projectionsFromCsv, STATS_PATH } from '../src/values/seasonStats'
import type { PlayerValue } from '../src/values/types'

function argsOrExit(): BatchArgs {
  try {
    return parseBatchArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    console.error(BATCH_USAGE)
    process.exit(1)
  }
}

const args = argsOrExit()
const note = inertNote(args.set)
if (note) console.warn(note)
const values = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
const projections = projectionsFromCsv(read(STATS_PATH), read(PLAYTIME_PATH), values)
if (!projections) console.warn(`No ${STATS_PATH}: skipping projected standings (value captured and money left only).`)

const started = performance.now()
let drafts = 0
const summaries = runBatch({
  args,
  values,
  projections,
  onDraft: (done, total) => {
    drafts = total
    if (!args.json && (done % 10 === 0 || done === total)) process.stderr.write(`\r${done}/${total} drafts`)
  },
})
const seconds = (performance.now() - started) / 1000
if (args.json) {
  console.log(JSON.stringify({ args, seconds, summaries }, null, 2))
} else {
  process.stderr.write('\n')
  console.log(formatTable(summaries))
  console.log(`\n${drafts} drafts in ${seconds.toFixed(1)} s · seeds ${args.seed}-${args.seed + args.drafts - 1} · room ${args.room}`)
}
