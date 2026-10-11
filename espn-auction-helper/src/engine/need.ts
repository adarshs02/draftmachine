import { BENCH_SLOT, IR_SLOT } from '../espn/slots'
import { NEED_BOOST, NEED_MIN_VALUE, THIN_FACTOR } from './constants'
import { available, valueOf } from './metrics'
import type { DraftState } from './types'

export function startingSlots(counts: Record<number, number>): number[] {
  const out: number[] = []
  for (const [id, n] of Object.entries(counts)) {
    const slot = Number(id)
    if (slot === BENCH_SLOT || slot === IR_SLOT) continue
    for (let i = 0; i < n; i++) out.push(slot)
  }
  // Specific positions (0-4) come before flexible ones, so "unfilled" names the real hole.
  return out.sort((a, b) => a - b)
}

/** Bipartite matching (Kuhn's algorithm) of players' eligible slots onto lineup slots. */
export function maxMatching(players: number[][], slots: number[]): { size: number; unfilled: number[] } {
  const owner = new Array<number>(slots.length).fill(-1)
  const assign = (p: number, seen: boolean[]): boolean => {
    for (let j = 0; j < slots.length; j++) {
      if (seen[j] || !players[p].includes(slots[j])) continue
      seen[j] = true
      if (owner[j] === -1 || assign(owner[j], seen)) {
        owner[j] = p
        return true
      }
    }
    return false
  }
  let size = 0
  for (let p = 0; p < players.length; p++) if (assign(p, new Array<boolean>(slots.length).fill(false))) size++
  return { size, unfilled: slots.filter((_, j) => owner[j] === -1) }
}

const rosterSlots = (s: DraftState, teamId: number) => s.sales.filter((x) => x.teamId === teamId).map((x) => valueOf(s, x.playerKey).slots)

export function needBoost(s: DraftState, playerKey: string): number {
  if (s.myTeamId === null) return 1
  const slots = startingSlots(s.settings.lineupSlotCounts)
  const mine = rosterSlots(s, s.myTeamId)
  const before = maxMatching(mine, slots)
  const candidate = valueOf(s, playerKey).slots
  const after = maxMatching([...mine, candidate], slots)
  if (after.size <= before.size) return 1

  // Slots that get filled once the candidate joins, including holes filled by re-routing a rostered player.
  const filled = [...before.unfilled]
  for (const slot of after.unfilled) {
    const i = filled.indexOf(slot)
    if (i >= 0) filled.splice(i, 1)
  }
  const needed = [...new Set(filled)]
  const supplyPool = available(s).filter((v) => v.key !== playerKey && v.b >= NEED_MIN_VALUE)
  const demand = new Map<number, number>()
  for (const t of s.settings.teams) {
    for (const slot of maxMatching(rosterSlots(s, t.id), slots).unfilled) demand.set(slot, (demand.get(slot) ?? 0) + 1)
  }
  const thin = needed.some((slot) => supplyPool.filter((v) => v.slots.includes(slot)).length < THIN_FACTOR * (demand.get(slot) ?? 0))
  return thin ? NEED_BOOST : 1
}
