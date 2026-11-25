import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { covers, describe, ownerMessages, repeats, skillUses, unused, type Group, type Proposal } from "../collectors/patterns.ts";
import { decline, readDeclined } from "../lib/patterns.ts";
import type { Skill } from "../lib/skills.ts";

const NOW = new Date("2026-11-25T12:00:00Z");
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
const line = (text: string, daysAgo = 1, extra: Record<string, unknown> = {}) => JSON.stringify({ at: at(daysAgo), source: "claude-code", where: "gamo", text, ...extra });

let dir = "";
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

test("only the owner's own recent task messages are kept: no commits, acks, slash commands, system text, old, future or broken lines", () => {
  const kept = ownerMessages(
    [
      line("อัดวิดีโอทดสอบหน้า checkout ให้หน่อย"),
      line("commit: fix the build please", 1, { source: "git" }),
      line("ทำ"),
      line("ลุยตามนี้เลย"),
      line("/twin brief please now"),
      line("<scheduled-task name=x> run the thing"),
      line("อัดวิดีโอทดสอบหน้า cart ด้วยนะ", 31),
      line("อัดวิดีโอทดสอบหน้า login ด้วยนะ", -3),
      JSON.stringify({ at: "not a date", source: "claude-code", where: "gamo", text: "อัดวิดีโอทดสอบหน้า login" }),
      JSON.stringify({ source: "claude-code", text: "missing fields here" }),
      "{broken",
      "",
      line(`  เขียน   README\nให้ตรงกับงาน ${"ยาว".repeat(200)}`),
    ],
    NOW,
  );
  expect(kept.map((m) => m.id)).toEqual(["m0", "m1"]);
  expect(kept[0]!.text).toBe("อัดวิดีโอทดสอบหน้า checkout ให้หน่อย");
  expect(kept[1]!.text.startsWith("เขียน README ให้ตรงกับงาน")).toBe(true);
  expect(kept[1]!.text.length).toBe(300);
});

const msgs = (texts: [string, number, string?][]) => ownerMessages(texts.map(([t, d, w]) => line(t, d, w ? { where: w } : {})), NOW);
const group = (over: Partial<Group>): Group => ({ title: "อัดวิดีโอทดสอบ", kind: "skill", project: null, ids: [], example: "m0", steps: "1) เปิดหน้า 2) อัด", why: "ทำบ่อย", ...over });

test("a group counts only real message ids once, and needs 3 messages on 2 different days", () => {
  const m = msgs([["อัดวิดีโอทดสอบหน้า checkout", 1], ["อัดวิดีโอทดสอบหน้า cart อีกที", 1], ["อัดวิดีโอทดสอบหน้า login ด้วย", 2], ["อัดวิดีโอทดสอบหน้า home ด้วย", 1]]);
  expect(repeats([group({ ids: ["m0", "m1", "m2", "m2", "m99"] })], m, new Set())).toMatchObject([{ count: 3, days: 2, example: "อัดวิดีโอทดสอบหน้า checkout" }]);
  expect(repeats([group({ ids: ["m0", "m1", "m3"] })], m, new Set())).toEqual([]);
  expect(repeats([group({ ids: ["m0", "m2", "m99", "m98"] })], m, new Set())).toEqual([]);
  expect(repeats([group({ ids: [] })], m, new Set())).toEqual([]);
});

test("an example outside the group falls back to its longest message, and a project must be a real one", () => {
  const m = msgs([["อัดวิดีโอทดสอบหน้า checkout", 1], ["อัดวิดีโอทดสอบหน้า cart ของ sol-new-web ให้หน่อยนะ", 2], ["อัดวิดีโอทดสอบหน้า login", 3]]);
  const [r] = repeats([group({ ids: ["m0", "m1", "m2"], example: "m77", project: "sol-new-web" })], m, new Set(["sol-new-web"]));
  expect(r).toMatchObject({ example: "อัดวิดีโอทดสอบหน้า cart ของ sol-new-web ให้หน่อยนะ", project: "sol-new-web" });
  expect(repeats([group({ ids: ["m0", "m1", "m2"], project: "made-up" })], m, new Set(["sol-new-web"]))[0]!.project).toBeNull();
});

test("a repeat counts as covered only by a named skill that is not a plugin or the dispatch router", () => {
  expect(covers("test-video")).toBe(true);
  expect(covers(null)).toBe(false);
  expect(covers("pstack:how")).toBe(false);
  expect(covers("dispatch")).toBe(false);
});

