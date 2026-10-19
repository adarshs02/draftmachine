import { useReducer, useState } from 'preact/hooks'
import { DEFAULT_TUNABLES, resetTunables, setTunables, TUNABLES, type TunableName, type Tunables } from '../../engine/constants'
import { html } from '../../ui/html'

const NAMES = Object.keys(DEFAULT_TUNABLES) as TunableName[]

/** The batch flags that reproduce these tunables (only the ones that differ from the defaults). */
export function flagsFor(t: Readonly<Tunables>): string {
  return NAMES.filter((k) => t[k] !== DEFAULT_TUNABLES[k])
    .map((k) => `--set ${k}=${t[k]}`)
    .join(' ')
}

/** Edits the engine's tunables in place; onChange re-renders the panel's advice. */
export function TunablesDrawer({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [flags, setFlags] = useState<string | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const changed = NAMES.filter((k) => TUNABLES[k] !== DEFAULT_TUNABLES[k]).length
  const edit = (name: TunableName, text: string) => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) return redraw(0)
    setTunables({ [name]: n })
    redraw(0)
    onChange()
  }
  const reset = () => {
    resetTunables()
    setFlags(null)
    redraw(0)
    onChange()
  }
  const copy = () => {
    const text = flagsFor(TUNABLES)
    setFlags(text || '(all defaults)')
    navigator.clipboard?.writeText(text).catch(() => {})
  }
  return html`<div class="drawer">
    <button class="toggle" onClick=${() => setOpen(!open)}>${open ? 'Hide tunables' : 'Tunables'}${changed ? ` (${changed} changed)` : ''}</button>
    ${open
      ? html`<div>
          <div class="tunables">
            ${NAMES.map(
              (k) => html`<label class=${TUNABLES[k] !== DEFAULT_TUNABLES[k] ? 'changed' : ''}>
                ${k}
                <input type="number" step="any" name=${k} value=${TUNABLES[k]} onChange=${(e: Event) => edit(k, (e.currentTarget as HTMLInputElement).value)} />
              </label>`,
            )}
          </div>
          <div class="row">
            <button class="reset" onClick=${reset}>Reset</button>
            <button onClick=${copy}>Copy as flags</button>
          </div>
          ${flags ? html`<code>${flags}</code>` : null}
        </div>`
      : null}
  </div>`
}
