import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Recording } from '../../src/capture/recording'
import { espnRecordingReplay, joshReplay, PLACEHOLDER_ID_BASE, type JoshFixture } from '../../src/sim/replay'
import { SIM_SWID } from '../../src/sim/setup'
import { normalizeName } from '../../src/values/names'
import type { PlayerValue } from '../../src/values/types'

const VALUES = JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[]
const JOSH = JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as JoshFixture
const REC = JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording

describe('joshReplay', () => {
  it('one BID then one SOLD per sale, in time order, with Josh as my team', () => {
    const r = joshReplay(JOSH, VALUES)
    expect(r.lines).toHaveLength(JOSH.sales.length * 2 + 2)
    expect(r.lines[0].line).toBe('STATE 1')
    expect(r.lines.at(-1)!.line).toBe('STATE 2')
    const first = JOSH.sales[0]
    const team = JOSH.teams.indexOf(first.team) + 1
    expect(r.lines[1].line).toMatch(new RegExp(`^BID ${team} \\d+ ${first.price} 25000 10000$`))
    expect(r.lines[2].line).toMatch(new RegExp(`^SOLD ${team} \\d+ 0 ${first.price} 0$`))
    expect(r.lines.map((l) => l.t)).toEqual(r.lines.map((l) => l.t).sort((a, b) => a - b))
    expect(r.league.teams).toHaveLength(12)
    expect(r.league.pickOrder).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(r.league.teams.find((t) => t.name === 'Josh')!.owners).toEqual([SIM_SWID])
  })

  it('every sold id maps to its player in the replay values; unmatched names get placeholder ids', () => {
    const before = JSON.stringify(VALUES)
    const r = joshReplay(JOSH, VALUES)
    expect(JSON.stringify(VALUES)).toBe(before)
    const byId = new Map(r.values!.flatMap((v) => (v.espnId === null ? [] : [[v.espnId, v] as const])))
    const soldKeys = r.lines.filter((l) => l.line.startsWith('SOLD ')).map((l) => byId.get(Number(l.line.split(' ')[2]))?.key)
    expect(soldKeys).toEqual(JOSH.sales.map((s) => normalizeName(s.player)))
    expect(r.values!.some((v) => v.espnId !== null && v.espnId >= PLACEHOLDER_ID_BASE)).toBe(true)
  })
})

describe('espnRecordingReplay', () => {
  it('replays the recording from t = 0 in the user league shape', () => {
    const r = espnRecordingReplay(REC)
    expect(r.lines[0].t).toBe(0)
    expect(r.lines.filter((l) => l.line.startsWith('SOLD '))).toHaveLength(11)
    expect(r.values).toBeNull()
    expect(r.league.pickOrder).toEqual([7, 10, 5, 9, 1, 4, 8, 3, 6, 2])
    expect(r.league.teams.find((t) => t.id === 1)!.owners).toEqual([SIM_SWID])
  })
})
