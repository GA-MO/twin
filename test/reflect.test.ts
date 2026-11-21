import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_ID, sandbox } from "./harness.ts";

const sb = sandbox("twin-reflect-");
afterAll(() => sb.remove());

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const date = (days: number) => ago(days).slice(0, 10);

const miss = (key: string, days: number, said: string, project: string | null = "shop") => ({ key, kind: project ? "sent-back" : "correction", at: ago(days), project, said, context: "brief" });

function fakeClaude(answer: unknown) {
  const calls = join(sb.work, "claude-calls.log");
  writeFileSync(join(sb.bin, "claude"), `#!/bin/sh\ncat > ${JSON.stringify(join(sb.work, "prompt.txt"))}\necho call >> ${JSON.stringify(calls)}\nprintf '%s' '${JSON.stringify({ is_error: false, structured_output: answer })}'\n`, { mode: 0o755 });
  return () => (existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").length : 0);
}

test("a rule changed before reflect has misses from the 14 days ahead of the change is not called still broken", () => {
  sb.write("state/reflect/tags.jsonl", "");
  sb.write("state/reflect/proposals.json", "{}");
  sb.write("state/audit/misses.json", JSON.stringify([miss("e/turn-2", 5, "ปุ่มยังเพี้ยน"), miss("f/turn-2", 3, "ยังไม่เปิดดู")]));
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: true }, collectors: {}, radar: null, onboarded: null }));
  sb.write("profile/rules.json", JSON.stringify({ rules: [{ id: "check-ui", layer: "decisions", rule: "r", why: "w", source: "s", status: "stated", confirmed: date(15) }] }));
  fakeClaude({ tags: [{ key: "e/turn-2", rule: "check-ui", cause: "c", agentFault: true }, { key: "f/turn-2", rule: "check-ui", cause: "c", agentFault: true }], proposals: [] });
  expect(sb.twin(["sync", "reflect"]).err).toBe("");
  const index = readFileSync(join(sb.repo, "state/reflect/index.md"), "utf8");
  expect(index).toContain("## rule ที่แก้แล้วยังพลาด\n- ไม่มี");
  expect(index).toContain("- check-ui: 2");
  rmSync(join(sb.repo, "state/reflect"), { recursive: true });
  rmSync(join(sb.work, "claude-calls.log"), { force: true });
});

