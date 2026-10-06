import { splitLines, type Frame } from './frames'

export interface Recording {
  leagueId: number
  startedAt: string
  savedAt: string
  frames: Frame[]
}

export function buildRecording(leagueId: number, startedAt: Date, frames: Frame[], now = new Date()): Recording {
  return { leagueId, startedAt: startedAt.toISOString(), savedAt: now.toISOString(), frames }
}

export function downloadText(doc: Document, filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = doc.createElement('a')
  a.href = url
  a.download = filename
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const GUID = /\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?/g
export const ZERO_GUID = '{00000000-0000-0000-0000-000000000000}'

/** Safe to commit: no SWID/join code (TOKEN, URL query), no member GUIDs, no INIT state blob. */
export function scrubFrame(f: Frame): Frame | null {
  const data = splitLines(f.data)
    .filter((l) => !/^(TOKEN|INIT)\b/.test(l))
    .join('\n')
    .replace(GUID, ZERO_GUID)
  return data ? { ...f, data, url: f.url.split('?')[0] } : null
}

export function scrubRecording(r: Recording): Recording {
  return { ...r, frames: r.frames.map(scrubFrame).filter((f): f is Frame => f !== null) }
}

export function scrubLeagueJson(text: string): string {
  const raw = JSON.parse(text) as { members?: unknown; teams?: Array<Record<string, unknown>> }
  delete raw.members
  for (const t of raw.teams ?? []) {
    t.name = `Team ${t.id}`
    for (const k of ['location', 'nickname', 'abbrev', 'primaryOwner', 'logo']) delete t[k]
  }
  return JSON.stringify(raw, null, 1).replace(GUID, ZERO_GUID)
}
