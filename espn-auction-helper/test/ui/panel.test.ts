// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { advise } from '../../src/engine/advise'
import type { DraftState } from '../../src/engine/types'
import { html } from '../../src/ui/html'
import { mountPanel } from '../../src/ui/mount'
import { Panel } from '../../src/ui/Panel'
import { build, nominated, pv, settings, sold } from '../helpers'

const S = settings(4, { lineupSlotCounts: { 12: 13 } })
const V = [pv('Alpha', 30), pv('Beta', 18)]

function show(state: DraftState, extra: Record<string, unknown> = {}) {
  const el = document.createElement('div')
  const onEvent = vi.fn()
  const onReset = vi.fn()
  const onDismissAlert = vi.fn()
  render(
    html`<${Panel} advice=${advise(state)} state=${state} health="manual" banner=${null} alert=${null} unknownVerbs=${{}} frameCount=${0} onEvent=${onEvent} onDownloadRecording=${() => {}} onReset=${onReset} onDismissAlert=${onDismissAlert} ...${extra} />`,
    el,
  )
  return { el, onEvent, onReset, onDismissAlert }
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

  it('lets me change my team after it is set', () => {
    const { el, onEvent } = show(build(S, V, [], 1))
    const select = el.querySelector('.picker select') as HTMLSelectElement
    expect(el.querySelector('.picker')!.textContent).toContain('My team')
    expect(select.value).toBe('1')
    select.value = '3'
    select.dispatchEvent(new Event('change'))
    expect(onEvent).toHaveBeenCalledWith({ type: 'setMyTeam', teamId: 3 })
  })

  it('flags a player on the block who has no value', () => {
    expect(show(build(S, V, [nominated('Ghost', 2, 1)])).el.textContent).toContain('ghost has no value')
  })

  it('shortens a long outbid list to a count, keeping the names in the tooltip', () => {
    const state = build(S, V, [])
    const advice = advise(state)
    const cell = (names: string[]) => {
      const el = document.createElement('div')
      const targets = advice.targets.map((t, i) => (i === 0 ? { ...t, outbidBy: names } : t))
      render(
        html`<${Panel} advice=${{ ...advice, targets }} state=${state} health="manual" banner=${null} alert=${null} unknownVerbs=${{}} frameCount=${0} onEvent=${() => {}} onDownloadRecording=${() => {}} onReset=${() => {}} onDismissAlert=${() => {}} />`,
        el,
      )
      return el.querySelector('td.muted:last-child') as HTMLElement
    }
    const many = cell(['T2', 'T3', 'T4'])
    expect(many.textContent).toBe('outbid by 3 teams')
    expect(many.title).toBe('T2, T3, T4')
    expect(cell(['T2']).textContent).toBe('outbid: T2')
    expect(cell(['T2', 'T3']).textContent).toBe('outbid: T2, T3')
    expect(cell([]).textContent).toBe('')
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

  it('asks for the team number in the fix prompt and accepts a unique team-name prefix', () => {
    const { el, onEvent } = show(build(S, V, [sold('Alpha', 2, 12)]))
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('14 t3')
    ;(el.querySelector('button.fix') as HTMLButtonElement).click()
    expect(prompt).toHaveBeenCalledWith('Fix Alpha: price and team # (e.g. "14 3")', '12 2')
    expect(onEvent).toHaveBeenCalledWith({ type: 'editSale', seq: 1, teamId: 3, price: 14 })
  })

  it('ignores a fix whose team is neither an id nor a unique name prefix', () => {
    const { el, onEvent } = show(build(S, V, [sold('Alpha', 2, 12)]))
    for (const answer of ['14 t', '14 zz', '14 9']) {
      vi.spyOn(window, 'prompt').mockReturnValue(answer)
      ;(el.querySelector('button.fix') as HTMLButtonElement).click()
    }
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('labels teams with their id in the team pickers and the rivals table', () => {
    const { el } = show(build(S, V, []))
    const options = (sel: string) => [...el.querySelectorAll(`${sel} option`)].map((o) => o.textContent)
    expect(options('.picker select')).toContain('#3 T3')
    expect(options('select[name=team]')).toContain('#2 T2')
    expect([...el.querySelectorAll('section')].find((x) => x.textContent!.includes('Rivals'))!.textContent).toContain('#4 T4')
  })

  it('asks me to pick my team before giving a call', () => {
    const { el } = show(build(S, V, [nominated('Alpha', 2, 1)], null))
    expect(el.querySelector('.now')!.textContent).toContain('Pick your team to see the call')
  })

  it('collapses everything below the header and expands again', async () => {
    const { el } = show(build(S, V, []))
    const toggle = () => el.querySelector('header button.collapse') as HTMLButtonElement
    expect(toggle().textContent).toBe('–')
    await act(() => toggle().click())
    expect(el.querySelector('.now')).toBeNull()
    expect(el.querySelector('form.manual')).toBeNull()
    expect(el.querySelector('header')).not.toBeNull()
    expect(toggle().textContent).toBe('+')
    await act(() => toggle().click())
    expect(el.querySelector('.now')).not.toBeNull()
  })

  it('shows an alert with a × that dismisses it', () => {
    const { el, onDismissAlert } = show(build(S, V, []), { alert: "Missed the end of Alpha's auction (last seen $25 by T3). If it sold, enter it with Sold." })
    const box = el.querySelector('.alert') as HTMLElement
    expect(box.textContent).toContain("Missed the end of Alpha's auction")
    const close = box.querySelector('button') as HTMLButtonElement
    expect(close.textContent).toBe('×')
    close.click()
    expect(onDismissAlert).toHaveBeenCalledTimes(1)
  })

  it('shows unknown socket verbs with their counts next to the frame count', () => {
    const footer = (unknownVerbs: Record<string, number>) => show(build(S, V, []), { unknownVerbs, frameCount: 7 }).el.querySelector('footer')!.textContent!
    expect(footer({ ZZZ_NEW: 2, QQQ: 1 })).toContain('Download recording (7 frames)unknown: ZZZ_NEW×2, QQQ×1')
    expect(footer({})).not.toContain('unknown')
  })

  it('shows no alert box without an alert', () => {
    expect(show(build(S, V, [])).el.querySelector('.alert')).toBeNull()
  })

  it('New draft resets only after confirming', () => {
    const { el, onReset } = show(build(S, V, [sold('Alpha', 2, 12)]))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    button(el, 'New draft').click()
    expect(confirm).toHaveBeenCalledWith('Start a new draft? This clears all recorded sales.')
    expect(onReset).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    button(el, 'New draft').click()
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe('ManualEntry', () => {
  it('Nominated dispatches a nomination', () => {
    const { el, onEvent } = show(build(S, V, []))
    fill(el, 'Alpha', '2', '5')
    button(el, 'Nominated').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'nominated', playerKey: 'alpha', teamId: 2, amount: 5 })
  })

  it('Nominated resolves a partial name to the real player', () => {
    const { el, onEvent } = show(build(S, V, []))
    fill(el, 'alp', '2', '5')
    button(el, 'Nominated').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'nominated', playerKey: 'alpha', teamId: 2, amount: 5 })
  })

  it('Nominated shows an error and sends nothing for an unknown name', async () => {
    const { el, onEvent } = show(build(S, V, []))
    fill(el, 'zzz', '2', '5')
    await act(() => button(el, 'Nominated').click())
    expect(onEvent).not.toHaveBeenCalled()
    expect(el.querySelector('form.manual')!.textContent).toContain('No player matches "zzz"')
  })

  it('suggests every player value, with no cap', () => {
    const many = Array.from({ length: 305 }, (_, i) => pv(`Player ${i}`, 1 + (i % 50)))
    const { el } = show(build(S, many, [sold('Player 0', 2, 3)]))
    expect(el.querySelectorAll('datalist option')).toHaveLength(305)
  })

  it('Bid dispatches a bid', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 2, 1)]))
    fill(el, '', '3', '9')
    button(el, 'Bid').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'bid', teamId: 3, amount: 9 })
  })

  it('Sold with no amount typed closes the live auction at its price and leader', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 3, 7)]))
    button(el, 'Sold').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'sold', playerKey: 'alpha', teamId: 3, price: 7 })
  })

  it('Sold with an amount typed sells the live player to the typed team at that amount', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 3, 7)]))
    fill(el, '', '2', '25')
    button(el, 'Sold').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'sold', playerKey: 'alpha', teamId: 2, price: 25 })
  })

  it('clears the amount input after an action dispatches an event', () => {
    const { el } = show(build(S, V, [nominated('Alpha', 3, 7)]))
    fill(el, '', '2', '25')
    button(el, 'Sold').click()
    expect((el.querySelector('input[name=amount]') as HTMLInputElement).value).toBe('')
    expect((el.querySelector('select[name=team]') as HTMLSelectElement).value).toBe('2')
  })

  it('Clear block takes the player off the block', () => {
    const { el, onEvent } = show(build(S, V, [nominated('Alpha', 3, 7)]))
    button(el, 'Clear block').click()
    expect(onEvent).toHaveBeenCalledWith({ type: 'clearLive' })
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
