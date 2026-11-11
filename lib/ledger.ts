import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { ACTIONS, type History, isChase, isCorrection, isGoAhead, REPLIES } from "./decisions.ts";
import { redact } from "./transcript.ts";

export const LEDGER_FILE = "ledger.jsonl";
export const VERDICT_DAYS = 7;
const QUOTE_CHARS = 160;
const MIN_RUNS = 10;
const SIGMAS = 2;

const LedgerDecision = z.object({
  at: z.string(),
  action: z.enum(ACTIONS),
  run: z.string().nullable(),
  cause: z.enum(["notification", "schedule"]),
  correctedAt: z.string().nullable().default(null),
  corrected: z.string().nullable(),
});
const LedgerAsk = z.object({ at: z.string(), reply: z.enum(REPLIES), action: z.enum(ACTIONS).nullable(), asked: z.string(), said: z.string() });
const LedgerRun = z.object({ id: z.string(), project: z.string().nullable(), touched: z.boolean(), settled: z.boolean(), discarded: z.boolean() });
const count = z.number().int().min(0);
const Day = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prompts: count,
  goAheads: count,
  corrections: count,
  chases: count,
  asks: count,
  model: z.string().nullable(),
  version: z.string().nullable(),
  decisions: z.array(LedgerDecision),
  recommended: z.array(LedgerAsk),
  runs: z.array(LedgerRun),
});
export type Day = z.infer<typeof Day>;
export type LedgerDecision = z.infer<typeof LedgerDecision>;
export type LedgerAsk = z.infer<typeof LedgerAsk>;
export type LedgerRun = z.infer<typeof LedgerRun>;

export const dateOf = (d: Date) => d.toLocaleDateString("sv-SE");

