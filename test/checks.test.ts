import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandbox, type Sandbox } from "./harness.ts";

let s: Sandbox;
let project = "";

const REPORT = { outcome: "done", did: "ทำแล้ว", pending: "-", discovered: "-", verified: "-", clicked: [], removed: [], ideas: [], gates_requested: [] };

const BRIEF = `ชนิด: bug
ขนาด: เล็ก
เป้าหมาย: แปลงระยะเวลาได้
อ้างอิง: src/parse.ts
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: แปลง 1h30m ได้
ลงที่: push branch นี้เท่านั้น
อาการ: 1h30m ได้ 0
คงไว้: รูปแบบผลลัพธ์`;

beforeAll(() => {
  s = sandbox("twin-checks-");
  const json = JSON.stringify({ subtype: "success", is_error: false, result: "ok", structured_output: REPORT });
  writeFileSync(
    join(s.bin, "claude"),
    [
      "#!/bin/sh",
      'if [ "$1" = agents ]; then echo "[]"; exit 0; fi',
      "cat > /dev/null",
      'for f in $STUB_FILES; do [ -e "$f" ] || { mkdir -p "$(dirname "$f")"; echo "export const x = 1;" > "$f"; }; done',
      'git add -A && git -c user.email=t@t -c user.name=t commit -qm stub >/dev/null 2>&1',
      `printf '%s' '${json.slice(0, -2)},"inputs_tried":'"\${STUB_TRIED:-[]}"'}}'`,
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

function run(slug: string, env: Record<string, string>) {
  const sent = s.twin(["dispatch", project, slug], BRIEF, env);
  expect(sent.err).toBe("");
  const id = sent.out.match(/ส่งแล้ว (\S+)/)?.[1] ?? "";
  const done = s.twin(["wait", id], "", env).out;
  return { id, done, dir: join(s.repo, "runs", id) };
}

test("a done turn that changed code without trying any unlisted input gets one check turn, and only one", () => {
  const r = run("parse-code", { STUB_FILES: "src/parse.ts test/parse.test.ts" });
  expect(r.done).toContain("turn 2");
  const prompt = readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8");
  expect(prompt).toContain("src/parse.ts");
  expect(prompt).not.toContain("test/parse.test.ts");
  expect(prompt).toContain("inputs_tried");
  expect(existsSync(join(r.dir, "turn-2/check"))).toBe(true);
  expect(existsSync(join(r.dir, "turn-3"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("a turn that changed only tests and docs gets no check turn", () => {
  const r = run("parse-tests", { STUB_FILES: "test/parse.test.ts src/parse.spec.ts docs/parse.md types/parse.d.ts" });
  expect(r.done).toContain("turn 1");
  expect(existsSync(join(r.dir, "turn-2"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("a turn that changed code and lists the inputs it tried gets no check turn, and the inputs show in the report", () => {
  const r = run("parse-tried", { STUB_FILES: "src/parse.ts", STUB_TRIED: '[{"input":"empty string","result":"throws: duration is empty"}]' });
  expect(r.done).toContain("turn 1");
  expect(r.done).toContain("ลองแล้ว: empty string → throws: duration is empty");
  expect(existsSync(join(r.dir, "turn-2"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("a UI file changed with no clicks and code changed with no inputs ask for both in one check turn", () => {
  const r = run("parse-both", { STUB_FILES: "src/parse.ts src/Form.tsx" });
  expect(r.done).toContain("turn 2");
  const prompt = readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8");
  expect(prompt).toContain("clicked");
  expect(prompt).toContain("inputs_tried");
  expect(prompt).toContain("src/Form.tsx");
  expect(existsSync(join(r.dir, "turn-3"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);
