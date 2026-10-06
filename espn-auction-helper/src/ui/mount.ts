import { PANEL_CSS } from './styles'

/** Shadow DOM keeps ESPN's styles out of the panel and ours out of ESPN. */
export function mountPanel(doc: Document): HTMLElement {
  const host = doc.createElement('div')
  host.id = 'eah-host'
  host.style.cssText = 'position:fixed;top:72px;right:12px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent = PANEL_CSS
  const container = doc.createElement('div')
  root.append(style, container)
  doc.body.appendChild(host)
  enableDrag(host, root)
  return container
}

function enableDrag(host: HTMLElement, root: ShadowRoot): void {
  let start: { x: number; y: number; left: number; top: number } | null = null
  root.addEventListener('mousedown', (e) => {
    const ev = e as MouseEvent
    if (!(ev.target as HTMLElement).closest('[data-drag]')) return
    const r = host.getBoundingClientRect()
    start = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top }
    ev.preventDefault()
  })
  host.ownerDocument.addEventListener('mousemove', (e) => {
    if (!start) return
    host.style.left = `${start.left + e.clientX - start.x}px`
    host.style.top = `${start.top + e.clientY - start.y}px`
    host.style.right = 'auto'
  })
  host.ownerDocument.addEventListener('mouseup', () => {
    start = null
  })
}
