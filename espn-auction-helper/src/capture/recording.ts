import type { Frame } from './frames'

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
