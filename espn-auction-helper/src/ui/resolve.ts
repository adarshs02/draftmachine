import type { DraftState } from '../engine/types'
import { normalizeName } from '../values/names'
import type { PlayerValue } from '../values/types'

export type Resolved = { key: string } | { error: string; matches: number }

const lastName = (key: string) => key.slice(key.lastIndexOf(' ') + 1)

/**
 * Typed text -> a real player key, so a partial name never becomes a phantom player.
 * Tries, in order: exact key, unique key prefix, unique last name; sold players included.
 */
export function resolvePlayer(state: DraftState, text: string): Resolved {
  const typed = normalizeName(text)
  const shown = text.trim()
  if (typed && Object.hasOwn(state.values, typed)) return { key: typed }
  const all = typed ? Object.values(state.values) : []
  const byPrefix = all.filter((v) => v.key.startsWith(typed))
  if (byPrefix.length === 1) return { key: byPrefix[0].key }
  const byLast = all.filter((v) => lastName(v.key) === typed)
  if (byLast.length === 1) return { key: byLast[0].key }

  const matches: PlayerValue[] = [...new Set([...byPrefix, ...byLast])].sort((a, b) => b.b - a.b)
  if (!matches.length) return { error: `No player matches "${shown}"`, matches: 0 }
  const names = matches.slice(0, 3).map((v) => v.name).join(', ')
  return { error: `"${shown}" matches ${matches.length} players: ${names}${matches.length > 3 ? '…' : ''}`, matches: matches.length }
}
