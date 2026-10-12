import { render } from 'preact'
import playtimeCsv from '../../data/auction-values.csv'
import statsCsv from '../../data/hashtag-projections.csv'
import valuesJson from '../../data/values.json'
import recordingJson from '../../test/fixtures/espn-auction-recording.json'
import joshJson from '../../test/fixtures/josh-mock-sales.json'
import { downloadText, type Recording } from '../capture/recording'
import type { View } from '../controller'
import type { DraftEvent } from '../engine/types'
import { html } from '../ui/html'
import { mountPanel } from '../ui/mount'
import { Panel } from '../ui/Panel'
import type { PlayerValue } from '../values/types'
import type { JoshFixture } from './replay'
import type { ProjectionSource } from './score'
import { projectionsFromCsv } from './seasonStats'
import { createSession, defaultConfig, type Session, type SessionConfig, type SessionData } from './session'
import { App } from './ui/App'
import { SIM_CSS } from './ui/styles'

/** A background tab or a breakpoint must not fast-forward the draft. */
const MAX_FRAME_MS = 250

/** The projection CSVs are bundled as text, so editing them (or syncing the sheet) rebuilds and reloads the page. */
function loadProjections(values: PlayerValue[]): ProjectionSource | null {
  try {
    return projectionsFromCsv(statsCsv, playtimeCsv, values)
  } catch (e) {
    console.warn('Projections unavailable:', e)
    return null
  }
}

async function main(): Promise<void> {
  const style = document.createElement('style')
  style.textContent = SIM_CSS
  document.head.append(style)
  const app = document.getElementById('app')!
  const panel = mountPanel(document)
  const values = valuesJson as unknown as PlayerValue[]
  const data: SessionData = {
    values,
    projections: loadProjections(values),
    recording: recordingJson as unknown as Recording,
    josh: joshJson as unknown as JoshFixture,
  }
  let session!: Session
  let generation = 0
  let unsubscribe = () => {}
  let shown: View | null = null

  const draw = () => {
    render(html`<${App} key=${generation} session=${session} onRestart=${restart} />`, app)
    // The panel only re-renders when the controller published a new view.
    if (session.view === shown) return
    shown = session.view
    render(
      html`<${Panel}
        ...${session.view}
        onEvent=${(ev: DraftEvent) => session.dispatch(ev)}
        onDownloadRecording=${() => downloadText(document, `sim-draft-${Date.now()}.json`, session.recordingJson())}
        onReset=${() => void restart({ ...session.config, speed: session.speed, autopilot: session.autopilot })}
        onDismissAlert=${() => session.dismissAlert()}
      />`,
      panel,
    )
  }

  async function restart(config: SessionConfig): Promise<void> {
    const next = await createSession(config, data)
    unsubscribe()
    session = next
    generation++
    shown = null
    unsubscribe = session.subscribe(draw)
    draw()
  }

  await restart(defaultConfig())
  let last = performance.now()
  const frame = (now: number) => {
    const dt = Math.min(MAX_FRAME_MS, now - last)
    last = now
    session.tick(dt)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e: unknown) => {
  document.body.textContent = `Draft simulator failed to start: ${e instanceof Error ? e.message : String(e)}`
})
