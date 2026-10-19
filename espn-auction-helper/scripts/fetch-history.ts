import { writeFileSync } from 'node:fs'
import type { FetchLike } from '../src/espn/common'
import { fetchHistory, HISTORY_PATH, HISTORY_SEASONS } from '../src/espn/history'

// ESPN rejects requests without a browser User-Agent.
const withUserAgent: FetchLike = (url, init) =>
  fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': 'Mozilla/5.0' } })

const history = await fetchHistory(withUserAgent)
const players = Object.keys(history).length
if (players < 300) throw new Error(`expected games for at least 300 players, got ${players}`)
writeFileSync(HISTORY_PATH, JSON.stringify(history))
console.log(`wrote games played for ${players} players, seasons ${HISTORY_SEASONS.join(', ')}`)
