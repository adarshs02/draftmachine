export interface SimPlayer {
  espnId: number
  key: string
  name: string
  /** ESPN average price paid */
  market: number
  /** projected auction value (PlayerValue.consensus) */
  consensus: number
}

export type BotKind = 'stars' | 'balanced' | 'value'

export interface SimTeam {
  id: number
  name: string
  /** null = my team */
  bot: BotKind | null
  budget: number
  /** espnIds won, in order */
  roster: number[]
}

export interface SimSale {
  espnId: number
  teamId: number
  price: number
}
