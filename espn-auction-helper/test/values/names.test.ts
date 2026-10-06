import { describe, expect, it } from 'vitest'
import { normalizeName } from '../../src/values/names'

describe('normalizeName', () => {
  it.each([
    ['Nikola Jokić', 'nikola jokic'],
    ["De'Aaron Fox", 'deaaron fox'],
    ['Shai Gilgeous-Alexander', 'shai gilgeous alexander'],
    ['Jaren Jackson Jr.', 'jaren jackson'],
    ['Trey Murphy III', 'trey murphy'],
    ["Day'Ron Sharpe", 'dayron sharpe'],
    ['  Kevin   Porter Jr. ', 'kevin porter'],
    ['F12', 'f12'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected)
  })

  it('treats P.J. and PJ the same', () => {
    expect(normalizeName('P.J. Washington')).toBe(normalizeName('PJ Washington'))
  })
})
