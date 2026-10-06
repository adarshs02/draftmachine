import type { DraftEvent } from './engine/types'

/** The page's sessionStorage in production: per tab, survives a refresh. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

const keyFor = (leagueId: number) => `eah:${leagueId}:events`

export function loadEvents(store: KeyValueStore, leagueId: number): DraftEvent[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(keyFor(leagueId)) ?? '[]')
    return Array.isArray(parsed) ? (parsed as DraftEvent[]) : []
  } catch {
    return []
  }
}

export function saveEvents(store: KeyValueStore, leagueId: number, events: DraftEvent[]): void {
  try {
    store.setItem(keyFor(leagueId), JSON.stringify(events))
  } catch {
    // Storage full or blocked: keep drafting from memory.
  }
}
