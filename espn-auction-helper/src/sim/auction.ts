import { botCap, botNominate, botRaise, drawBotValues, marketPrice, maxBid } from './bots'
import { mulberry32, uniform, type Rng } from './rng'
import { ROSTER_SIZE, simTeams, type SimOptions } from './setup'
import type { SimPlayer, SimSale, SimTeam } from './types'

// From the real ESPN recording.
export const START_MS = 25000
export const MIN_AFTER_BID_MS = 10000
export const NOMINATE_TIMEOUT_MS = 25000
export const CLOCK_EVERY_MS = 2000
export const BOT_REACT_MS: readonly [number, number] = [300, 3000]
export const BOT_NOMINATE_MS: readonly [number, number] = [1000, 4000]

export interface Block {
  espnId: number
  price: number
  leaderId: number
  /** sim time the clock runs out */
  endsAt: number
}

export interface AuctionView {
  readonly time: number
  readonly myTeamId: number
  readonly teams: readonly SimTeam[]
  readonly block: Block | null
  readonly onClock: number | null
  readonly available: readonly SimPlayer[]
  readonly sales: readonly SimSale[]
  readonly done: boolean
}

/** How "my team" plays: autopilot, a baseline, or nobody (the page's buttons call myBid / myNominate). */
export interface MyAgent {
  reactionMs: number
  /** My nomination, or null to keep waiting (the sim auto-nominates when my clock runs out). */
  nominate(view: AuctionView): { espnId: number; amount: number } | null
  /** Highest price I'll go to for the player on the block; null or <= price = stay out. */
  bidCap(view: AuctionView): number | null
}

export const MANUAL_AGENT: MyAgent = { reactionMs: 0, nominate: () => null, bidCap: () => null }

export interface SimHooks {
  onLine(line: string, time: number): void
}

type Action =
  | { kind: 'botBid'; teamId: number }
  | { kind: 'myBid' }
  | { kind: 'botNominate'; teamId: number }
  | { kind: 'myNominate' }
  | { kind: 'nominateTimeout' }
  | { kind: 'expire' }
  | { kind: 'clock' }

interface Scheduled {
  at: number
  seq: number
  action: Action
}

/** Event-driven ESPN salary-cap auction: no real waiting, deterministic per seed. */
export class AuctionSim implements AuctionView {
  time = 0
  readonly myTeamId: number
  readonly teams: SimTeam[]
  block: Block | null = null
  onClock: number | null = null
  available: SimPlayer[]
  readonly sales: SimSale[] = []
  done = false

  private readonly rng: Rng
  private readonly botValues = new Map<number, Map<number, number>>()
  private queue: Scheduled[] = []
  private seq = 0
  private lastNominator: number | null = null
  private nominateDeadline = 0

  constructor(
    private readonly o: SimOptions,
    players: readonly SimPlayer[],
    private readonly hooks: SimHooks,
    private agent: MyAgent = MANUAL_AGENT,
  ) {
    this.rng = mulberry32(o.seed)
    this.myTeamId = o.myTeamId
    this.teams = simTeams(o)
    this.available = [...players].sort((a, b) => marketPrice(b) - marketPrice(a))
    for (const t of this.teams) if (t.bot) this.botValues.set(t.id, drawBotValues(this.rng, t.bot, this.available, o.room))
    this.emit('STATE 1')
    if (o.emitClock) this.schedule(CLOCK_EVERY_MS, { kind: 'clock' })
    this.startTurn()
  }

  setAgent(agent: MyAgent): void {
    this.agent = agent
    if (this.onClock === this.myTeamId && !this.block) this.schedule(agent.reactionMs, { kind: 'myNominate' })
    this.replan()
  }

  nextEventAt(): number | null {
    if (this.done || !this.queue.length) return null
    return Math.min(...this.queue.map((q) => q.at))
  }

