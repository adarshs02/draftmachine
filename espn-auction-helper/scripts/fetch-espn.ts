import { writeFileSync } from 'node:fs'
import type { FetchLike } from '../src/espn/common'
import { fetchPlayers } from '../src/espn/players'

// ESPN rejects requests without a browser User-Agent.
const withUserAgent: FetchLike = (url, init) =>
  fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': 'Mozilla/5.0' } })

const players = await fetchPlayers(withUserAgent)
if (players.length < 300) throw new Error(`expected at least 300 players, got ${players.length}`)
writeFileSync('data/espn-players-2027.json', JSON.stringify(players, null, 1))
console.log(`wrote ${players.length} players; top: ${players.slice(0, 3).map((p) => `${p.name} $${p.roto}`).join(', ')}`)
