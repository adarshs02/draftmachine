import { describe, expect, it } from 'vitest'
import { resolvePlayer } from '../../src/ui/resolve'
import { build, pv, settings, sold } from '../helpers'

const V = [
  pv('LeBron James', 40),
  pv('Jaren Jackson Jr.', 35),
  pv('James Harden', 30),
  pv('James Wiseman', 2),
  pv('Josh Giddey', 15),
  pv('Josh Hart', 12),
  pv('Josh Green', 3),
  pv('Josh Okogie', 1),
]
const S = build(settings(), V, [sold('Josh Hart', 2, 10)])

describe('resolvePlayer', () => {
  it('matches the exact name, however it is typed', () => {
    expect(resolvePlayer(S, '  josh HART ')).toEqual({ key: 'josh hart' })
  })

  it('matches a unique prefix', () => {
    expect(resolvePlayer(S, 'jaren')).toEqual({ key: 'jaren jackson' })
    expect(resolvePlayer(S, 'LeBr')).toEqual({ key: 'lebron james' })
  })

  it('matches a unique last name', () => {
    expect(resolvePlayer(S, 'Harden')).toEqual({ key: 'james harden' })
    expect(resolvePlayer(S, 'jackson')).toEqual({ key: 'jaren jackson' })
  })

  it('checks a unique last name after an ambiguous prefix', () => {
    expect(resolvePlayer(S, 'james')).toEqual({ key: 'lebron james' })
  })

  it('reports an ambiguous name with the top 3 matches by value', () => {
    expect(resolvePlayer(S, 'josh')).toEqual({ error: '"josh" matches 4 players: Josh Giddey, Josh Hart, Josh Green…', matches: 4 })
    expect(resolvePlayer(S, 'jam')).toEqual({ error: '"jam" matches 2 players: James Harden, James Wiseman', matches: 2 })
  })

  it('reports a name that matches no one', () => {
    expect(resolvePlayer(S, 'zzz')).toEqual({ error: 'No player matches "zzz"', matches: 0 })
  })
})