export function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateOf(d);
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function buildDays(h: History, runs: (LedgerRun & { date: string })[], quotes: boolean): Day[] {
  const quote = (text: string, cut: (clean: string) => string) => (quotes ? cut(redact(text)) : "");
  const days = new Map<string, Day>();
  const seen = new Map<string, { models: string[]; versions: string[] }>();
  const day = (date: string) => {
    const d = days.get(date) ?? { date, prompts: 0, goAheads: 0, corrections: 0, chases: 0, asks: 0, model: null, version: null, decisions: [], recommended: [], runs: [] };
    days.set(date, d);
    return d;
  };
  for (const e of h.exchanges) {
    const d = day(dateOf(e.at));
    d.prompts++;
    if (isGoAhead(e)) d.goAheads++;
    if (isCorrection(e)) d.corrections++;
    if (isChase(e)) d.chases++;
  }
  for (const a of h.asks) {
    const d = day(dateOf(a.at));
    d.asks++;
    if (a.recommended) d.recommended.push({ at: a.at.toISOString(), reply: a.reply, action: a.action, asked: quote(a.asked, (s) => s.slice(-QUOTE_CHARS)), said: quote(a.said, (s) => s.slice(0, QUOTE_CHARS)) });
  }
  for (const x of h.decisions)
    day(dateOf(x.at)).decisions.push({
      at: x.at.toISOString(),
      action: x.action,
      run: x.run,
      cause: x.cause,
      correctedAt: x.corrected?.at.toISOString() ?? null,
      corrected: x.corrected ? quote(x.corrected.said, (s) => s.slice(0, QUOTE_CHARS)) : null,
    });
  for (const { date, ...r } of runs) day(date).runs.push(r);
  for (const s of h.seen) {
    const at = dateOf(s.at);
    const entry = seen.get(at) ?? { models: [], versions: [] };
    seen.set(at, entry);
    if (s.model) entry.models.push(s.model);
    if (s.version) entry.versions.push(s.version);
  }
  for (const [date, s] of seen) Object.assign(day(date), { model: mostCommon(s.models), version: mostCommon(s.versions) });
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeDays(stored: Day[], fresh: Day[], horizon: Date, excluded: Set<string>): Day[] {
  const days = new Map(stored.map((d) => [d.date, { ...d, runs: d.runs.filter((r) => !excluded.has(r.id)) }]));
  const lost = horizon.toISOString();
  const lostDate = dateOf(horizon);
  for (const f of fresh) {
    const s = days.get(f.date);
    if (!s) {
      days.set(f.date, f);
      continue;
    }
    const decided = new Set(f.decisions.map((d) => `${d.at} ${d.action} ${d.run}`));
    const asked = new Set(f.recommended.map((a) => a.at));
    const most = (pick: (d: Day) => number) => (f.date <= lostDate ? Math.max(pick(s), pick(f)) : pick(f));
    const runs = new Map([...s.runs, ...f.runs].map((r) => [r.id, r]));
    days.set(f.date, {
      date: f.date,
      prompts: most((d) => d.prompts),
      goAheads: most((d) => d.goAheads),
      corrections: most((d) => d.corrections),
      chases: most((d) => d.chases),
      asks: most((d) => d.asks),
      model: f.model ?? s.model,
      version: f.version ?? s.version,
      decisions: [...s.decisions.filter((d) => d.at < lost && !decided.has(`${d.at} ${d.action} ${d.run}`)), ...f.decisions].sort((a, b) => a.at.localeCompare(b.at)),
      recommended: [...s.recommended.filter((a) => a.at < lost && !asked.has(a.at)), ...f.recommended].sort((a, b) => a.at.localeCompare(b.at)),
      runs: [...runs.values()],
    });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const withoutQuotes = (days: Day[]): Day[] =>
  days.map((d) => ({ ...d, decisions: d.decisions.map((x) => ({ ...x, corrected: x.corrected === null ? null : "" })), recommended: d.recommended.map((a) => ({ ...a, asked: "", said: "" })) }));

export function readLedger(path: string): Day[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      const day = (() => {
        try {
          return Day.safeParse(JSON.parse(line));
        } catch {
          return null;
        }
      })();
      if (!day?.success) throw new Error(`${path} บรรทัด ${i + 1} อ่านไม่ได้: แก้หรือลบบรรทัดนั้น (ประวัติของวันนั้นจะหาย) แล้ว sync อีกครั้ง`);
      return day.data;
    });
}

export const serialize = (days: Day[]) =>
  z
    .array(Day)
    .parse(days)
    .map((d) => `${JSON.stringify(d)}\n`)
    .join("");

export type Handed = { runs: number; untouched: number; waiting: number };
export type Totals = { prompts: number; corrections: number; handed: Handed };

export function handed(runs: LedgerRun[]): Handed {
  const counted = runs.filter((r) => r.touched || r.settled);
  return { runs: counted.length, untouched: counted.filter((r) => !r.touched).length, waiting: runs.length - counted.length };
}

const totals = (days: Day[]): Totals => ({
  prompts: days.reduce((n, d) => n + d.prompts, 0),
  corrections: days.reduce((n, d) => n + d.corrections, 0),
  handed: handed(days.flatMap((d) => d.runs)),
});

export type Verdict = { kind: "early"; daysLeft: number } | { kind: "judged"; word: "better" | "worse" | "unclear" | "thin"; before: Totals; after: Totals };

export function verdict(days: Day[], date: string, today: string): Verdict {
  const end = shift(date, VERDICT_DAYS);
  if (today <= end) {
    let daysLeft = 1;
    while (shift(today, daysLeft) <= end) daysLeft++;
    return { kind: "early", daysLeft };
  }
  const window = (from: string, to: string) => totals(days.filter((d) => d.date >= from && d.date <= to));
  const before = window(shift(date, -VERDICT_DAYS), shift(date, -1));
  const after = window(shift(date, 1), end);
  const [b, a] = [before.handed, after.handed];
  if (b.runs < MIN_RUNS || a.runs < MIN_RUNS) return { kind: "judged", word: "thin", before, after };
  const pooled = (b.untouched + a.untouched) / (b.runs + a.runs);
  const error = Math.sqrt(pooled * (1 - pooled) * (1 / b.runs + 1 / a.runs));
  const sigmas = error === 0 ? 0 : (a.untouched / a.runs - b.untouched / b.runs) / error;
  return { kind: "judged", word: sigmas >= SIGMAS ? "better" : sigmas <= -SIGMAS ? "worse" : "unclear", before, after };
}

export function modelChanges(days: Day[]): { date: string; model: string }[] {
  const used = days.flatMap((d) => (d.model ? [{ date: d.date, model: d.model }] : []));
  return used.filter((d, i) => i > 0 && used[i - 1]!.model !== d.model);
}
