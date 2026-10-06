import { teamSummary } from './metrics'
import type { DraftState } from './types'

export interface NominationTurn {
  /** team nominating now (null while a player is on the block) */
  onClock: number | null
  /** team that nominates after the current auction (only while a player is on the block) */
  upNext: number | null
  /** 0 = I nominate now/next; null = my team unknown or my roster full */
  turnsUntilMe: number | null
}

/** ESPN rotates nominations through the draft order (settings.teams) and skips full rosters. */
export function nominationTurn(s: DraftState): NominationTurn {
  const order = s.settings.teams.map((t) => t.id)
  const hasRoom = (id: number) => teamSummary(s, id).open > 0
  /** First team after `id` (wrapping) with room; the first team with room when `id` is unknown. */
  const nextAfter = (id: number | null): number | null => {
    const at = id === null ? -1 : order.indexOf(id)
    for (let i = 1; i <= order.length; i++) {
      const candidate = order[(at + i + order.length) % order.length]
      if (hasRoom(candidate)) return candidate
    }
    return null
  }
  const onBlock = s.live !== null
  const onClock = onBlock ? null : s.turnTeamId !== null && hasRoom(s.turnTeamId) ? s.turnTeamId : nextAfter(s.lastNominatorId)
  const upNext = onBlock ? nextAfter(s.lastNominatorId) : null

  let turnsUntilMe: number | null = null
  const me = s.myTeamId
  let at = onClock ?? upNext
  if (me !== null && at !== null && hasRoom(me)) {
    let steps = 0
    while (at !== me && steps <= order.length) {
      at = nextAfter(at)
      steps++
    }
    turnsUntilMe = at === me ? steps : null
  }
  return { onClock, upNext, turnsUntilMe }
}
