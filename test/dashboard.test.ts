import { expect, test } from "bun:test";
import { Dashboard, dashboard, serializeDashboard } from "../lib/dashboard.ts";
import { type Day, handed, type LedgerRun, shift } from "../lib/ledger.ts";

const NOW = new Date("2026-11-21T15:00:00");
const TODAY = "2026-11-21";

const day = (date: string, runs: LedgerRun[] = [], extra: Partial<Day> = {}): Day => ({ date, prompts: 0, goAheads: 0, corrections: 0, chases: 0, asks: 0, model: null, version: null, decisions: [], recommended: [], runs, ...extra });
const run = (id: string, project: string | null, touch: LedgerRun["touch"] = "none", settled = true): LedgerRun => ({ id, project, touch, settled, dropped: false });
const week = (runs: LedgerRun[]) => ({ handed: handed(runs), sent: runs.length, prompts: 9, corrections: 2 });

test("the trend is eight 7-day weeks ending today, oldest first, each counted by the same rule as the main number", () => {
  const days = [day(TODAY, [run("a", "x"), run("b", "x", "fix"), run("c", "x", "none", false)]), day(shift(TODAY, -6), [run("d", "x")]), day(shift(TODAY, -7), [run("e", "x", "more")]), day(shift(TODAY, -55), [run("f", "x")]), day(shift(TODAY, -56), [run("g", "x")])];
  const d = dashboard({ name: "nok", now: NOW, week: week([]), prev: null, days });
  expect(d.trend.map((t) => [t.from, t.to])).toEqual(Array.from({ length: 8 }, (_, i) => [shift(TODAY, -7 * (7 - i) - 6), shift(TODAY, -7 * (7 - i))]));
  expect(d.trend.at(-1)).toEqual({ from: shift(TODAY, -6), to: TODAY, runs: 3, untouched: 2 });
  expect(d.trend.at(-2)).toMatchObject({ runs: 1, untouched: 0 });
  expect(d.trend[0]).toMatchObject({ from: shift(TODAY, -55), runs: 1, untouched: 1 });
});

test("projects with three counted runs or more in 30 days come worst share first, a tie broken by more runs", () => {
  const many = (p: string | null, untouched: number, total: number, at = TODAY) => Array.from({ length: total }, (_, i) => run(`${p}-${at}-${i}`, p, i < untouched ? "none" : "fix"));
  const days = [day(TODAY, [...many("good", 3, 3), ...many("bad", 0, 3), ...many("half", 2, 4), ...many("halfBig", 3, 6), ...many("tiny", 0, 2), ...many(null, 1, 3)]), day(shift(TODAY, -31), many("old", 0, 5, "old"))];
  const d = dashboard({ name: "nok", now: NOW, week: week([]), prev: null, days });
  expect(d.projects.map((p) => p.project)).toEqual(["bad", null, "halfBig", "half", "good"]);
  expect(d.projects[0]).toEqual({ project: "bad", runs: 3, untouched: 0, fixed: 3 });
});

test("the headline is the audit's own week, with last week only when it has data, and the shape passes its schema", () => {
  const runs = [run("a", "x"), run("b", "x", "more"), run("c", "x", "none", false)];
  const d = dashboard({ name: "nok", now: NOW, week: week(runs), prev: { ...week([run("z", "x")]), corrections: 5 }, days: [day(TODAY, runs)] });
  expect(d.week).toEqual({ handed: handed(runs), prev: handed([run("z", "x")]), sent: 3, prompts: 9, corrections: 2, prevCorrections: 5 });
  expect(dashboard({ name: "nok", now: NOW, week: week(runs), prev: null, days: [] }).week).toMatchObject({ prev: null, prevCorrections: null });
  expect(Dashboard.parse(JSON.parse(serializeDashboard(d)))).toEqual(d);
});

test("decisions count this week, last week and each action, corrections are counted once per run over 30 days, and followed leaves out replies that were neither", () => {
  const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
  const decision = (hoursAgo: number, action: "answer" | "close", run: string, corrected: string | null = null) => ({ at: at(hoursAgo), action, run, cause: "notification" as const, correctedAt: corrected ? at(1) : null, corrected });
  const ask = (reply: "agreed" | "objected" | "other") => ({ at: at(3), reply, action: null, asked: "", said: "" });
  const days = [
    day(TODAY, [], { decisions: [decision(2, "answer", "r1", "no"), decision(3, "answer", "r1", "no"), decision(4, "close", "r2")], recommended: [ask("agreed"), ask("agreed"), ask("objected"), ask("other")] }),
    day(shift(TODAY, -10), [], { decisions: [decision(240, "close", "r3")] }),
  ];
  const d = dashboard({ name: "nok", now: NOW, week: week([]), prev: null, days });
  expect(d.decisions).toEqual({ week: 3, prev: 1, byAction: { answer: 2, approve: 0, close: 1, dispatch: 0 }, made30: 4, corrected30: 1 });
  expect(d.followed).toEqual({ agreed: 2, judged: 3 });
});
