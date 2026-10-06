import { splitLines } from './frames'

/** Where a verb's fields sit: 1-based token indexes (token 0 is the verb itself). */
export interface VerbMap {
  verb: string
  team: number
  player: number | null
  amount: number | null
}

export interface AuctionGrammar {
  /** ESPN has no nominate verb: the first BID on a new player is the nomination. */
  nominate: VerbMap | null
  bid: VerbMap
  sold: VerbMap
  /** A team is on the clock to nominate: the previous auction is over. */
  turn: VerbMap
}

// From the recording in test/fixtures/espn-auction-recording.json (Task 16/17).
export const GRAMMAR: AuctionGrammar = {
  nominate: null,
  bid: { verb: 'BID', team: 1, player: 2, amount: 3 },
  sold: { verb: 'SOLD', team: 1, player: 2, amount: 4 },
  turn: { verb: 'NOMINATION', team: 1, player: null, amount: null },
}

/** Socket verbs that carry nothing the engine needs. */
export const NOISE_VERBS = new Set([
  'PING', 'PONG', 'CLOCK', 'TOKEN', 'INIT', 'JOINED', 'LEFT', 'STATE', 'SELECTING', 'AUTOSUGGEST', 'AUTODRAFT', 'DRAFT_LIST', 'ERROR',
  'BID_ACK', 'PROJECTED_STANDINGS',
])

export type RawEvent =
  | { kind: 'nominated'; teamId: number; playerId: number; amount: number }
  | { kind: 'bid'; teamId: number; playerId: number | null; amount: number }
  | { kind: 'sold'; teamId: number; playerId: number; amount: number | null }
  | { kind: 'turn'; teamId: number }
  | { kind: 'unknown'; verb: string }

const field = (tokens: string[], i: number | null): number | null => {
  if (i === null) return null
  const n = Number(tokens[i])
  return tokens[i] !== undefined && Number.isFinite(n) ? n : null
}

export function decodeLine(line: string, g: AuctionGrammar = GRAMMAR): RawEvent | null {
  const tokens = line.trim().split(/\s+/)
  const verb = tokens[0]
  if (!verb) return null
  if (g.nominate && verb === g.nominate.verb) {
    const teamId = field(tokens, g.nominate.team)
    const playerId = field(tokens, g.nominate.player)
    const amount = field(tokens, g.nominate.amount)
    return teamId !== null && playerId !== null && amount !== null ? { kind: 'nominated', teamId, playerId, amount } : null
  }
  if (verb === g.bid.verb) {
    const teamId = field(tokens, g.bid.team)
    const amount = field(tokens, g.bid.amount)
    return teamId !== null && amount !== null ? { kind: 'bid', teamId, playerId: field(tokens, g.bid.player), amount } : null
  }
  if (verb === g.sold.verb) {
    const teamId = field(tokens, g.sold.team)
    const playerId = field(tokens, g.sold.player)
    return teamId !== null && playerId !== null ? { kind: 'sold', teamId, playerId, amount: field(tokens, g.sold.amount) } : null
  }
  if (verb === g.turn.verb) {
    const teamId = field(tokens, g.turn.team)
    return teamId !== null ? { kind: 'turn', teamId } : null
  }
  return NOISE_VERBS.has(verb) ? null : { kind: 'unknown', verb }
}

export function decodeFrame(data: string, g: AuctionGrammar = GRAMMAR): RawEvent[] {
  return splitLines(data)
    .map((line) => decodeLine(line, g))
    .filter((e): e is RawEvent => e !== null)
}
