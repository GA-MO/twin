import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stepLines, stepName, summarize } from "../lib/steps.ts";
import { sandbox, type Sandbox } from "./harness.ts";

let root = "";
let s: Sandbox;

const W = { since: new Date("2026-11-21"), title: "steps", before: 0, keptSince: new Date("2026-11-01") };

const task = (id: number, subject: string, status: string, description = "") => ({ id: String(id), subject, status, description, blocks: [], blockedBy: [] });

function session(name: string, tasks: object[]) {
  mkdirSync(join(root, name), { recursive: true });
  tasks.forEach((t, i) => writeFileSync(join(root, name, `${i + 1}.json`), JSON.stringify(t)));
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "twin-steps-"));
  session("a", [
    task(1, "1. `how` over the affected subsystem.", "completed"),
    task(2, "2. `architect` for parallel design exploration.", "completed", "skip: Size (one agent)"),
    task(3, "deslop before last commit", "completed"),
    task(4, "no-comments before review", "completed", "skip: no comments added"),
  ]);
  session("b", [
    task(1, "1. `how` over the affected subsystem.", "completed"),
    task(2, "2. `architect` for parallel design exploration.", "completed", "Skip: design settled"),
    task(3, "deslop before last commit", "pending"),
  ]);
  mkdirSync(join(root, "broken"));
  writeFileSync(join(root, "broken", "1.json"), "{not json");
  s = sandbox("twin-steps-cmd-");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  s.remove();
});

test("the summary counts listed runs, finishes of deslop and no-comments, and the steps skipped most with their reasons", () => {
  const text = stepLines(summarize([{ session: "a", checkTurns: 0 }, { session: "b", checkTurns: 1 }, { session: "none", checkTurns: 1 }, { session: "broken", checkTurns: 0 }], root), W).join("\n");
  expect(text).toContain("task list: 2/4 (50%)");
  expect(text).toContain("deslop: ทำ 1 · ข้ามพร้อมเหตุผล 0 · ค้าง 1 · ไม่มีในลิสต์ 0");
  expect(text).toContain("no-comments: ทำ 0 · ข้ามพร้อมเหตุผล 1 · ค้าง 0 · ไม่มีในลิสต์ 1");
  expect(text).toContain("check turn เพราะ task ค้างหรือไม่มี task list: 2");
  expect(text).toContain("architect for parallel design exploration: 2/2 · Size (one agent) | design settled");
  expect(text).not.toContain("how over");
});

test("no runs in the window says so instead of showing zeros", () => {
  expect(stepLines(summarize([], root), W).join("\n")).toContain("ยังไม่มีงานของ worker");
});

test("runs sent before the task-list rule, and a window older than what Claude keeps, are named instead of read as zero", () => {
  const text = stepLines(summarize([], root), { ...W, since: new Date("2026-10-01"), before: 39 }).join("\n");
  expect(text).toContain("ไม่นับ 39 งานที่ส่งก่อนมีกฎ task list");
  expect(text).toContain("Claude ลบ task list ที่เก่ากว่า 2026-11-01");
});

test("a step name drops its number and markup and keeps dotted words, and a bare number is no name", () => {
  expect(stepName("1. `how` over the affected subsystem.")).toBe("how over the affected subsystem");
  expect(stepName("4. Verify on the matching surface (e.g. lib/foo.ts v1.2)")).toBe("Verify on the matching surface");
  expect(stepName("2. Plan the fix: architect first")).toBe("Plan the fix");
  expect(stepName("1.")).toBe("");
});

test("audit steps refuses a date that is not real, in the future, or an unknown argument, and names what it got", () => {
  for (const [args, said] of [
    [["--since", "2026-02-30"], "2026-02-30"],
    [["--since", "21/11/2026"], "21/11/2026"],
    [["--since"], 'ได้ ""'],
    [["--since", "2999-01-01"], "ยังไม่ถึง"],
    [["--since", "2026-11-01", "extra"], "ไม่รู้จัก extra"],
  ] as const) {
    const r = s.twin(["audit", "steps", ...args]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(said);
  }
  const ok = s.twin(["audit", "steps", "--since", "2026-11-01"]);
  expect(ok.code).toBe(0);
  expect(ok.out).toContain("ขั้นของ playbook (worker ตั้งแต่ 2026-11-01)");
});