  /** Runs every event due at or before `t` in order, then moves the clock to `t`. */
  advanceTo(t: number): void {
    for (let next = this.popDue(t); next && !this.done; next = this.popDue(t)) {
      this.time = next.at
      this.run(next.action)
    }
    if (!this.done) this.time = Math.max(this.time, t)
  }

  myBid(amount: number): string | null {
    const b = this.block
    if (!b) return 'Nothing is on the block'
    const me = this.team(this.myTeamId)
    if (b.leaderId === me.id) return 'You already lead'
    if (!Number.isInteger(amount) || amount <= b.price) return `Bid must beat $${b.price}`
    if (amount > this.maxBidOf(me)) return `Your max bid is $${this.maxBidOf(me)}`
    this.placeBid(me.id, amount)
    return null
  }

  myNominate(espnId: number, amount: number): string | null {
    if (this.onClock !== this.myTeamId || this.block) return 'Not your turn to nominate'
    const player = this.available.find((p) => p.espnId === espnId)
    if (!player) return 'That player is not available'
    const me = this.team(this.myTeamId)
    if (!Number.isInteger(amount) || amount < 1 || amount > this.maxBidOf(me)) return `Opening bid must be $1-$${this.maxBidOf(me)}`
    this.openBlock(me.id, player, amount)
    return null
  }

  private team(id: number): SimTeam {
    return this.teams.find((t) => t.id === id)!
  }

  private open(t: SimTeam): number {
    return ROSTER_SIZE - t.roster.length
  }

  private maxBidOf(t: SimTeam): number {
    return maxBid(t.budget, this.open(t))
  }

  private emit(line: string): void {
    this.hooks.onLine(line, this.time)
  }

  private schedule(delay: number, action: Action): void {
    this.queue.push({ at: this.time + delay, seq: this.seq++, action })
  }

  private cancel(kinds: Array<Action['kind']>): void {
    this.queue = this.queue.filter((q) => !kinds.includes(q.action.kind))
  }

