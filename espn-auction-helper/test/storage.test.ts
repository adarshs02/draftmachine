import { describe, expect, it } from 'vitest'
import { loadEvents, saveEvents } from '../src/storage'
import { memoryStore, sold } from './helpers'

describe('event log storage', () => {
  it('round-trips events per league', () => {
    const store = memoryStore()
    saveEvents(store, 7, [sold('Alpha', 2, 12)])
    expect(loadEvents(store, 7)).toEqual([sold('Alpha', 2, 12)])
    expect(loadEvents(store, 8)).toEqual([])
  })

  it('treats corrupt or non-array data as empty', () => {
    expect(loadEvents(memoryStore({ 'eah:7:events': '{oops' }), 7)).toEqual([])
    expect(loadEvents(memoryStore({ 'eah:7:events': '{"a":1}' }), 7)).toEqual([])
  })

  it('keeps going when storage refuses writes', () => {
    const store = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => {} }
    expect(() => saveEvents(store, 7, [])).not.toThrow()
  })
})
