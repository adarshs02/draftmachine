import type { SeasonLine } from '../engine/h2h'

export interface Injury {
  /** prone: as a regular, missed 25+ games in 2 of the last 3 seasons or 45+ in one before last; recent: returning from major injury (missed 37+ last season only) */
  label: 'prone' | 'recent'
  /** games played in each of the last 3 seasons, oldest first; null when he played none */
  games: (number | null)[]
}

export interface PlayerValue {
  /** normalizeName(name): join key across ESPN, Josh's CSV, live events and manual entry */
  key: string
  espnId: number | null
  name: string
  /** ESPN eligible lineup slots 0-11 */
  slots: number[]
  /** base auction value in league dollars */
  b: number
  /** projected auction value from data/auction-values.csv, 0 when unprojected or below replacement */
  consensus: number
  /** ESPN average price paid, 0 when unknown */
  market: number
  /** Josh Lloyd's midpoint (12-team dollars), null when he gave none */
  josh: number | null
  avoid: boolean
  /** projection rank, null when unprojected; orders players tied on b */
  rank: number | null
  /** 1 = top 12 by b, 2 = 13-36, 3 = 37-72, 4 = 73-120, 5 = rest */
  tier: number
  /** projected season totals (data/hashtag-projections.csv x games), null without a stats row */
  line: SeasonLine | null
  /** injury history from data/espn-games-history.json, null when clean or unknown */
  injury: Injury | null
  /** the user's note from the projections sheet, null without one */
  note: string | null
}
