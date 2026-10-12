import { DEFAULT_TUNABLES, type Tunables } from '../engine/constants'
import { ROOMS } from './bots'
import { POLICIES, type PolicyName } from './policies'

export interface BatchArgs {
  drafts: number
  /** draft i uses seed + i */
  seed: number
  room: number
  policies: PolicyName[]
  set: Partial<Tunables>
  /** run defaults and the --set overrides on the same seeds */
  compare: boolean
  json: boolean
}

export const BATCH_USAGE = `Usage: npm run sim:batch -- [--drafts 100] [--seed 1] [--room cold|neutral|hot|<number>]
  [--policies autopilot,market,consensus] [--set NAME=value ...] [--compare] [--json]`

function parseSet(text: string): [keyof Tunables, number] {
  const eq = text.indexOf('=')
  if (eq < 1) throw new Error('expected --set NAME=value')
  const name = text.slice(0, eq)
  const raw = text.slice(eq + 1)
  if (!Object.hasOwn(DEFAULT_TUNABLES, name)) throw new Error(`unknown tunable ${name}`)
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(n)) throw new Error(`tunable ${name} must be a finite number`)
  return [name as keyof Tunables, n]
}

function parseRoom(text: string): number {
  if (Object.hasOwn(ROOMS, text)) return ROOMS[text as keyof typeof ROOMS]
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) throw new Error('room must be cold, neutral, hot or a positive number')
  return n
}

export function parseBatchArgs(argv: string[]): BatchArgs {
  const args: BatchArgs = { drafts: 100, seed: 1, room: ROOMS.neutral, policies: [...POLICIES], set: {}, compare: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${flag} needs a value`)
      return v
    }
    switch (flag) {
      case '--drafts': {
        const n = Number(value())
        if (!Number.isInteger(n) || n < 1) throw new Error('drafts must be a positive integer')
        args.drafts = n
        break
      }
      case '--seed': {
        const n = Number(value())
        if (!Number.isInteger(n)) throw new Error('seed must be an integer')
        args.seed = n
        break
      }
      case '--room':
        args.room = parseRoom(value())
        break
      case '--policies': {
        const names = value().split(',').map((s) => s.trim()).filter(Boolean)
        const bad = names.find((n) => !POLICIES.includes(n as PolicyName))
        if (bad !== undefined) throw new Error(`unknown policy ${bad}`)
        args.policies = names as PolicyName[]
        break
      }
      case '--set': {
        const [name, n] = parseSet(value())
        args.set[name] = n
        break
      }
      case '--compare':
        args.compare = true
        break
      case '--json':
        args.json = true
        break
      default:
        throw new Error(`unknown flag ${flag}`)
    }
  }
  if (args.compare && Object.keys(args.set).length === 0) throw new Error('--compare needs at least one --set')
  return args
}
