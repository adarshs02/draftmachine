import type { SeasonLine } from '../../src/engine/h2h'
import type { PlayerValue } from '../../src/values/types'
import { pv, settings } from '../helpers'

export const statLine = (pts: number, reb: number, ast: number, stl: number, blk: number, tpm: number, to: number, fgm: number, fga: number, ftm: number, fta: number): SeasonLine => ({
  pts, reb, ast, stl, blk, tpm, to, fgm, fga, ftm, fta,
})
/** A typical rotation player's season. */
export const BASE_LINE = statLine(1300, 520, 300, 80, 50, 130, 150, 480, 1000, 210, 270)

/** 4 teams, all-bench lineup (no positional need). */
export const FIT_S = settings(4, { lineupSlotCounts: { 12: 13 } })
const withLine = (name: string, b: number, line: SeasonLine | null): PlayerValue => pv(name, b, { line })
/** A line for a player worth $b: better players project proportionally more (a $20 player is BASE_LINE). */
const scaled = (b: number): SeasonLine => Object.fromEntries(Object.entries(BASE_LINE).map(([f, x]) => [f, x * (0.5 + b / 40)])) as unknown as SeasonLine
export const FIT_V: PlayerValue[] = [
  ...Array.from({ length: 60 }, (_, i) => withLine(`P${i + 1}`, 30 - i * 0.4, scaled(30 - i * 0.4))),
  ...[1, 2, 3].map((i) => withLine(`Wall${i}`, 20, { ...BASE_LINE, blk: 250 })),
  ...[1, 2, 3].map((i) => withLine(`Brick${i}`, 20, { ...BASE_LINE, ftm: 100, fta: 400 })),
  withLine('Blocker', 20, { ...BASE_LINE, blk: 160 }),
  withLine('Passer', 20, { ...BASE_LINE, ast: 650 }),
  withLine('Shooter', 20, { ...BASE_LINE, ftm: 380, fta: 420 }),
  withLine('NoStats', 20, null),
  withLine('Cheapo', 3, BASE_LINE),
]
