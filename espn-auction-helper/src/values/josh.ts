export type JoshKind = 'value' | 'max' | 'avoid'

export interface JoshRow {
  player: string
  low: number | null
  high: number | null
  kind: JoshKind
  sold: number | null
  winner: string
  take: string
  confidence: 'high' | 'medium' | 'low'
}

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))

export function parseJoshCsv(text: string): JoshRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const [header, ...rows] = lines
  if (!header?.startsWith('player,josh_low,josh_high')) throw new Error('unexpected Josh CSV header')
  return rows.map((line, i) => {
    const f = line.split(',')
    if (f.length !== 8) throw new Error(`Josh CSV row ${i + 2} has ${f.length} fields: ${line}`)
    const [player, low, high, kind, sold, winner, take, confidence] = f
    if (kind !== 'value' && kind !== 'max' && kind !== 'avoid') throw new Error(`Josh CSV row ${i + 2}: bad kind ${kind}`)
    return { player, low: num(low), high: num(high), kind, sold: num(sold), winner, take, confidence: confidence as JoshRow['confidence'] }
  })
}

export function joshMid(row: JoshRow): number | null {
  if (row.low === null || row.high === null) return null
  return (row.low + row.high) / 2
}
