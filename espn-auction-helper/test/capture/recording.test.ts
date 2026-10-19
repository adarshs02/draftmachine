import { describe, expect, it } from 'vitest'
import { splitLines } from '../../src/capture/frames'

describe('recording', () => {
  it('splitLines trims and drops blank lines', () => {
    expect(splitLines('CLOCK 6 1 2\n\n  STATE 1 \n')).toEqual(['CLOCK 6 1 2', 'STATE 1'])
  })
})