test("reflect tags each miss with the rule it broke, drafts a change only for a cause shared by two or more of the agent's own misses, never calls the model again without a new miss, and names a rule still broken after it was changed", () => {
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: true }, collectors: {}, radar: null, onboarded: null }));
  sb.write(
    "profile/rules.json",
    JSON.stringify({ rules: [{ id: "check-ui", layer: "decisions", rule: "ตรวจ UI บนหน้าจริงก่อนส่ง", why: "w", source: "s", status: "stated", confirmed: date(15) }] }),
  );
  sb.write(
    "state/audit/misses.json",
    JSON.stringify([miss("a/turn-2", 10, "ปุ่มยังเพี้ยน"), miss("b/turn-3", 4, "ไม่ได้เปิดดูเลยเหรอ"), miss("c/turn-2", 3, "เปลี่ยนใจ ขอสีเขียว"), miss("correction/x", 2, "เดาอีกแล้ว", null), miss("skipped/turn-2", 1, "ลืมอีกแล้ว"), { key: "broken" }]),
  );
  sb.write("state/reflect/tags.jsonl", JSON.stringify({ key: "old/turn-2", at: ago(40), project: "shop", rule: null, cause: "old", agentFault: false }) + "\n");
  const calls = fakeClaude({
    tags: [
      { key: "a/turn-2", rule: "check-ui", cause: "ui-not-checked", agentFault: true },
      { key: "b/turn-3", rule: "check-ui", cause: "ui-not-checked", agentFault: true },
      { key: "c/turn-2", rule: null, cause: "taste", agentFault: false },
      { key: "correction/x", rule: "made-up-rule", cause: "guessed", agentFault: true },
      { key: "correction/x", rule: null, cause: "guessed-again", agentFault: true },
      { key: "not-a-miss", rule: null, cause: "x", agentFault: true },
    ],
    proposals: [
      { title: "ส่ง UI โดยไม่เปิดดู", keys: ["a/turn-2", "b/turn-3", "b/turn-3"], rule: "check-ui", route: "contract", change: "บังคับภาพหน้าจริงในรายงาน" },
      { title: "เดา", keys: ["correction/x"], rule: null, route: "rule", change: "ห้ามเดา" },
      { title: "สีไม่ถูกใจ", keys: ["c/turn-2", "a/turn-2"], rule: null, route: "mode", change: "ชอบสีเขียว" },
    ],
  });

  expect(sb.twin(["sync", "reflect"]).err).toBe("");
  expect(calls()).toBe(1);
  expect(readFileSync(join(sb.work, "prompt.txt"), "utf8")).toContain("- check-ui: ตรวจ UI บนหน้าจริงก่อนส่ง");
  const index = readFileSync(join(sb.repo, "state/reflect/index.md"), "utf8");
  expect(index).toContain("14 วัน: พลาด 5 ครั้ง (ส่งกลับแก้ 4 · ตำหนิในแชท 1) · nok ผิดเอง 3");
  expect(index).toContain("### ส่ง UI โดยไม่เปิดดู\n- 2 ครั้ง · แก้ที่ worker contract · rule check-ui\n- เสนอ: บังคับภาพหน้าจริงในรายงาน");
  expect(index).not.toContain("### เดา");
  expect(index).not.toContain("### สีไม่ถูกใจ");
  expect(index).toContain("- check-ui (แก้หรือยืนยันล่าสุด " + date(15) + "): 14 วันก่อน 0 · 14 วันหลัง 2 · เขียนใหม่หรือถอด");
  expect(index).toContain("- (ไม่มี rule) guessed-again: 1");
  const tags = readFileSync(join(sb.repo, "state/reflect/tags.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(tags.map((t) => t.key)).toEqual(["old/turn-2", "a/turn-2", "b/turn-3", "c/turn-2", "correction/x", "skipped/turn-2"]);
  expect(tags.find((t) => t.key === "correction/x").rule).toBeNull();
  expect(tags.find((t) => t.key === "skipped/turn-2")).toMatchObject({ cause: "untagged", agentFault: false });

  const todo = sb.twin(["todo"]).out;
  expect(todo).toContain("nok เจอเรื่องที่พลาดซ้ำ 1 เรื่อง ร่างวิธีแก้ไว้แล้ว: ส่ง UI โดยไม่เปิดดู (state/reflect/)");
  expect(todo).toContain(`rule check-ui แก้หรือยืนยันล่าสุด ${date(15)} แล้วยังพลาด 2 ครั้ง (ก่อนแก้ 0)`);

  expect(sb.twin(["sync", "reflect"]).err).toBe("");
  expect(calls()).toBe(1);
  expect(readFileSync(join(sb.repo, "state/reflect/index.md"), "utf8")).toContain("(ไม่มีครั้งใหม่ ใช้ผลรอบก่อน)");
  expect(readFileSync(join(sb.repo, "state/reflect/index.md"), "utf8")).toContain("### ส่ง UI โดยไม่เปิดดู");

  sb.git(sb.repo, "init", "-q");
  Bun.spawnSync(["git", "-C", sb.repo, "commit", "-q", "--allow-empty", "-m", "improve: check UI on the real page"], { env: { ...process.env, ...GIT_ID, HOME: sb.home, GIT_COMMITTER_DATE: new Date(Date.now() + 2000).toISOString() } });
  expect(sb.twin(["sync", "reflect"]).err).toBe("");
  expect(calls()).toBe(1);
  expect(readFileSync(join(sb.repo, "state/reflect/index.md"), "utf8")).not.toContain("### ส่ง UI โดยไม่เปิดดู");
  expect(sb.twin(["todo"]).out).not.toContain("เจอเรื่องที่พลาดซ้ำ");

  sb.write("state/audit/misses.json", JSON.stringify([miss("a/turn-2", 10, "ปุ่มยังเพี้ยน"), miss("d/turn-2", 1, "ยังไม่ได้เปิดดูอีก")]));
  expect(sb.twin(["sync", "reflect"]).err).toBe("");
  expect(calls()).toBe(2);
  expect(readFileSync(join(sb.work, "prompt.txt"), "utf8")).toContain("earlier tag: rule check-ui, cause ui-not-checked");
  const kept = readFileSync(join(sb.repo, "state/reflect/tags.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).key);
  expect(kept).toEqual(["old/turn-2", "a/turn-2", "d/turn-2"]);
});
