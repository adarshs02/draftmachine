import { isTokenLine, splitLines, type Frame } from './frames'

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

/** Safe to commit: no SWID/join code (TOKEN, URL query), no member GUIDs, no INIT state blob, no team/member names. */
export function scrubFrame(f: Frame, redact: string[] = []): Frame | null {
  const lines = splitLines(f.data)

  // Drop entire frame if any line starts with INIT
  if (lines.some((l) => /^INIT\b/.test(l))) {
    return null
  }

  // Filter out TOKEN lines and rejoin
  let data = lines
    .filter((l) => !isTokenLine(l))
    .join('\n')

  // Zero GUIDs
  data = data.replace(GUID, ZERO_GUID)

  // Redact names (case-insensitive, regex-escaped), longest first so "Squad" can't leave "Secret" of "Secret Squad"
  for (const name of [...redact].sort((a, b) => b.length - a.length)) {
    if (name.trim()) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'gi')
      data = data.replace(regex, 'REDACTED')
    }
  }

  // Replace league id in URL path and strip query
  let url = f.url.split('?')[0]
  url = url.replace(/league-\d+(?=\/|$)/, 'league-0')

  return data ? { ...f, data, url } : null
}

export function scrubRecording(r: Recording, redact: string[] = []): Recording {
  return {
    ...r,
    leagueId: 0,
    frames: r.frames.map((frame) => scrubFrame(frame, redact)).filter((f): f is Frame => f !== null)
  }
}

export function scrubLeagueJson(text: string): string {
  const raw = JSON.parse(text) as Record<string, unknown>

  // Remove sensitive fields from root
  delete raw.members
  delete raw.code
  delete raw.joinCode
  delete raw.inviteCode
  delete raw.password

  // Set league id to 0
  raw.id = 0

  // Handle settings
  const settings = raw.settings as Record<string, unknown> | undefined
  if (settings) {
    delete settings.name
    delete settings.code
    delete settings.joinCode
    delete settings.inviteCode
    delete settings.password
  }

  // Rename teams and strip sensitive fields
  const teams = raw.teams as Array<Record<string, unknown>> | undefined
  for (const t of teams ?? []) {
    t.name = `Team ${t.id}`
    for (const k of ['location', 'nickname', 'abbrev', 'primaryOwner', 'logo']) delete t[k]
  }

  return JSON.stringify(raw, null, 1).replace(GUID, ZERO_GUID)
}
