import { resetTunables, setTunables, type Tunables } from '../engine/constants'
import type { PlayerValue } from '../values/types'
import type { BatchArgs } from './batchArgs'
import { runDraft, summarize, type DraftResult, type Summary } from './run'
import type { ProjectionSource } from './score'

export interface BatchInput {
  args: BatchArgs
  values: PlayerValue[]
  projections: ProjectionSource | null
  onDraft?: (done: number, total: number) => void
}

/** Every policy over the same seeds, once per tunables config; tunables always end at their defaults. */
export function runBatch(input: BatchInput): Summary[] {
  const { args } = input
  const overrides = Object.keys(args.set).length > 0
  const configs: Array<{ label: string; set: Partial<Tunables> }> = args.compare
    ? [{ label: 'defaults', set: {} }, { label: 'overrides', set: args.set }]
    : [{ label: overrides ? 'overrides' : 'defaults', set: args.set }]
  const total = configs.length * args.policies.length * args.drafts
  let done = 0
  const out: Summary[] = []
  try {
    for (const config of configs) {
      resetTunables()
      setTunables(config.set)
      for (const policy of args.policies) {
        const results: DraftResult[] = []
        for (let i = 0; i < args.drafts; i++) {
          results.push(runDraft({ seed: args.seed + i, policy, values: input.values, projections: input.projections, options: { room: args.room } }))
          input.onDraft?.(++done, total)
        }
        out.push(summarize(`${config.label} · ${policy}`, results))
      }
    }
  } finally {
    resetTunables()
  }
  return out
}
