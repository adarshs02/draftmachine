// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Recording } from '../../src/capture/recording'
import { DEFAULT_TUNABLES, resetTunables, setTunables, TUNABLES } from '../../src/engine/constants'
import type { JoshFixture } from '../../src/sim/replay'
import { createSession, defaultConfig, type SessionData } from '../../src/sim/session'
import { App } from '../../src/sim/ui/App'
import { configFromForm } from '../../src/sim/ui/Controls'
import { flagsFor, TunablesDrawer } from '../../src/sim/ui/TunablesDrawer'
import { html } from '../../src/ui/html'
import { mountPanel } from '../../src/ui/mount'
import { Panel } from '../../src/ui/Panel'
import type { PlayerValue } from '../../src/values/types'

const DATA: SessionData = {
  values: JSON.parse(readFileSync('data/values.json', 'utf8')) as PlayerValue[],
  projections: null,
  recording: JSON.parse(readFileSync('test/fixtures/espn-auction-recording.json', 'utf8')) as Recording,
  josh: JSON.parse(readFileSync('test/fixtures/josh-mock-sales.json', 'utf8')) as JoshFixture,
}

afterEach(() => {
  resetTunables()
  document.body.innerHTML = ''
})

async function mountApp() {
  const session = await createSession(defaultConfig(), DATA)
  const root = document.createElement('div')
  document.body.append(root)
  const draw = () => render(html`<${App} session=${session} onRestart=${() => {}} />`, root)
  session.subscribe(draw)
  draw()
  return { session, root }
}

describe('simulator page', () => {
  it('shows the 10 teams in draft order with mine marked', async () => {
    const { root } = await mountApp()
    const ids = [...root.querySelectorAll('[data-team]')].map((e) => Number(e.getAttribute('data-team')))
    expect(ids).toEqual([7, 10, 5, 9, 1, 4, 8, 3, 6, 2])
    expect(root.querySelector('.team.mine')!.textContent).toContain('You')
  })

  it('a step completes an auction and the feed shows it', async () => {
    const { session, root } = await mountApp()
    session.step()
    expect(session.view.state.sales).toHaveLength(1)
    expect(root.querySelector('.feed')!.textContent).toContain('Sales (1)')
  })

  it('the real Panel shows a call while a player is on the block', async () => {
    const { session } = await mountApp()
    for (let i = 0; i < 100 && !session.view.state.live; i++) session.tick(250)
    expect(session.view.state.live).not.toBeNull()
    const container = mountPanel(document)
    render(
      html`<${Panel} ...${session.view} onEvent=${() => true} onDownloadRecording=${() => {}} onReset=${() => {}} onDismissAlert=${() => {}} />`,
      container,
    )
    expect(container.textContent).toMatch(/BID|PASS|LET THEM|You lead/)
  })

  it('after the draft, shows projected H2H standings: win %, playoff and title odds, weekly category odds', async () => {
    const flat = { pts: 1000, reb: 400, ast: 200, stl: 60, blk: 40, tpm: 100, to: 120, fgm: 400, fga: 850, ftm: 150, fta: 190 }
    const session = await createSession({ ...defaultConfig(), autopilot: true }, { ...DATA, projections: () => flat })
    session.finish()
    const root = document.createElement('div')
    render(html`<${App} session=${session} onRestart=${() => {}} />`, root)
    const heads = [...root.querySelectorAll('.standings th')].map((th) => th.textContent)
    expect(heads).toEqual(['#', 'Team', 'Win %', 'Playoffs', 'Title', 'PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'FG%', 'FT%', 'TO', 'No proj.'])
    const rows = [...root.querySelectorAll('.standings tbody tr')]
    expect(rows).toHaveLength(10)
    // Cells come from the session's standings (identical projections, but seasons carry error).
    const st = session.standings()!
    expect(rows.map((r) => r.children[2].textContent)).toEqual(st.map((t) => `${Math.round(t.winPct * 100)}%`))
    expect(root.textContent).toContain('Seasons use the projections plus random error')
  }, 120_000)

  it('restart form: valid config, or a message', () => {
    const base = defaultConfig()
    const bots = base.options.botKinds.join(',')
    const ok = configFromForm(base, { mode: 'replay-josh', seed: '42', room: 'hot', bots })
    expect(ok).toMatchObject({ mode: 'replay-josh', options: { seed: 42, room: 1.1 } })
    expect(configFromForm(base, { mode: 'simulate', seed: '4.5', room: 'neutral', bots })).toBe('Seed must be a whole number')
    expect(configFromForm(base, { mode: 'simulate', seed: '1', room: 'neutral', bots: bots.replace('value', 'vale') })).toBe('Unknown bot "vale": use stars, balanced, value')
    expect(configFromForm(base, { mode: 'simulate', seed: '1', room: 'neutral', bots: 'stars,value' })).toBe('Bot mix needs 9 bots, got 2')
  })
})

describe('tunables drawer', () => {
  it('Copy as flags lists only changed tunables', () => {
    expect(flagsFor(TUNABLES)).toBe('')
    setTunables({ BID_GAP_FRACTION: 0.1, HOT: 1.1 })
    expect(flagsFor(TUNABLES)).toBe('--set HOT=1.1 --set BID_GAP_FRACTION=0.1')
  })

  it('edits change TUNABLES and refresh; Reset restores defaults', () => {
    const onChange = vi.fn()
    const root = document.createElement('div')
    document.body.append(root)
    act(() => render(html`<${TunablesDrawer} onChange=${onChange} />`, root))
    act(() => root.querySelector<HTMLButtonElement>('button.toggle')!.click())
    const input = root.querySelector<HTMLInputElement>('input[name="BID_GAP_FRACTION"]')!
    act(() => {
      input.value = '0.1'
      input.dispatchEvent(new Event('change'))
    })
    expect(TUNABLES.BID_GAP_FRACTION).toBe(0.1)
    expect(onChange).toHaveBeenCalledTimes(1)
    act(() => {
      input.value = 'abc'
      input.dispatchEvent(new Event('change'))
    })
    expect(TUNABLES.BID_GAP_FRACTION).toBe(0.1)
    act(() => root.querySelector<HTMLButtonElement>('button.reset')!.click())
    expect(TUNABLES).toEqual(DEFAULT_TUNABLES)
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
