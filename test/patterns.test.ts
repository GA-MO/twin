import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { covers, describe, ownerMessages, recent, repeats, skillUses, unused, type Group, type Proposal } from "../collectors/patterns.ts";
import { briefOf, decline, memberKey, readDeclined } from "../lib/patterns.ts";
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
      line("เอาตามที่แนะนำครับ"),
      line("ok, go ahead."),
      line("เอาเข้า uat เลย"),
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
  expect(kept.map((m) => m.text.slice(0, 20))).toEqual(["อัดวิดีโอทดสอบหน้า c", "ok, go ahead.", "เอาเข้า uat เลย", "เขียน README ให้ตรงก"]);
  expect(kept.map((m) => m.id)).toEqual(["m0", "m1", "m2", "m3"]);
  expect(kept[3]!.text.length).toBe(300);
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
  const base = { title: "อัดวิดีโอทดสอบ", count: 4, days: 3, project: null, quotes: [], members: [], example: "", steps: "", why: "", fired: null };
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

test("skill uses come from Skill tool calls and slash commands in recent transcripts only", async () => {
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
  const uses = await skillUses(dir, NOW.getTime() - 30 * 86_400_000);
  expect(Object.fromEntries(uses)).toEqual({ invoice: 1, "pstack:how": 1, meeting: 1 });
  expect((await skillUses(join(dir, "missing"), 0)).size).toBe(0);
});

test("only the owner's own skills are offered as unused: never engine skills or the mode, and only when nothing used them and they are older than the window", () => {
  dir = mkdtempSync(join(tmpdir(), "twin-patterns-"));
  const file = join(dir, "SKILL.md");
  writeFileSync(file, "x");
  const s = (name: string, over: Partial<Skill> = {}): Skill => ({ file, folder: name, source: "profile", name, description: "d", invocable: true, yaml: true, body: "", ...over });
  const later = Date.now() + 60_000;
  const skills = [s("idle"), s("used"), s("quiet", { invocable: false }), s("nok-mode", { source: "mode" }), s("onboard", { source: "engine" })];
  expect(unused(skills, new Map([["used", 2]]), later).map((x) => x.name)).toEqual(["idle"]);
  expect(unused(skills, new Map(), 0)).toEqual([]);
});

test("declining by number or key stores it once, drops it from the brief at once, and a bad argument says what to type", () => {
  dir = mkdtempSync(join(tmpdir(), "twin-patterns-"));
  const fragment = join(dir, "fragment.json");
  expect(() => decline("1", NOW, dir, fragment)).toThrow("ยังไม่มีข้อเสนอ");
  const entries = [
    { n: 1, key: "new:a", title: "งาน A", members: ["x1", "x2"] },
    { n: 2, key: "merge:b", title: "รวม B", members: [] },
    { n: 3, key: "new:c", title: "งาน C", members: [] },
    { n: 4, key: "new:d", title: "งาน D", members: [] },
  ];
  writeFileSync(join(dir, "proposals.json"), JSON.stringify(entries));
  const first = briefOf(entries, []);
  writeFileSync(fragment, JSON.stringify({ name: "patterns", status: "ok", body: first.brief, items: first.items }));
  for (const bad of [undefined, "", "0", "5", "-1", "1.5", "abc", "1e1", " 1", "new:zzz"]) expect(() => decline(bad, NOW, dir, fragment)).toThrow("patterns no <เลขข้อ 1-4 หรือ key>");
  expect(decline("2", NOW, dir, fragment)).toBe("จะไม่เสนออีก: รวม B");
  expect(decline("merge:b", NOW, dir, fragment)).toBe("ข้อ 2 ไม่เอาไว้แล้ว: รวม B");
  expect(decline("new:a", NOW, dir, fragment)).toBe("จะไม่เสนออีก: งาน A");
  expect(readDeclined(dir).map((d) => d.key)).toEqual(["merge:b", "new:a"]);
  const f = JSON.parse(readFileSync(fragment, "utf8"));
  expect(f.status).toBe("ok");
  expect(f.body).toBe("- 3. งาน C\n- 4. งาน D");
  expect(f.items.map((i: { key: string }) => i.key)).toEqual(["patterns:new:c", "patterns:new:d"]);
  writeFileSync(join(dir, "declined.json"), "{broken");
  expect(readDeclined(dir)).toEqual([]);
});

test("a regrouped proposal stays declined when most of its messages were in a declined one, whatever its new title", () => {
  const declined = [{ key: "new:old-title", title: "งานเดิม", at: NOW.toISOString(), members: ["a", "b", "c", "d"] }];
  const brief = briefOf(
    [
      { n: 1, key: "new:reworded", title: "ชื่อใหม่ งานเดิม", members: ["a", "b", "e"] },
      { n: 2, key: "new:other", title: "งานอื่น", members: ["a", "x", "y"] },
    ],
    declined,
  );
  expect(brief.brief).toBe("- 2. งานอื่น");
  expect(memberKey("ข้อความ")).toBe(memberKey("ข้อความ"));
  expect(memberKey("ข้อความ")).not.toBe(memberKey("ข้อความอื่น"));
});

test("the prompt keeps the newest messages that fit the budget, in order", () => {
  const ms = ["a".repeat(60), "b".repeat(60), "c".repeat(60)].map((text) => ({ text }));
  expect(recent(ms, 200).map((m) => m.text[0])).toEqual(["b", "c"]);
  expect(recent(ms, 10)).toEqual([]);
  expect(recent([], 100)).toEqual([]);
});
