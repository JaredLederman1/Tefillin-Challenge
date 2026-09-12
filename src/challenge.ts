export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function dateKey(date = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function isShabbat(key: string) { return new Date(`${key}T12:00:00Z`).getUTCDay() === 6; }
export function monthDays(key: string) {
  const [year, month] = key.split('-').map(Number);
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}
export function streak(keys: string[], today: string) {
  const checked = new Set(keys);
  const cursor = new Date(`${today}T12:00:00Z`);
  let count = 0;
  if (!checked.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (let i = 0; i < 3700; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (!isShabbat(key)) { if (!checked.has(key)) break; count++; }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}
export function parseContribution(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a dollar amount with up to two decimal places.');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 500 || cents > 100000) throw new Error('Choose an amount between $5 and $1,000.');
  return cents;
}
// Largest-remainder allocation: integer cents, deterministic, and no money lost to rounding.
export function allocatePool(entries: { id: string; cents: number; completed: boolean }[]) {
  if (new Set(entries.map(e => e.id)).size !== entries.length || entries.some(e => !Number.isSafeInteger(e.cents) || e.cents < 500)) throw new Error('Invalid contribution entries');
  const winners = entries.filter(e => e.completed);
  const forfeited = entries.filter(e => !e.completed).reduce((sum, e) => sum + e.cents, 0);
  const totalWeight = winners.reduce((sum, e) => sum + e.cents, 0);
  if (!winners.length) return { rewards: [], rolloverCents: forfeited };
  const rewards = winners.map(e => ({ id: e.id, rewardCents: Math.floor(forfeited * e.cents / totalWeight), remainder: (forfeited * e.cents) % totalWeight }));
  let left = forfeited - rewards.reduce((sum, e) => sum + e.rewardCents, 0);
  rewards.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const row of rewards) if (left-- > 0) row.rewardCents++;
  return { rewards: rewards.map(({ id, rewardCents }) => ({ id, rewardCents })), rolloverCents: 0 };
}

// Total credits (principal and reward) after fees, matching settle_net_month.
export function allocateNetPool(entries: { id: string; cents: number; completed: boolean }[], feeCents: number) {
  if (!Number.isSafeInteger(feeCents) || feeCents < 0 || new Set(entries.map(e => e.id)).size !== entries.length || entries.some(e => !Number.isSafeInteger(e.cents) || e.cents < 500)) throw new Error('Invalid pool');
  const gross = entries.reduce((n, e) => n + BigInt(e.cents), 0n);
  const net = gross - BigInt(feeCents);
  if (net < 0n || net > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid net pool');
  const winners = entries.filter(e => e.completed);
  if (!winners.length) return { credits: [], unsettledCents: Number(net) };
  const weight = winners.reduce((n, e) => n + BigInt(e.cents), 0n);
  const rows = winners.map(e => ({ id: e.id, cents: net * BigInt(e.cents) / weight, remainder: net * BigInt(e.cents) % weight }));
  rows.sort((a,b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1);
  let left = net - rows.reduce((n,e) => n+e.cents,0n);
  for (const row of rows) if (left > 0n) { row.cents++; left--; }
  return { credits: rows.map(e => ({id:e.id,creditCents:Number(e.cents)})), unsettledCents: 0 };
}
