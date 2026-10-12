import { allTeams, inflation, myBudget, saleFlags, teamSummary, temperature, valueOf, type MyBudget, type TeamSummary, type Temperature } from './metrics'
import { suggestNomination, type Nomination } from './nominate'
import { nominationTurn, type NominationTurn } from './turn'
import type { DraftState } from './types'
import { verdict, type Verdict } from './verdict'

export const FEED_LIMIT = 15

export interface FeedRow {
  seq: number
  name: string
  teamId: number
  teamName: string
  price: number
  bargain: boolean
}

export interface Advice {
  budget: MyBudget | null
  temperature: Temperature
  inflation: number
  verdict: Verdict | null
  turn: NominationTurn
  nomination: Nomination | null
  teams: TeamSummary[]
  feed: FeedRow[]
}

export function advise(s: DraftState): Advice {
  const flags = saleFlags(s)
  return {
    budget: myBudget(s),
    temperature: temperature(s),
    inflation: inflation(s),
    verdict: verdict(s),
    turn: nominationTurn(s),
    nomination: suggestNomination(s),
    teams: allTeams(s),
    feed: s.sales
      .slice(-FEED_LIMIT)
      .reverse()
      .map((x) => ({
        seq: x.seq,
        name: valueOf(s, x.playerKey).name,
        teamId: x.teamId,
        teamName: teamSummary(s, x.teamId).name,
        price: x.price,
        bargain: flags.get(x.seq)?.bargain ?? false,
      })),
  }
}
