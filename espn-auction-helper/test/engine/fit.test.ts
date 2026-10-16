import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { resetTunables, setTunables } from '../../src/engine/constants'
import { fitFor, myValue } from '../../src/engine/fit'
import { adjustedValue } from '../../src/engine/metrics'
import { reduce } from '../../src/engine/reducer'
import type { DraftEvent } from '../../src/engine/types'
import { verdict } from '../../src/engine/verdict'
import type { PlayerValue } from '../../src/values/types'
import { build, nominated, settings, sold } from '../helpers'
import { FIT_S, FIT_V } from './fitFixture'

const at = (events: DraftEvent[], me: number | null = 1) => build(FIT_S, FIT_V, events, me)
const walls = [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20)]
const bricks = [sold('Brick1', 1, 20), sold('Brick2', 1, 20), sold('Brick3', 1, 20)]

afterEach(() => resetTunables())

describe('fitFor', () => {
  it('is x1 before my roster has a shape', () => {
    expect(fitFor(at([]), 'blocker')!.mult).toBeCloseTo(1, 6)
    expect(fitFor(at([sold('P1', 2, 30)]), 'passer')!.mult).toBeCloseTo(1, 6)
  })

  it('a roster already strong in blocks rates a blocker under x1 and a passer over x1', () => {
    const s = at(walls)
    const blocker = fitFor(s, 'blocker')!
    const passer = fitFor(s, 'passer')!
    expect(blocker.mult).toBeLessThan(0.98)
    expect(passer.mult).toBeGreaterThan(1)
    expect(blocker.cats[0]).toBe('blk')
  })

  it('a roster far behind in FT% rates a good FT shooter under x1: punting emerges', () => {
    const f = fitFor(at(bricks), 'shooter')!
    expect(f.mult).toBeLessThan(0.98)
    expect(f.cats).toContain('ftPct')
  })

  it('is null without a line, under $5, without my team, with my roster full, or with FIT_WEIGHT 0', () => {
    expect(fitFor(at(walls), 'nostats')).toBeNull()
    expect(fitFor(at(walls), 'cheapo')).toBeNull()
    expect(fitFor(at(walls, null), 'blocker')).toBeNull()
    const full = Array.from({ length: 13 }, (_, i) => sold(`P${i + 1}`, 1, 1))
    expect(fitFor(at(full), 'blocker')).toBeNull()
    setTunables({ FIT_WEIGHT: 0 })
    expect(fitFor(at(walls), 'blocker')).toBeNull()
  })

  it('stays inside FIT_MIN..FIT_MAX', () => {
    setTunables({ FIT_MIN: 0.99, FIT_MAX: 1.01 })
    const s = at(walls)
    for (const key of ['blocker', 'passer', 'p30']) {
      const m = fitFor(s, key)!.mult
      expect(m).toBeGreaterThanOrEqual(0.99)
      expect(m).toBeLessThanOrEqual(1.01)
    }
  })

  it('counts a rostered player without a line as an average player, not an empty slot', () => {
    expect(fitFor(at([sold('NoStats', 1, 20)]), 'blocker')!.mult).toBeCloseTo(1, 2)
  })

  it('rates a player outside the filler pool from his own line', () => {
    // P1-P48 dealt round the table so no team is hopeless: rivals full, mine with 1 open. The pool is
    // the single best player left (Brick1); the passer is outside it.
    const left = new Map([[1, 9], [2, 13], [3, 13], [4, 13]])
    const order = [2, 3, 4, 1]
    let turn = 0
    const deal = Array.from({ length: 48 }, (_, i) => {
      while (left.get(order[turn % 4]) === 0) turn++
      const team = order[turn++ % 4]
      left.set(team, left.get(team)! - 1)
      return sold(`P${i + 1}`, team, 1)
    })
    expect(fitFor(at([...walls, ...deal]), 'passer')).not.toBeNull()
  })

  it('a cached state never leaks into the next one: undo, a fixed sale, a new value or my team', () => {
    const s = at(walls)
    fitFor(s, 'passer')
    const events: DraftEvent[] = [
      { type: 'undo' },
      { type: 'editSale', seq: 1, teamId: 2, price: 20 },
      { type: 'setValue', playerKey: 'passer', b: 25 },
      { type: 'setMyTeam', teamId: 2 },
    ]
    for (const ev of events) expect(fitFor(reduce(s, ev), 'passer')).toEqual(fitFor(at([...walls, ev]), 'passer'))
  })

  it('follows undo: the fit after undoing a sale equals the fit before it', () => {
    const before = fitFor(at(walls.slice(0, 2)), 'blocker')!.mult
    expect(fitFor(at([...walls, { type: 'undo' }]), 'blocker')!.mult).toBeCloseTo(before, 9)
  })
})

describe('myValue', () => {
  it('is the adjusted value times the fit, and exactly the adjusted value with FIT_WEIGHT 0', () => {
    const s = at(walls)
    expect(myValue(s, 'blocker')).toBeCloseTo(adjustedValue(s, 'blocker') * fitFor(s, 'blocker')!.mult, 9)
    setTunables({ FIT_WEIGHT: 0 })
    expect(myValue(s, 'blocker')).toBe(adjustedValue(s, 'blocker'))
  })
})

describe('speed on real data', () => {
  it('a full 10-team state: first verdict after a sale under 50 ms, each bid after it under 5 ms', () => {
    const values = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
    const top = [...values].sort((a, b) => b.b - a.b)
    const sales = top.slice(0, 40).map((v, i) => sold(v.name, (i % 10) + 1, Math.round(v.b)))
    const s = build(settings(10), values, [...sales, nominated(top[40].name, 2, 1)])
    let t = performance.now()
    expect(verdict(s)!.fit).not.toBeNull()
    expect(performance.now() - t).toBeLessThan(50)
    t = performance.now()
    for (let price = 2; price < 22; price++) verdict({ ...s, live: { ...s.live!, price } })
    expect((performance.now() - t) / 20).toBeLessThan(5)
  })
})
