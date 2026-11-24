import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandbox, STUB_LEDGER, STUB_NO_VERIFIER, withLedger, type Sandbox } from "./harness.ts";

let s: Sandbox;
let project = "";

const REPORT = { outcome: "done", did: "ทำแล้ว", pending: "-", discovered: "-", verified: "-", clicked: [], inputs_tried: [], design: [], removed: [], ideas: [], gates_requested: [] };

const BRIEF = `ชนิด: bug
ขนาด: เล็ก
เป้าหมาย: แปลงระยะเวลาได้
อ้างอิง: docs/parse.md
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: แปลง 1h30m ได้
ลงที่: push branch นี้เท่านั้น
อาการ: 1h30m ได้ 0
คงไว้: รูปแบบผลลัพธ์`;

beforeAll(() => {
  s = sandbox("twin-tasks-");
  const plugin = join(s.home, "plugins/pstack");
  mkdirSync(join(plugin, "skills/poteto-mode"), { recursive: true });
  writeFileSync(join(plugin, "skills/poteto-mode/SKILL.md"), "# Poteto mode\n");
  mkdirSync(join(s.home, ".claude/plugins"), { recursive: true });
  writeFileSync(join(s.home, ".claude/plugins/installed_plugins.json"), JSON.stringify({ plugins: { "pstack@pstack-claude": [{ installPath: plugin }] } }));
  const json = JSON.stringify({ subtype: "success", is_error: false, result: "ok", structured_output: REPORT });
  writeFileSync(
    join(s.bin, "claude"),
    [
      "#!/bin/sh",
      'if [ "$1" = agents ]; then echo "[]"; exit 0; fi',
      STUB_NO_VERIFIER,
      STUB_LEDGER,
      'sid=""; prev=""; for a in "$@"; do [ "$prev" = --session-id ] || [ "$prev" = --resume ] && sid="$a"; prev="$a"; done',
      'n=0; for st in $STUB_TASKS; do n=$((n+1)); mkdir -p "$HOME/.claude/tasks/$sid"; printf \'{"id":"%s","subject":"step %s","status":"%s"}\' $n $n $st > "$HOME/.claude/tasks/$sid/$n.json"; done',
      'mkdir -p docs && date +%s%N > docs/parse.md && git add -A && git -c user.email=t@t -c user.name=t commit -qm stub >/dev/null 2>&1',
      `printf '%s' '${withLedger(json)}'`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  project = join(s.work, "proj");
  mkdirSync(project, { recursive: true });
  s.git(project, "init", "-q", "-b", "main");
  s.git(project, "commit", "-q", "--allow-empty", "-m", "base");
  expect(s.twin(["setup", "gamo", "--no-schedule"]).code).toBe(0);
}, 120_000);

afterAll(() => s.remove());

function run(slug: string, tasks: string) {
  const sent = s.twin(["dispatch", project, slug], BRIEF, { STUB_TASKS: tasks });
  expect(sent.err).toBe("");
  const id = sent.out.match(/ส่งแล้ว (\S+)/)?.[1] ?? "";
  s.twin(["wait", id], "", { STUB_TASKS: tasks });
  return { id, dir: join(s.repo, "runs", id) };
}

test("a done turn with a playbook step still open gets one check turn naming that step", () => {
  const r = run("tasks-open", "completed pending");
  const prompt = readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8");
  expect(prompt).toContain("task ยังค้าง: #2 step 2");
  expect(prompt).not.toContain("step 1");
  expect(existsSync(join(r.dir, "turn-3"))).toBe(false);
  s.twin(["followup", r.id, "แก้ข้อความปุ่ม"], "", { STUB_TASKS: "completed pending" });
  s.twin(["wait", r.id], "", { STUB_TASKS: "completed pending" });
  expect(existsSync(join(r.dir, "turn-3"))).toBe(true);
  expect(existsSync(join(r.dir, "turn-4"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("a done turn with no task list at all is asked to lay out the playbook's steps", () => {
  const r = run("tasks-none", "");
  expect(readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8")).toContain("ไม่มี task list");
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("a done turn whose every step is completed gets no check turn", () => {
  const r = run("tasks-done", "completed completed");
  expect(existsSync(join(r.dir, "turn-2"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);
