import { render } from 'preact'
import valuesJson from '../data/values.json'
import { createController, type Controller } from './controller'
import type { DraftEvent } from './engine/types'
import { fetchLeague } from './espn/league'
import { html } from './ui/html'
import { mountPanel } from './ui/mount'
import { Panel } from './ui/Panel'
import type { PlayerValue } from './values/types'

const leagueId = Number(new URLSearchParams(location.search).get('leagueId'))

function whenReady(fn: () => void): void {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true })
  else fn()
}

whenReady(async () => {
  const container = mountPanel(document)
  let controller: Controller | null = null
  controller = await createController({
    leagueId,
    storage: sessionStorage,
    values: valuesJson as unknown as PlayerValue[],
    cookie: document.cookie,
    loadLeague: () => fetchLeague(leagueId),
    render: (view) =>
      render(html`<${Panel} ...${view} onEvent=${(ev: DraftEvent) => controller?.dispatch(ev)} onDownloadRecording=${() => {}} />`, container),
  })
})
