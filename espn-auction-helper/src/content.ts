import { render } from 'preact'
import valuesJson from '../data/values.json'
import { startContentSide, windowBus } from './capture/bridge'
import type { Frame } from './capture/frames'
import { downloadText } from './capture/recording'
import { createController, type Controller } from './controller'
import type { DraftEvent } from './engine/types'
import { fetchLeague } from './espn/league'
import { html } from './ui/html'
import { mountPanel } from './ui/mount'
import { Panel } from './ui/Panel'
import type { PlayerValue } from './values/types'

const leagueId = Number(new URLSearchParams(location.search).get('leagueId'))
/** Health goes stale with no frame arriving to re-render it: re-check it on a timer. */
const HEALTH_TICK_MS = 5000

// Listen from document_start so no socket frame is lost while the league loads.
const pending: Frame[] = []
let controller: Controller | null = null
startContentSide(windowBus(window), (frame) => {
  if (controller) controller.onFrame(frame)
  else pending.push(frame)
})

function whenReady(fn: () => void): void {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true })
  else fn()
}

const download = () => {
  if (controller) downloadText(document, `espn-draft-${leagueId}-${Date.now()}.json`, controller.recordingJson())
}

async function start(container: HTMLElement): Promise<void> {
  const ready = await createController({
    leagueId,
    storage: sessionStorage,
    backup: localStorage,
    values: valuesJson as unknown as PlayerValue[],
    cookie: document.cookie,
    loadLeague: () => fetchLeague(leagueId),
    render: (view) =>
      render(
        html`<${Panel}
          ...${view}
          onEvent=${(ev: DraftEvent) => controller?.dispatch(ev)}
          onDownloadRecording=${download}
          onReset=${() => controller?.reset()}
          onDismissAlert=${() => controller?.dismissAlert()}
        />`,
        container,
      ),
  })
  controller = ready
  for (const frame of pending.splice(0)) ready.onFrame(frame)
  setInterval(() => ready.tick(), HEALTH_TICK_MS)
}

whenReady(() => {
  const container = mountPanel(document)
  // Never leave an empty host: say why the panel didn't start.
  start(container).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    render(html`<div class="panel"><div class="banner">Josh Mode failed to start: ${message}</div></div>`, container)
  })
})