  private popDue(t: number): Scheduled | null {
    let best = -1
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i]
      if (q.at > t) continue
      const b = this.queue[best]
      if (best === -1 || q.at < b.at || (q.at === b.at && q.seq < b.seq)) best = i
    }
    return best === -1 ? null : this.queue.splice(best, 1)[0]
  }

  private startTurn(): void {
    const order = this.o.pickOrder
    const hasRoom = (id: number) => this.open(this.team(id)) > 0
    if (!this.available.length || !order.some(hasRoom)) return this.finish()
    const start = this.lastNominator === null ? -1 : order.indexOf(this.lastNominator)
    let teamId = order[0]
    for (let step = 1; step <= order.length; step++) {
      const id = order[(start + step + order.length) % order.length]
      if (hasRoom(id)) {
        teamId = id
        break
      }
    }
    this.onClock = teamId
    this.nominateDeadline = this.time + NOMINATE_TIMEOUT_MS
    this.emit(`NOMINATION ${teamId} ${NOMINATE_TIMEOUT_MS}`)
    if (teamId === this.myTeamId) {
      this.schedule(this.agent.reactionMs, { kind: 'myNominate' })
      this.schedule(NOMINATE_TIMEOUT_MS, { kind: 'nominateTimeout' })
    } else {
      this.schedule(uniform(this.rng, BOT_NOMINATE_MS[0], BOT_NOMINATE_MS[1]), { kind: 'botNominate', teamId })
    }
  }

  private openBlock(teamId: number, player: SimPlayer, amount: number): void {
    this.cancel(['myNominate', 'nominateTimeout', 'botNominate'])
    this.available = this.available.filter((p) => p.espnId !== player.espnId)
    this.onClock = null
    this.lastNominator = teamId
    this.block = { espnId: player.espnId, price: amount, leaderId: teamId, endsAt: this.time + START_MS }
    this.emit(`BID ${teamId} ${player.espnId} ${amount} ${START_MS} ${START_MS}`)
    this.replan()
  }

  private placeBid(teamId: number, amount: number): void {
    const b = this.block!
    b.price = amount
    b.leaderId = teamId
    b.endsAt = Math.max(b.endsAt, this.time + MIN_AFTER_BID_MS)
    this.emit(`BID ${teamId} ${b.espnId} ${amount} ${START_MS} ${b.endsAt - this.time}`)
    this.replan()
  }

  private botCapFor(t: SimTeam): number {
    return botCap(this.botValues.get(t.id)!.get(this.block!.espnId) ?? 0, t.budget, this.open(t))
  }

  private myCap(): number {
    const cap = this.agent.bidCap(this)
    return cap === null ? 0 : Math.min(Math.floor(cap), this.maxBidOf(this.team(this.myTeamId)))
  }

  /** After any change on the block: who wants to raise, and when. */
  private replan(): void {
    this.cancel(['botBid', 'myBid', 'expire'])
    const b = this.block
    if (!b) return
    this.queue.push({ at: b.endsAt, seq: this.seq++, action: { kind: 'expire' } })
    for (const t of this.teams) {
      if (t.id === b.leaderId || this.open(t) === 0) continue
      if (t.bot) {
        if (this.botCapFor(t) > b.price) this.schedule(uniform(this.rng, BOT_REACT_MS[0], BOT_REACT_MS[1]), { kind: 'botBid', teamId: t.id })
      } else if (this.myCap() > b.price) {
        this.schedule(this.agent.reactionMs, { kind: 'myBid' })
      }
    }
  }

  private run(a: Action): void {
    switch (a.kind) {
      case 'clock': {
        const remaining = this.block ? this.block.endsAt - this.time : Math.max(0, this.nominateDeadline - this.time)
        this.emit(`CLOCK 6 ${remaining} ${this.block?.leaderId ?? this.onClock ?? 0}`)
        this.schedule(CLOCK_EVERY_MS, { kind: 'clock' })
        return
      }
      case 'botNominate':
        this.openBlock(a.teamId, botNominate(this.rng, this.available), 1)
        return
      case 'myNominate': {
        const pick = this.agent.nominate(this)
        if (pick) this.myNominate(pick.espnId, pick.amount)
        return
      }
      case 'nominateTimeout':
        // ESPN nominates for a team whose clock runs out.
        if (this.onClock === this.myTeamId && !this.block) this.openBlock(this.myTeamId, this.available[0], 1)
        return
      case 'botBid': {
        const t = this.team(a.teamId)
        const b = this.block!
        const next = botRaise(this.rng, b.price, this.botCapFor(t), this.botValues.get(t.id)!.get(b.espnId) ?? 0)
        if (next !== null) this.placeBid(t.id, next)
        return
      }
      case 'myBid':
        if (this.block && this.myCap() > this.block.price) this.placeBid(this.myTeamId, this.block.price + 1)
        return
      case 'expire':
        this.sell()
        return
    }
  }

  private sell(): void {
    const b = this.block!
    const t = this.team(b.leaderId)
    t.budget -= b.price
    t.roster.push(b.espnId)
    this.sales.push({ espnId: b.espnId, teamId: t.id, price: b.price })
    this.emit(`SOLD ${t.id} ${b.espnId} 0 ${b.price} 0`)
    this.block = null
    this.cancel(['botBid', 'myBid', 'expire'])
    this.startTurn()
  }

  private finish(): void {
    this.done = true
    this.onClock = null
    this.queue = []
    this.emit('STATE 2')
  }
}

/** Runs a draft to the end without waiting; the guard stops a runaway loop instead of hanging. */
export function runToEnd(sim: AuctionSim, guard = 1_000_000): void {
  for (let i = 0; !sim.done; i++) {
    if (i >= guard) throw new Error('simulation did not finish')
    const next = sim.nextEventAt()
    if (next === null) throw new Error('simulation stalled with nothing scheduled')
    sim.advanceTo(next)
  }
}
