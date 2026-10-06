import type { Frame } from './frames'

export const NS = 'espn-auction-helper/v1'

export interface Bus {
  post(msg: unknown): void
  listen(cb: (msg: unknown) => void): void
}

type Msg =
  | { ns: typeof NS; type: 'ready' }
  | { ns: typeof NS; type: 'hello'; nonce: string }
  | { ns: typeof NS; type: 'frame'; nonce: string; frame: Frame }

const isMsg = (m: unknown): m is Msg => typeof m === 'object' && m !== null && (m as { ns?: unknown }).ns === NS

export function windowBus(win: Window): Bus {
  return {
    post: (msg) => win.postMessage(msg, win.location.origin),
    listen: (cb) =>
      win.addEventListener('message', (ev) => {
        if (ev.source === win) cb(ev.data)
      }),
  }
}

/** Page world: buffers every frame until the content script says ready, then replays and streams. */
export function startHookSide(bus: Bus, makeNonce: () => string = () => crypto.randomUUID()): { emit(frame: Frame): void } {
  const log: Frame[] = []
  let nonce: string | null = null
  bus.listen((m) => {
    if (!isMsg(m) || m.type !== 'ready' || nonce) return
    nonce = makeNonce()
    bus.post({ ns: NS, type: 'hello', nonce })
    for (const frame of log) bus.post({ ns: NS, type: 'frame', nonce, frame })
  })
  return {
    emit(frame) {
      log.push(frame)
      if (nonce) bus.post({ ns: NS, type: 'frame', nonce, frame })
    },
  }
}

/** Content script: trusts the first hello after its ready, then only frames with that nonce. */
export function startContentSide(bus: Bus, onFrame: (frame: Frame) => void): void {
  let nonce: string | null = null
  bus.listen((m) => {
    if (!isMsg(m)) return
    if (m.type === 'hello' && !nonce) nonce = m.nonce
    else if (m.type === 'frame' && nonce !== null && m.nonce === nonce) onFrame(m.frame)
  })
  bus.post({ ns: NS, type: 'ready' })
}
