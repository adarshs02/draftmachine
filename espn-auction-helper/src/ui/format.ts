import type { Verdict } from '../engine/verdict'

export const money = (n: number) => `$${Math.round(n)}`

export function verdictText(v: Verdict): string {
  switch (v.kind) {
    case 'BID':
      return `BID up to ${money(v.ceiling)}`
    case 'BID_UP':
      return `BID UP to ${money(v.pushTo ?? v.ceiling)}`
    case 'LET_THEM':
      return `LET THEM (${money(v.price)} > value ${money(v.adjusted)})`
    case 'PASS':
      return 'PASS'
    case 'LEADING':
      return `You lead at ${money(v.price)} (ceiling ${money(v.ceiling)})`
  }
}
