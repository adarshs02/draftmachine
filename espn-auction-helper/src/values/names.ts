/** Join key for player names across ESPN, Josh's CSV and manual entry. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''`.]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    // digits survive: no NBA name has one, and test fixtures like "F1"/"F2" must stay distinct
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
