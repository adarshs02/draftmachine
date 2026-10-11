/** ESPN fantasy basketball lineup slot ids (0 PG, 1 SG, 2 SF, 3 PF, 4 C, 5 G, 6 F, 7 SG/SF, 8 G/F, 9 PF/C, 10 F/C). */
export const UTIL_SLOT = 11
export const BENCH_SLOT = 12
export const IR_SLOT = 13
/** ESPN's default categories roster: PG, SG, SF, PF, C, G, F, 3 UTIL, 3 bench = 13. */
export const ESPN_DEFAULT_COUNTS: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3 }
