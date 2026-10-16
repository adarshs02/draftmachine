// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { advise } from '../../src/engine/advise'
import type { DraftEvent, DraftState } from '../../src/engine/types'
import { html } from '../../src/ui/html'
import { mountPanel } from '../../src/ui/mount'
import { Panel } from '../../src/ui/Panel'
import { FIT_S, FIT_V } from '../engine/fitFixture'
import { build, nominated, pv, settings, sold } from '../helpers'

const S = settings(4, { lineupSlotCounts: { 12: 13 } })
const V = [pv('Alpha', 30), pv('Beta', 18)]

function show(state: DraftState, extra: Record<string, unknown> = {}) {
  const el = document.createElement('div')
  // Like the controller: every event applies unless a test says otherwise.
  const onEvent = vi.fn<(ev: DraftEvent) => boolean>(() => true)
  const onReset = vi.fn()
  const onDismissAlert = vi.fn()
  render(
    html`<${Panel} advice=${advise(state)} state=${state} health="manual" banner=${null} alert=${null} unknownVerbs=${{}} frameCount=${0} onEvent=${onEvent} onDownloadRecording=${() => {}} onReset=${onReset} onDismissAlert=${onDismissAlert} ...${extra} />`,
    el,
  )
  return { el, onEvent, onReset, onDismissAlert }
}
const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!

