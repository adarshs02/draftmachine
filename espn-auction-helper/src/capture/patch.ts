import { DRAFT_SOCKET_HOST, isTokenLine, splitLines, type Frame } from './frames'

/** Incoming frame minus its TOKEN lines (null if nothing is left); frames without one pass through untouched. */
function withoutToken(data: string): string | null {
  const lines = splitLines(data)
  if (!lines.some(isTokenLine)) return data
  const kept = lines.filter((l) => !isTokenLine(l))
  return kept.length ? kept.join('\n') : null
}

/** Observing must never throw into ESPN's page (spec §6.2): a failed observation just loses the frame. */
function observe(fn: () => void): void {
  try {
    fn()
  } catch {
    // ignored on purpose
  }
}

/**
 * Observes ESPN's draft socket without touching it: wraps the constructor for
 * sockets opened later, and send() for one already open (ESPN pings every 15s).
 */
export function patchWebSocket(win: { WebSocket: typeof WebSocket }, emit: (frame: Frame) => void, now: () => number = Date.now): void {
  const Native = win.WebSocket
  const watched = new WeakSet<WebSocket>()
  const isDraft = (url: string) => url.includes(DRAFT_SOCKET_HOST)
  const watch = (ws: WebSocket) => {
    if (watched.has(ws) || !isDraft(ws.url)) return
    watched.add(ws)
    ws.addEventListener('message', (ev: MessageEvent) =>
      observe(() => {
        const data = typeof ev.data === 'string' ? withoutToken(ev.data) : null
        if (data !== null) emit({ dir: 'in', data, t: now(), url: ws.url })
      }),
    )
  }

  function Patched(url: string | URL, protocols?: string | string[]): WebSocket {
    const ws = protocols === undefined ? new Native(url) : new Native(url, protocols)
    observe(() => watch(ws))
    return ws
  }
  Patched.prototype = Native.prototype
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const) Object.defineProperty(Patched, k, { value: Native[k] })

  const nativeSend = Native.prototype.send
  Native.prototype.send = function (this: WebSocket, data: Parameters<WebSocket['send']>[0]) {
    observe(() => {
      watch(this)
      if (typeof data === 'string' && isDraft(this.url)) emit({ dir: 'out', data, t: now(), url: this.url })
    })
    return nativeSend.call(this, data)
  }
  win.WebSocket = Patched as unknown as typeof WebSocket
}
