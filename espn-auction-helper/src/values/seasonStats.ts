import { LINE_FIELDS, projectionsFrom, type ProjectionSource, type SeasonLine } from '../engine/h2h'
import { normalizeName } from './names'
import type { PlayerValue } from './types'

/** The user's Hashtag Basketball projections export: per-game stats (committed with the simulator). */
export const STATS_PATH = 'data/hashtag-projections.csv'
/** The projections sheet's export: its GP and MPG carry the user's edits (owned by the projections work; may be absent). */
export const PLAYTIME_PATH = 'data/auction-values.csv'

export interface PerGameRow {
  key: string
  name: string
  gp: number
  mpg: number
  perGame: SeasonLine
}

export interface Playtime {
  gp: number
  mpg: number
}

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

/** Rows keyed by the header's column names; the header rows the export repeats are skipped. */
export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) return []
  const header = splitCsvLine(lines[0])
  return lines
    .slice(1)
    .map(splitCsvLine)
    .filter((f) => f[0] !== header[0])
    .map((f) => Object.fromEntries(header.map((h, i) => [h, f[i] ?? ''])))
}

const STAT_COLUMNS = ['PLAYER', 'GP', 'MPG', 'FG%', 'FT%', '3PM', 'PTS', 'TREB', 'AST', 'STL', 'BLK', 'TO'] as const

function num(column: string, text: string, row: number): number {
  const n = Number(text)
  if (text.trim() === '' || !Number.isFinite(n)) throw new Error(`projections row ${row}: ${column} "${text}" is not a number`)
  return n
}

/** "28.4 2.22" (per game, z-score) -> 28.4 */
const perGame = (column: string, cell: string, row: number) => num(column, cell.trim().split(/\s+/)[0] ?? '', row)

/** "0.573 (10.5/18.3) 3.91" -> [10.5, 18.3] made and attempted per game */
function madeAttempted(column: string, cell: string, row: number): [number, number] {
  const m = /\(([^/)]+)\/([^)]+)\)/.exec(cell)
  if (!m) throw new Error(`projections row ${row}: ${column} "${cell}" has no (made/attempts)`)
  return [num(column, m[1], row), num(column, m[2], row)]
}

export function parseHashtagStats(text: string): PerGameRow[] {
  const records = parseCsvRecords(text)
  const missing = records.length ? STAT_COLUMNS.filter((c) => !(c in records[0])) : []
  if (missing.length) throw new Error(`projections CSV is missing columns: ${missing.join(', ')}`)
  return records.map((r, i) => {
    const row = i + 1
    const [fgm, fga] = madeAttempted('FG%', r['FG%'], row)
    const [ftm, fta] = madeAttempted('FT%', r['FT%'], row)
    return {
      key: normalizeName(r.PLAYER),
      name: r.PLAYER,
      gp: num('GP', r.GP, row),
      mpg: num('MPG', r.MPG, row),
      perGame: {
        pts: perGame('PTS', r.PTS, row),
        reb: perGame('TREB', r.TREB, row),
        ast: perGame('AST', r.AST, row),
        stl: perGame('STL', r.STL, row),
        blk: perGame('BLK', r.BLK, row),
        tpm: perGame('3PM', r['3PM'], row),
        to: perGame('TO', r.TO, row),
        fgm,
        fga,
        ftm,
        fta,
      },
    }
  })
}

/** GP and MPG by player from any CSV with PLAYER, GP and MPG columns (the projections sheet's export). */
export function parsePlaytime(text: string): Map<string, Playtime> {
  const out = new Map<string, Playtime>()
  parseCsvRecords(text).forEach((r, i) => {
    if (!('PLAYER' in r && 'GP' in r && 'MPG' in r)) throw new Error('playtime CSV needs PLAYER, GP and MPG columns')
    out.set(normalizeName(r.PLAYER), { gp: num('GP', r.GP, i + 1), mpg: num('MPG', r.MPG, i + 1) })
  })
  return out
}

/**
 * Season totals by ESPN id: per-game stats x games. Games and minutes from the sheet win over the
 * export's; per-game stats scale with the minutes, percentages stay.
 */
export function seasonProjections(stats: readonly PerGameRow[], playtime: ReadonlyMap<string, Playtime>, values: readonly PlayerValue[]): ProjectionSource {
  const byKey = new Map(stats.map((r) => [r.key, r]))
  const rows = new Map<number, SeasonLine>()
  for (const v of values) {
    if (v.espnId === null) continue
    const r = byKey.get(v.key)
    if (r) rows.set(v.espnId, seasonLine(r, playtime.get(r.key)))
  }
  return projectionsFrom(rows)
}

/** Season totals for one stats row: per-game x games; the sheet's games and minutes win, per-game stats scale with the minutes. */
export function seasonLine(r: PerGameRow, edit: Playtime | undefined): SeasonLine {
  const scale = (edit?.gp ?? r.gp) * (edit && r.mpg > 0 ? edit.mpg / r.mpg : 1)
  return Object.fromEntries(LINE_FIELDS.map((f) => [f, r.perGame[f] * scale])) as unknown as SeasonLine
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** Each value with its projected season line (rounded to 0.1); null without a stats row, and for everyone without the stats file. */
export function withLines(values: readonly PlayerValue[], statsCsv: string | null, playtimeCsv: string | null): PlayerValue[] {
  if (statsCsv === null) return values.map((v) => ({ ...v, line: null }))
  const byKey = new Map(parseHashtagStats(statsCsv).map((r) => [r.key, r]))
  const playtime = playtimeCsv === null ? new Map<string, Playtime>() : parsePlaytime(playtimeCsv)
  return values.map((v) => {
    const r = byKey.get(v.key)
    if (!r) return { ...v, line: null }
    const l = seasonLine(r, playtime.get(r.key))
    return { ...v, line: Object.fromEntries(LINE_FIELDS.map((f) => [f, round1(l[f])])) as unknown as SeasonLine }
  })
}

/** From the two files' text (the sheet's is optional); null without the stats file. */
export function projectionsFromCsv(statsCsv: string | null, playtimeCsv: string | null, values: readonly PlayerValue[]): ProjectionSource | null {
  if (statsCsv === null) return null
  return seasonProjections(parseHashtagStats(statsCsv), playtimeCsv === null ? new Map() : parsePlaytime(playtimeCsv), values)
}
