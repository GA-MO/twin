import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const TASK_OPEN = "task ยังค้าง";
export const TASK_NONE = "ไม่มี task list";
export const PLAYBOOK_NAMED = "playbook for it.";
export const TASK_RULE = "one TaskCreate item per playbook step";

const TaskFile = z.object({ id: z.string(), subject: z.string(), status: z.string(), description: z.string().default("") });
export type Task = z.infer<typeof TaskFile>;

export function readTasks(tasksRoot: string, session: string): Task[] {
  const dir = join(tasksRoot, session);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        const t = TaskFile.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
        return t.success ? [t.data] : [];
      } catch {
        return [];
      }
    });
}

export type StepRun = { session: string; checkTurns: number };
export type StepWindow = { since: Date; title: string; before: number; keptSince: Date };
type Tally = { seen: number; skipped: number; reasons: string[] };
type Finish = { done: number; skipped: number; open: number; missing: number };
export type StepSummary = { runs: number; listed: number; checkTurns: number; steps: Map<string, Tally>; deslop: Finish; noComments: Finish };

const SKIP = /^\s*skip(ped)?\b[:\s]*/i;
const NUMBERED = /^\s*\d+\./;
export const stepName = (subject: string) => subject.replace(NUMBERED, "").replace(/[*`]/g, "").split(/\.(?:\s|$)|:\s|\s\(/)[0]!.trim().slice(0, 60);
const finish = (): Finish => ({ done: 0, skipped: 0, open: 0, missing: 0 });

function tally(f: Finish, tasks: Task[], match: RegExp) {
  const t = tasks.find((x) => !NUMBERED.test(x.subject) && match.test(x.subject));
  if (!t) f.missing++;
  else if (t.status !== "completed") f.open++;
  else if (SKIP.test(t.description)) f.skipped++;
  else f.done++;
}

export function summarize(runs: StepRun[], tasksRoot: string): StepSummary {
  const s: StepSummary = { runs: runs.length, listed: 0, checkTurns: 0, steps: new Map(), deslop: finish(), noComments: finish() };
  for (const run of runs) {
    s.checkTurns += run.checkTurns;
    const tasks = readTasks(tasksRoot, run.session);
    if (!tasks.length) continue;
    s.listed++;
    tally(s.deslop, tasks, /deslop/i);
    tally(s.noComments, tasks, /no[\s-]?comments/i);
    for (const t of tasks.filter((x) => NUMBERED.test(x.subject))) {
      const name = stepName(t.subject);
      if (!name) continue;
      const row = s.steps.get(name) ?? { seen: 0, skipped: 0, reasons: [] };
      row.seen++;
      if (t.status === "completed" && SKIP.test(t.description)) {
        row.skipped++;
        const why = t.description.replace(SKIP, "").trim().slice(0, 50);
        if (why && !row.reasons.includes(why)) row.reasons.push(why);
      }
      s.steps.set(name, row);
    }
  }
  return s;
}

const pct = (n: number, of: number) => (of ? `${n}/${of} (${Math.round((100 * n) / of)}%)` : "-");
const finishLine = (label: string, f: Finish) => `- ${label}: ทำ ${f.done} · ข้ามพร้อมเหตุผล ${f.skipped} · ค้าง ${f.open} · ไม่มีในลิสต์ ${f.missing}`;

export function stepLines(s: StepSummary, w: StepWindow, top = 5): string[] {
  const notes = [
    ...(w.before ? [`- ไม่นับ ${w.before} งานที่ส่งก่อนมีกฎ task list`] : []),
    ...(w.since < w.keptSince ? [`- Claude ลบ task list ที่เก่ากว่า ${w.keptSince.toLocaleDateString("sv-SE")} แล้ว ช่วงก่อนนั้นจะนับว่าไม่มี task list`] : []),
  ];
  if (!s.runs) return [`## ${w.title}`, "- ยังไม่มีงานของ worker ที่ใช้กฎ task list ในช่วงนี้", ...notes, ""];
  const skipped = [...s.steps.entries()].filter(([, r]) => r.skipped).sort((a, b) => b[1].skipped - a[1].skipped || b[1].seen - a[1].seen).slice(0, top);
  return [
    `## ${w.title}`,
    `- worker ที่ลงขั้นของ playbook ใน task list: ${pct(s.listed, s.runs)}`,
    finishLine("deslop", s.deslop),
    finishLine("no-comments", s.noComments),
    `- check turn เพราะ task ค้างหรือไม่มี task list: ${s.checkTurns}`,
    ...notes,
    ...(skipped.length ? ["- ขั้นที่ข้ามบ่อย (ข้าม/เจอ):", ...skipped.map(([name, r]) => `  - ${name}: ${r.skipped}/${r.seen}${r.reasons.length ? ` · ${r.reasons.slice(0, 2).join(" | ")}` : ""}`)] : []),
    "",
  ];
}
