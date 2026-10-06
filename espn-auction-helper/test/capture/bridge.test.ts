import { describe, expect, it } from 'vitest'
import { NS, startContentSide, startHookSide, type Bus } from '../../src/capture/bridge'
import type { Frame } from '../../src/capture/frames'

/** Like window.postMessage: every listener, including the poster's own, sees every message. */
function memoryBus(): Bus & { sent: unknown[] } {
  const listeners: Array<(m: unknown) => void> = []
  const sent: unknown[] = []
  return {
    sent,
    post: (m) => {
      sent.push(m)
      for (const l of [...listeners]) l(m)
    },
    listen: (cb) => void listeners.push(cb),
  }
}
const frame = (data: string): Frame => ({ dir: 'in', data, t: 1, url: 'wss://fantasydraft.espn.com/x' })

describe('bridge', () => {
  it('replays frames captured before the content script was ready, then streams', () => {
    const bus = memoryBus()
    const hook = startHookSide(bus, () => 'n1')
    hook.emit(frame('CLOCK 0 100'))
    const got: Frame[] = []
    startContentSide(bus, (f) => got.push(f))
    hook.emit(frame('STATE 1'))
    expect(got.map((f) => f.data)).toEqual(['CLOCK 0 100', 'STATE 1'])
  })

  it('trusts only the first hello and only frames carrying its nonce', () => {
    const bus = memoryBus()
    const got: Frame[] = []
    startContentSide(bus, (f) => got.push(f))
    bus.post({ ns: NS, type: 'frame', nonce: 'x', frame: frame('BEFORE_HELLO') })
    bus.post({ ns: NS, type: 'hello', nonce: 'good' })
    bus.post({ ns: NS, type: 'frame', nonce: 'bad', frame: frame('WRONG_NONCE') })
    bus.post({ ns: NS, type: 'frame', nonce: 'good', frame: frame('REAL') })
    bus.post({ ns: NS, type: 'hello', nonce: 'evil' })
    bus.post({ ns: NS, type: 'frame', nonce: 'evil', frame: frame('SECOND_HELLO') })
    expect(got.map((f) => f.data)).toEqual(['REAL'])
  })

  it('the hook answers only the first ready and ignores foreign messages', () => {
    const bus = memoryBus()
    let n = 0
    startHookSide(bus, () => `n${++n}`)
    bus.post('noise')
    bus.post({ ns: 'someone-else', type: 'ready' })
    bus.post({ ns: NS, type: 'ready' })
    bus.post({ ns: NS, type: 'ready' })
    expect(bus.sent.filter((m) => (m as { type?: string }).type === 'hello')).toHaveLength(1)
  })
})
