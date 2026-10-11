/** ESPN names a season by its ending year: 2027 = the 2026-27 NBA season. */
export const SEASON = 2027
export const API_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons'

export type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