describe('Panel', () => {
  it('shows the call for the player on the block', () => {
    expect(show(build(S, V, [nominated('Alpha', 2, 1)])).el.textContent).toContain('BID up to $35')
  })

  it('explains a save-the-slot PASS', () => {
    const text = show(build(S, [...V, pv('Cheap', 5)], [nominated('Cheap', 2, 1)])).el.textContent
    expect(text).toContain('PASS: save the slot')
    expect(text).toContain('worth $6 vs your $18/slot')
  })

  it('shows how the player fits my roster when it moves his value', () => {
    const bricks = [sold('Brick1', 1, 20), sold('Brick2', 1, 20), sold('Brick3', 1, 20)]
    expect(show(build(FIT_S, FIT_V, [...bricks, nominated('Shooter', 2, 1)])).el.textContent).toMatch(/fits your team ×0\.\d\d: less useful in FT%/)
    expect(show(build(FIT_S, FIT_V, [nominated('Shooter', 2, 1)])).el.textContent).not.toContain('fits your team')
  })

  it('says where the value of the player on the block comes from, and flags a value play', () => {
    const v = FIT_V.map((x) => (x.key === 'passer' ? { ...x, market: 10 } : x))
    const text = show(build(FIT_S, v, [nominated('Passer', 2, 1)])).el.textContent
    expect(text).toMatch(/Value from: AST/)
    expect(text).toContain('⭐ value play: room usually pays $10')
  })

  it('lists players to look for, value plays starred, with where my team stands', () => {
    const v = FIT_V.map((x) => (x.key === 'passer' ? { ...x, market: 10 } : x))
    const walls = [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20)]
    const { el } = show(build(FIT_S, v, walls))
    const section = el.querySelector('.lookfor')!
    const rows = [...section.querySelectorAll('.look')]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(6)
    expect(rows[0].textContent).toContain('⭐ Passer')
    expect(rows[0].querySelector('.tags')!.textContent).toContain('+AST')
    expect(section.textContent).toContain('Your team: strong BLK')
  })

  it('warns when the player on the block is injury prone or returning from major injury', () => {
    const prone = { label: 'prone' as const, games: [76, 51, 20] }
    const text = show(build(S, [pv('Alpha', 30, { injury: prone }), pv('Beta', 18)], [nominated('Alpha', 2, 1)])).el.querySelector('.now')!.textContent
    expect(text).toContain('Injury prone: 76/51/20 games, last 3 seasons')
    const recent = { label: 'recent' as const, games: [74, 72, 16] }
    const now = show(build(S, [pv('Alpha', 30, { injury: recent }), pv('Beta', 18)], [nominated('Alpha', 2, 1)])).el.querySelector('.now')!
    expect(now.querySelector('.note.injury.recent')!.textContent).toContain('Returning from major injury: 16 games last season')
    expect(show(build(S, V, [nominated('Alpha', 2, 1)])).el.querySelector('.now .injury')).toBeNull()
  })

  it('tags injury prone players in Look for and Nominate', () => {
    const prone = { label: 'prone' as const, games: [39, 19, 38] }
    const v = FIT_V.map((x) => (x.key === 'passer' ? { ...x, market: 10, injury: prone } : x))
    const walls = [sold('Wall1', 1, 20), sold('Wall2', 1, 20), sold('Wall3', 1, 20)]
    const tag = show(build(FIT_S, v, walls)).el.querySelector('.lookfor .look .inj.prone')!
    expect(tag.textContent).toBe('INJ')
    expect(tag.getAttribute('title')).toBe('Injury prone: 39/19/38 games, last 3 seasons')
    const nominate = show(build(S, [pv('Alpha', 30, { injury: prone }), pv('Beta', 18)], [])).el.querySelector('.nominate')!
    expect(nominate.querySelector('b')!.textContent).toBe('Alpha')
    expect(nominate.querySelector('.inj')!.textContent).toBe('INJ')
  })

  it('tints the call card by the call', () => {
    expect(show(build(S, V, [nominated('Alpha', 2, 1)])).el.querySelector('section.now.BID')).not.toBeNull()
    expect(show(build(S, V, [nominated('Alpha', 2, 40)])).el.querySelector('section.now.LET_THEM')).not.toBeNull()
  })

  it('labels value, ESPN avg and my max on the call card, with a price bar', () => {
    const state = build(S, [pv('Alpha', 30, { market: 41.6 }), pv('Beta', 18)], [nominated('Alpha', 2, 20)])
    const now = show(state).el.querySelector('.now')!
    const stats = [...now.querySelectorAll('.stat')].map((x) => x.textContent)
    expect(stats).toEqual(['value $36', 'ESPN avg $42', 'your max $35'])
    expect(now.querySelector('.bar')!.getAttribute('aria-label')).toBe('price $20, your max $35, value $36')
  })

  it('shows my budget as four labelled numbers', () => {
    const stats = [...show(build(S, V, [sold('Beta', 1, 20)])).el.querySelectorAll('.budget .stat')].map((x) => x.textContent)
    expect(stats).toEqual(['$180 left', '12 spots', '$18 per slot', '$169 safe max'])
  })

  it('sorts rivals by max bid and highlights those who can outbid my max on the block', () => {
    const state = build(S, V, [sold('Beta', 2, 190), nominated('Alpha', 3, 1)])
    const rows = [...show(state).el.querySelectorAll('.rivals tr')]
    expect(rows.map((r) => r.querySelector('td')!.textContent)).toEqual(['#3 T3', '#4 T4', '#2 T2'])
    expect(rows.map((r) => r.classList.contains('over'))).toEqual([true, true, false])
  })

  it('colors each sale by its price against the player value, newest first, at most 8', () => {
    const sales = [sold('Alpha', 2, 25), sold('Beta', 3, 25), ...Array.from({ length: 8 }, (_, i) => sold(`F${i}`, 4, 1))]
    const rows = [...show(build(S, V, sales)).el.querySelectorAll('.sales .sale')]
    expect(rows).toHaveLength(8)
    const alpha = show(build(S, V, [sold('Alpha', 2, 25), sold('Beta', 3, 25)])).el.querySelectorAll('.sales .sale')
    const cells = (r: Element) => ['.name', '.team', '.price', '.val'].map((c) => r.querySelector(c)!.textContent)
    expect([...alpha].map((r) => [r.querySelector('.price')!.className, ...cells(r)])).toEqual([
      ['price over', 'Beta', 'T3', '$25', 'val $18'],
      ['price under', 'Alpha', 'T2', '$25', 'val $30'],
    ])
  })

  describe('nomination turn line', () => {
    const line = (state: DraftState) => show(state).el.querySelector('.turn')?.textContent ?? null

    it('says so when it is my turn', () => {
      const el = show(build(S, V, [], 1)).el
      expect(el.querySelector('.turn')!.textContent).toBe('Your turn to nominate')
      expect(el.querySelector('.turn .call')).not.toBeNull()
    })

    it('says who is nominating now and how many turns until mine', () => {
      expect(line(build(S, V, [], 3))).toBe('Nominating now: #1 T1 · you nominate in 2 turns')
      expect(line(build(S, V, [{ type: 'turn', teamId: 2 }], 3))).toBe('Nominating now: #2 T2 · you nominate in 1 turn')
    })

    it('omits the "you nominate" part when my team is unknown', () => {
      expect(line(build(S, V, [], null))).toBe('Nominating now: #1 T1')
    })

    it('shows who is up next while a player is on the block', () => {
      expect(line(build(S, V, [nominated('Alpha', 1, 1)], 4))).toBe('Up next: #2 T2 · you nominate in 2 turns')
      expect(line(build(S, V, [nominated('Alpha', 1, 1)], 2))).toBe('Up next: #2 T2 · you nominate next')
    })

    it('is hidden when nobody has room to nominate', () => {
      expect(line(build(settings(2, { rosterSize: 1, lineupSlotCounts: { 12: 1 } }), V, [sold('Alpha', 1, 5), sold('Beta', 2, 5)], 1))).toBeNull()
    })

    it('sits directly above the Nominate section', () => {
      const el = show(build(S, V, [], 1)).el
      expect(el.querySelector('.turn')!.nextElementSibling?.classList.contains('nominate')).toBe(true)
    })
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

  it('names an unmapped ESPN id on the block "ESPN #<id>"', () => {
    const state = build(S, V, [{ type: 'nominated', playerKey: 'espn:4396993', teamId: 2, amount: 1 }])
    expect(show(state).el.querySelector('.now')!.textContent).toContain('ESPN #4396993 has no value')
  })

  it('has no manual entry', () => {
    const { el } = show(build(S, V, [nominated('Alpha', 2, 1)]))
    expect(el.textContent).not.toMatch(/manual entry|Set value|Clear block/i)
    expect(el.querySelector('input[name=player]')).toBeNull()
  })

  it("shows ESPN's average price for the player on the block", () => {
    const state = build(S, [pv('Alpha', 30, { market: 41.6 }), pv('Beta', 18)], [nominated('Alpha', 2, 1)])
    expect(show(state).el.querySelector('.now')!.textContent).toContain('ESPN avg $42')
  })

  it('has no Targets list', () => {
    const { el } = show(build(S, V, []))
    expect(el.textContent).not.toContain('Targets')
    expect(el.querySelector('button.pin')).toBeNull()
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

  it('labels teams with their id in the team picker and the rivals table', () => {
    const { el } = show(build(S, V, []))
    const options = (sel: string) => [...el.querySelectorAll(`${sel} option`)].map((o) => o.textContent)
    expect(options('.picker select')).toContain('#3 T3')
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

describe('mountPanel', () => {
  it('mounts a container inside a shadow root', () => {
    const container = mountPanel(document)
    const host = document.getElementById('eah-host')!
    expect(host.shadowRoot!.contains(container)).toBe(true)
    expect(host.shadowRoot!.querySelector('style')!.textContent).toContain('.panel')
  })
})
