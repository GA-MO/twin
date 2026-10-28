import { weekDays } from "./dates";
export type Sale = { date: string; amount: number };
export function weeklyReport(sales: Sale[], anyDay: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of weekDays(anyDay)) out[day] = sales.filter((s) => s.date === day).reduce((a, s) => a + s.amount, 0);
  return out;
}
