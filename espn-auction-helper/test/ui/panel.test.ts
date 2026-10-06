// @vitest-environment jsdom
import { render } from 'preact'
import { describe, expect, it, vi } from 'vitest'
import { advise } from '../../src/engine/advise'
import type { DraftState } from '../../src/engine/types'
import { html } from '../../src/ui/html'
import { mountPanel } from '../../src/ui/mount'
import { Panel } from '../../src/ui/Panel'
import { build, nominated, pv, settings, sold } from '../helpers'

const S = settings(4, { lineupSlotCounts: { 12: 13 } })
const V = [pv('Alpha', 30), pv('Beta', 18)]

function show(state: DraftState) {
  const el = document.createElement('div')
  const onEvent = vi.fn()
  render(html`<${Panel} advice=${advise(state)} state=${state} health="manual" banner=${null} frameCount=${0} onEvent=${onEvent} onDownloadRecording=${() => {}} />`, el)
  return { el, onEvent }
}
const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!
const fill = (el: HTMLElement, player: string, team: string, amount: string) => {
  ;(el.querySelector('input[name=player]') as HTMLInputElement).value = player
  ;(el.querySelector('select[name=team]') as HTMLSelectElement).value = team
  ;(el.querySelector('input[name=amount]') as HTMLInputElement).value = amount
}

describe('Panel', () => {
  it('shows the call for the player on the block', () => {
    expect(show(build(S, V, [nominated('Alpha', 2, 1)])).el.textContent).toContain('BID up to $35')
  })

  it('asks which team is mine when it is unknown', () => {
    const { el, onEvent } = show(build(S, V, [], null))
    const select = el.querySelector('.picker select') as HTMLSelectElement
    select.value = '3'
    select.dispatchEvent(new Event('change'))
    expect(onEvent).toHaveBeenCalledWith({ type: 'setMyTeam', teamId: 3 })
  })

  it('ignores the blank option in the team picker', () => {
    const { el, onEvent } = show(build(S, V, [], null))
    const select = el.querySelector('.picker select') as HTMLSelectElement
    select.value = ''
    select.dispatchEvent(new Event('change'))
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('flags a player on the block who has no value', () => {
    expect(show(build(S, V, [nominated('Ghost', 2, 1)])).el.textContent).toContain('ghost has no value')
  })

  it('pins a target', () => {
    const { el, onEvent } = show(build(S, V, []))
    ;(el.querySelector('button.pin') as HTMLButtonElement).click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'toggleTarget', playerKey: 'beta' })
  })

  it('fixes a sale through a prompt ("price team")', () => {
    const { el, onEvent } = show(build(S, V, [sold('Alpha', 2, 12)]))
    vi.spyOn(window, 'prompt').mockReturnValue('14 3')
    ;(el.querySelector('button.fix') as HTMLButtonElement).click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'editSale', seq: 1, teamId: 3, price: 14 })
  })
})

describe('ManualEntry', () => {
  it('Nominated dispatches a nomination', () => {
    const { el, onEvent } = show(build(S, V, []))
    fill(el, 'Alpha', '2', '5')
    button(el, 'Nominated').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'nominated', playerKey: 'alpha', teamId: 2, amount: 5 })
  })

  it('Bid dispatches a bid', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 2, 1)]))
    fill(el, '', '3', '9')
    button(el, 'Bid').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'bid', teamId: 3, amount: 9 })
  })

  it('Sold closes the live auction at its price and leader', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 3, 7)]))
    button(el, 'Sold').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'sold', playerKey: 'alpha', teamId: 3, price: 7 })
  })

  it('Set value dispatches a value edit', () => {
    const { el, onEvent } = show(build(S, V, []))
    fill(el, 'Ghost', '1', '4')
    button(el, 'Set value').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'setValue', playerKey: 'ghost', b: 4 })
  })
})

describe('mountPanel', () => {
  it('mounts a container inside a shadow root', () => {
    const container = mountPanel(document)
    const host = document.getElementById('eah-host')!
    expect(host.shadowRoot!.contains(container)).toBe(true)
    expect(host.shadowRoot!.querySelector('style')!.textContent).toContain('.panel')
  })
})
