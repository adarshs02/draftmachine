export interface Frame {
  dir: 'in' | 'out'
  data: string
  t: number
  url: string
}

export const DRAFT_SOCKET_HOST = 'fantasydraft.espn.com'

/** ESPN batches several space-delimited commands per frame, one per line. */
export const splitLines = (data: string): string[] =>
  data
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
