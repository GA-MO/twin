import { z } from "zod";
import { type Action, ACTIONS } from "./decisions.ts";
import { type Day, dateOf, followed, type Handed, handed, type LedgerDecision, overruled, projects, shift, TRUST_DAYS, WINDOW_DAYS } from "./ledger.ts";

export const DASHBOARD_FILE = "dashboard.json";
export const TREND_WEEKS = 8;
const DAY = 86_400_000;

const count = z.number().int().min(0);
const Rate = z.object({ runs: count, untouched: count, fixed: count, more: count, dropped: count, waiting: count });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Dashboard = z.object({
  name: z.string(),
  asOf: z.iso.datetime(),
  week: z.object({ handed: Rate, prev: Rate.nullable(), sent: count, prompts: count, corrections: count, prevCorrections: count.nullable() }),
  trend: z.array(z.object({ from: date, to: date, runs: count, untouched: count })).length(TREND_WEEKS),
  decisions: z.object({ week: count, prev: count, byAction: z.record(z.enum(ACTIONS), count), made30: count, corrected30: count }),
  followed: z.object({ agreed: count, judged: count }),
  projects: z.array(z.object({ project: z.string().nullable(), runs: count, untouched: count, fixed: count })),
});
export type Dashboard = z.infer<typeof Dashboard>;

export type Week = { handed: Handed; sent: number; prompts: number; corrections: number };

export function decidedIn(days: Day[], since: Date, before: Date): { week: LedgerDecision[]; prev: LedgerDecision[] } {
  const decisions = days.flatMap((d) => d.decisions);
  return { week: decisions.filter((d) => new Date(d.at) >= since), prev: decisions.filter((d) => new Date(d.at) >= before && new Date(d.at) < since) };
}

export function dashboard({ name, now, week, prev, days }: { name: string; now: Date; week: Week; prev: Week | null; days: Day[] }): Dashboard {
  const today = dateOf(now);
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const before = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY);
  const trustFrom = shift(today, -TRUST_DAYS);
  const decided = decidedIn(days, since, before);
  const recent = overruled(days, trustFrom);
  const trend = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const to = shift(today, -WINDOW_DAYS * (TREND_WEEKS - 1 - i));
    const from = shift(to, 1 - WINDOW_DAYS);
    const h = handed(days.filter((d) => d.date >= from && d.date <= to).flatMap((d) => d.runs));
    return { from, to, runs: h.runs, untouched: h.untouched };
  });
  return {
    name,
    asOf: now.toISOString(),
    week: { handed: week.handed, prev: prev?.handed ?? null, sent: week.sent, prompts: week.prompts, corrections: week.corrections, prevCorrections: prev?.corrections ?? null },
    trend,
    decisions: {
      week: decided.week.length,
      prev: decided.prev.length,
      byAction: Object.fromEntries(ACTIONS.map((a) => [a, decided.week.filter((d) => d.action === a).length])) as Record<Action, number>,
      made30: recent.reduce((n, r) => n + r.made, 0),
      corrected30: recent.reduce((n, r) => n + r.corrected, 0),
    },
    followed: followed(days.flatMap((d) => d.recommended)),
    projects: projects(days, trustFrom).map((r) => ({ project: r.project, runs: r.handed.runs, untouched: r.handed.untouched, fixed: r.handed.fixed })),
  };
}

export const serializeDashboard = (d: Dashboard) => `${JSON.stringify(Dashboard.parse(d), null, 1)}\n`;
