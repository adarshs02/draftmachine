// Tunables. Defaults validated on the Josh Lloyd replay (helper spec §9).
export const DEFAULT_TUNABLES = Object.freeze({
  INFLATION_MIN: 0.8,
  INFLATION_MAX: 1.2,
  TEMP_WINDOW: 12,
  TEMP_MIN_SALES: 4,
  TEMP_MIN_VALUE: 5,
  HOT: 1.05,
  WARM: 1.02,
  COLD: 0.95,
  STAR_TIER_MAX: 2,
  BARGAIN_RATIO: 0.95,
  BID_GAP_MIN: 3,
  BID_GAP_FRACTION: 0.25,
  BID_UP_MARGIN: 2,
  NEED_BOOST: 1.1,
  THIN_FACTOR: 1.5,
  NEED_MIN_VALUE: 5,
  ONE_PLAYER_SHARE: 0.35,
  TWO_PLAYER_SHARE: 0.7,
  EARLY_MONEY: 0.6,
  DOLLAR_MONEY: 0.15,
  DECOY_MARKET_RATIO: 1.1,
  SLOT_FLOOR: 0.5,
  SLOT_FLOOR_OPEN: 6,
})

export type Tunables = { -readonly [K in keyof typeof DEFAULT_TUNABLES]: number }
export type TunableName = keyof Tunables

/** Live values the engine reads on every call; the simulator's batch runner and tunables drawer change them. */
export const TUNABLES: Tunables = { ...DEFAULT_TUNABLES }

export function setTunables(overrides: Partial<Tunables>): void {
  for (const [name, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(DEFAULT_TUNABLES, name)) throw new Error(`unknown tunable ${name}`)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`tunable ${name} must be a finite number`)
    TUNABLES[name as TunableName] = value
  }
}

export function resetTunables(): void {
  Object.assign(TUNABLES, DEFAULT_TUNABLES)
}
