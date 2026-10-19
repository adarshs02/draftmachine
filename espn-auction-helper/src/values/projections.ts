/**
 * Player projections exported as CSV (Hashtag Basketball's auction values layout), or the same
 * layout saved back from the projections sheet after editing.
 */
export interface ProjectionRow {
  rank: number
  name: string
  /** eligible positions, comma-separated ("PG,SG") */
  pos: string
  team: string
  /** projected games played */
  gp: number
  mpg: number
  /** total z-score over the categories; value is a straight line in it */
  z: number
  /** projected auction value ("VALUED AT"), 0 below replacement level */
  value: number
  /** the user's note from the projections sheet (its NOTE column), when there is one */
  note?: string
}

const HEADER = ['R#', 'PLAYER', 'POS', 'TEAM', 'GP', 'MPG', 'TOTAL', 'VALUED AT']

/** One CSV line into fields: double-quoted or bare, `""` inside quotes is a quote. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') field += line[++i]
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(field)
      field = ''
    } else field += c
  }
  out.push(field)
  return out
}

const money = (s: string) => Number(s.replace('$', '').trim()) || 0

export function parseProjectionsCsv(text: string): ProjectionRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const header = splitCsvLine(lines[0] ?? '')
  if (HEADER.some((h, i) => header[i] !== h)) throw new Error(`unexpected projections CSV header: ${lines[0]}`)
  const noteAt = header.indexOf('NOTE')
  const rows: ProjectionRow[] = []
  lines.slice(1).forEach((line, i) => {
    const f = splitCsvLine(line)
    if (f[0] === 'R#') return // the export repeats its header every few rows
    if (f.length < HEADER.length) throw new Error(`projections CSV row ${i + 2} has ${f.length} fields: ${line}`)
    const [rank, name, pos, team, gp, mpg, z, value] = f
    const note = noteAt >= 0 ? f[noteAt]?.trim() : ''
    rows.push({ rank: Number(rank), name, pos, team, gp: Number(gp), mpg: Number(mpg), z: Number(z), value: money(value), ...(note ? { note } : {}) })
  })
  return rows
}
