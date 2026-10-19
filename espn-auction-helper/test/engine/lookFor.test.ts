import { describe, expect, it } from 'vitest'
import { lookFor } from '../../src/engine/lookFor'
import type { DraftEvent } from '../../src/engine/types'
import { build, nominated, pv, sold } from '../helpers'
import { FIT_S, FIT_V } from './fitFixture'

// Passer usually goes for $10 (a value play), Shooter for $30 (the room overpays), Whale for $300 (unaffordable).
const V = [...FIT_V.map((v) => (v.key === 'passer' ? { ...v, market: 10 } : v.key === 'shooter' ? { ...v, market: 30 } : v)), pv('Whale', 25, { market: 300 })]
const at = (events: DraftEvent[], me: number | null = 1) => build(FIT_S, V, events, me)
const walls = [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20)]

describe('lookFor', () => {
  it('lists the best 6 for my roster by value over what the room usually pays, value plays flagged', () => {
    const l = lookFor(at([]))!
    expect(l.rows).toHaveLength(6)
    expect(l.rows[0]).toMatchObject({ key: 'passer', market: 10, flag: 'value' })
    const gaps = l.rows.map((r) => r.value - r.market)
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a))
    expect(l.rows.map((r) => r.key)).not.toContain('shooter')
  })

  it('tags each player with where he would help me', () => {
    const passer = lookFor(at([]))!.rows[0]
    expect(passer.cats).toContain('ast')
    expect(passer.cats.length).toBeLessThanOrEqual(2)
  })

  it('leaves out the player on the block, sold players, anyone I cannot afford and players under $5', () => {
    const keys = lookFor(at([sold('P1', 2, 30), nominated('Passer', 2, 1)]))!.rows.map((r) => r.key)
    expect(keys).not.toContain('passer')
    expect(keys).not.toContain('p1')
    const all = lookFor(at([]), 100)!.rows.map((r) => r.key)
    expect(all).not.toContain('whale')
    expect(all).not.toContain('cheapo')
  })

  it("says where my team stands once I have players: strong where I'd usually win the week", () => {
    expect(lookFor(at([]))!).toMatchObject({ strong: [], weak: [] })
    expect(lookFor(at(walls))!.strong).toContain('blk')
  })

  it('is null without my team, or with my roster full', () => {
    expect(lookFor(at([], null))).toBeNull()
    expect(lookFor(at(Array.from({ length: 13 }, (_, i) => sold(`P${i + 1}`, 1, 1))))).toBeNull()
  })

  it('follows the draft: a sale changes the list', () => {
    const before = lookFor(at([]))!.rows[0].key
    expect(lookFor(at([sold('Passer', 2, 10)]))!.rows[0].key).not.toBe(before)
  })
})
