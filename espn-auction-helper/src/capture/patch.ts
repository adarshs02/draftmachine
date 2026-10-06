import { DRAFT_SOCKET_HOST, type Frame } from './frames'

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
    ws.addEventListener('message', (ev: MessageEvent) => {
      if (typeof ev.data === 'string') emit({ dir: 'in', data: ev.data, t: now(), url: ws.url })
    })
  }

  function Patched(url: string | URL, protocols?: string | string[]): WebSocket {
    const ws = protocols === undefined ? new Native(url) : new Native(url, protocols)
    watch(ws)
    return ws
  }
  Patched.prototype = Native.prototype
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const) Object.defineProperty(Patched, k, { value: Native[k] })

  const nativeSend = Native.prototype.send
  Native.prototype.send = function (this: WebSocket, data: Parameters<WebSocket['send']>[0]) {
    watch(this)
    if (typeof data === 'string' && isDraft(this.url)) emit({ dir: 'out', data, t: now(), url: this.url })
    return nativeSend.call(this, data)
  }
  win.WebSocket = Patched as unknown as typeof WebSocket
}