test("each proposal reads as one question for the owner", () => {
  const base = { title: "อัดวิดีโอทดสอบ", count: 4, days: 3, project: null, quotes: [], example: "", steps: "", why: "", fired: null };
  const ps: Proposal[] = [
    { kind: "new", key: "new:a", as: "skill", ...base },
    { kind: "new", key: "new:b", as: "command", ...base, project: "geno" },
    { kind: "merge", key: "merge:a+b", a: "computer", b: "mac", score: 0.56 },
    { kind: "unused", key: "unused:x", skill: "meeting", file: "x" },
  ];
  expect(ps.map(describe)).toEqual([
    'งาน "อัดวิดีโอทดสอบ" สั่งซ้ำ 4 ครั้งใน 3 วัน ยังไม่มี skill รับ: ทำเป็น skill ไหม',
    'งาน "อัดวิดีโอทดสอบ" สั่งซ้ำ 4 ครั้งใน 3 วัน (geno) ยังไม่มี skill รับ: ทำเป็นคำสั่งไหม',
    "skill computer กับ mac description ทับกัน 56%: รวมเป็นตัวเดียวไหม",
    "skill meeting ไม่ถูกเรียกเลยใน 30 วัน: ลบหรือรวมกับตัวอื่นไหม",
  ]);
});

test("skill uses come from Skill tool calls and slash commands in recent transcripts only", () => {
  dir = mkdtempSync(join(tmpdir(), "twin-patterns-"));
  mkdirSync(join(dir, "proj"));
  writeFileSync(
    join(dir, "proj/a.jsonl"),
    [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "invoice" } }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "pstack:how" } }] } }),
      JSON.stringify({ type: "user", message: { content: "<command-name>/meeting</command-name>" } }),
      "{broken",
    ].join("\n"),
  );
  writeFileSync(join(dir, "proj/old.jsonl"), JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "idea" } }] } }));
  const old = (NOW.getTime() - 40 * 86_400_000) / 1000;
  utimesSync(join(dir, "proj/old.jsonl"), old, old);
  writeFileSync(join(dir, "stray.jsonl"), "x");
  const uses = skillUses(dir, NOW.getTime() - 30 * 86_400_000);
  expect(Object.fromEntries(uses)).toEqual({ invoice: 1, "pstack:how": 1, meeting: 1 });
  expect(skillUses(join(dir, "missing"), 0).size).toBe(0);
});

test("a skill is unused only when the model can invoke it, it is not the mode, nothing used it, and it is older than the window", () => {
  dir = mkdtempSync(join(tmpdir(), "twin-patterns-"));
  const file = join(dir, "SKILL.md");
  writeFileSync(file, "x");
  const s = (name: string, over: Partial<Skill> = {}): Skill => ({ file, folder: name, source: "engine", name, description: "d", invocable: true, yaml: true, body: "", ...over });
  const later = Date.now() + 60_000;
  const skills = [s("idle"), s("used"), s("quiet", { invocable: false }), s("nok-mode", { source: "mode" })];
  expect(unused(skills, new Map([["used", 2]]), later).map((x) => x.name)).toEqual(["idle"]);
  expect(unused(skills, new Map(), 0)).toEqual([]);
});

test("declining a proposal by its number stores it once, and a bad number says what to type", () => {
  dir = mkdtempSync(join(tmpdir(), "twin-patterns-"));
  expect(() => decline("1", NOW, dir)).toThrow("ยังไม่มีข้อเสนอ");
  writeFileSync(join(dir, "proposals.json"), JSON.stringify([{ key: "new:a", kind: "new", title: "งาน A" }, { key: "merge:b", kind: "merge", title: "รวม B" }]));
  for (const bad of [undefined, "", "0", "3", "-1", "1.5", "abc", "1e1", " 1"]) expect(() => decline(bad, NOW, dir)).toThrow("patterns no <1-2>");
  expect(decline("2", NOW, dir)).toBe("จะไม่เสนออีก: รวม B");
  expect(decline("2", NOW, dir)).toBe("ข้อ 2 ไม่เอาไว้แล้ว: รวม B");
  expect(readDeclined(dir)).toEqual([{ key: "merge:b", title: "รวม B", at: NOW.toISOString() }]);
  writeFileSync(join(dir, "declined.json"), "{broken");
  expect(readDeclined(dir)).toEqual([]);
});
