import { describe, expect, it } from 'vitest'
import type { Frame } from '../../src/capture/frames'
import { patchWebSocket } from '../../src/capture/patch'

const DRAFT_URL = 'wss://fantasydraft.espn.com/game-1/league-1/JOIN?1=1'

function makeFakeWs() {
  return class FakeWS {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    sent: unknown[] = []
    listeners: Array<(ev: { data: unknown }) => void> = []
    constructor(public url: string, public protocols?: string | string[]) {}
    addEventListener(_type: string, cb: (ev: { data: unknown }) => void) {
      this.listeners.push(cb)
    }
    send(data: unknown) {
      this.sent.push(data)
    }
    receive(data: unknown) {
      for (const l of this.listeners) l({ data })
    }
  }
}

function setup() {
  const FakeWS = makeFakeWs()
  const win = { WebSocket: FakeWS as unknown as typeof WebSocket }
  const frames: Frame[] = []
  const early = new FakeWS(DRAFT_URL)
  patchWebSocket(win, (f) => frames.push(f), () => 42)
  const open = (url: string) => new win.WebSocket(url) as unknown as InstanceType<typeof FakeWS>
  return { win, frames, early, open, FakeWS }
}

describe('patchWebSocket', () => {
  it('captures incoming text frames on the ESPN draft socket', () => {
    const { frames, open } = setup()
    open(DRAFT_URL).receive('CLOCK 6 85495 1\n')
    expect(frames).toEqual([{ dir: 'in', data: 'CLOCK 6 85495 1\n', t: 42, url: DRAFT_URL }])
  })

  it('captures outgoing frames and still sends them', () => {
    const { frames, open } = setup()
    const ws = open(DRAFT_URL)
    ws.send('PING PING%2042\n')
    expect(ws.sent).toEqual(['PING PING%2042\n'])
    expect(frames).toEqual([{ dir: 'out', data: 'PING PING%2042\n', t: 42, url: DRAFT_URL }])
  })

  it('ignores other sockets and binary frames', () => {
    const { frames, open } = setup()
    open('wss://example.com/chat').receive('hello')
    open(DRAFT_URL).receive(new ArrayBuffer(4))
    expect(frames).toEqual([])
  })

  it('keeps instanceof and the readyState constants', () => {
    const { win, open } = setup()
    expect(open(DRAFT_URL) instanceof win.WebSocket).toBe(true)
    expect(win.WebSocket.OPEN).toBe(1)
  })

  it('never throws into the page when passing a frame on fails', () => {
    const FakeWS = makeFakeWs()
    const win = { WebSocket: FakeWS as unknown as typeof WebSocket }
    patchWebSocket(win, () => { throw new Error('bridge down') }, () => 42)
    const ws = new win.WebSocket(DRAFT_URL) as unknown as InstanceType<typeof FakeWS>
    expect(() => ws.send('PING PING%201\n')).not.toThrow()
    expect(ws.sent).toEqual(['PING PING%201\n'])
    expect(() => ws.receive('CLOCK 6 1 2')).not.toThrow()
  })

  it('drops TOKEN lines from incoming frames, and frames left empty', () => {
    const { frames, open } = setup()
    const ws = open(DRAFT_URL)
    ws.receive('TOKEN 1:1:2:{8398089B-19B2-4A9B-AD56-C97626BAD9B5}:123\nJOINED 2 x\n')
    ws.receive('TOKEN 1:1:2:{8398089B-19B2-4A9B-AD56-C97626BAD9B5}:123\n')
    expect(frames.map((f) => f.data)).toEqual(['JOINED 2 x'])
  })

  it('catches a socket opened before the patch on its next send', () => {
    const { frames, early } = setup()
    early.send('PING PING%201\n')
    early.receive('PONG PING%201')
    expect(frames.map((f) => [f.dir, f.data])).toEqual([['out', 'PING PING%201\n'], ['in', 'PONG PING%201']])
  })
})
