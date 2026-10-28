export function startOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return s;
}
export function weekDays(d: Date): string[] {
  const s = startOfWeek(d);
  return Array.from({ length: 6 }, (_, i) => new Date(s.getTime() + i * 86400000).toISOString().slice(0, 10));
}
