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

const UI_BRIEF = `ชนิด: ui-redo
ขนาด: เล็ก
เป้าหมาย: ฟอร์มตรงแบบ
อ้างอิง: src/Form.tsx
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: ฟอร์มตรงแบบที่ 1280
ลงที่: push branch นี้เท่านั้น
คนใช้: แอดมิน อ่านไทย
แบบ: mock/form.png
ของเดิม: https://uat.example.com/form
คงไว้: บันทึกฟอร์มได้`;

const TICKET_BRIEF = UI_BRIEF.replace("ชนิด: ui-redo", "ชนิด: ui").replace(/^ของเดิม:.*\n/m, "");

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
      'if [ -n "$STUB_UPSTREAM" ]; then env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0 sh -c "$STUB_UPSTREAM" >/dev/null 2>&1; git fetch -q origin; git -c user.email=t@t -c user.name=t merge -q --no-edit origin/develop >/dev/null 2>&1; fi',
      `printf '%s' '${json.slice(0, -2)},"inputs_tried":'"\${STUB_TRIED:-[]}"',"design":'"\${STUB_DESIGN:-[]}"'}}'`,
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

function run(slug: string, env: Record<string, string>, brief = BRIEF) {
  const sent = s.twin(["dispatch", project, slug], brief, env);
  expect(sent.err).toBe("");
  const id = sent.out.match(/ส่งแล้ว (\S+)/)?.[1] ?? "";
  const done = s.twin(["wait", id], "", env).out;
  return { id, done, dir: join(s.repo, "runs", id) };
}

test("a done turn that changed code without trying any unlisted input gets one check turn, and only one", () => {
  s.write("profile/taste.md", "# What the owner sends UI back for\n\nfor improve\n\n## 1. The same thing looks the same everywhere\n- 2026-11-17 radius\n");
  const r = run("parse-code", { STUB_FILES: "src/parse.ts test/parse.test.ts" });
  const terms = readFileSync(join(r.dir, "contract.md"), "utf8");
  expect(terms).toEndWith("## What the owner sends UI back for\n\n### 1. The same thing looks the same everywhere\n- 2026-11-17 radius");
  expect(terms).not.toContain("for improve");
  expect(r.done).toContain("turn 2");
  const prompt = readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8");
  expect(prompt).toContain("src/parse.ts");
  expect(prompt).not.toContain("test/parse.test.ts");
  expect(prompt).toContain("inputs_tried");
  expect(existsSync(join(r.dir, "turn-2/check"))).toBe(true);
  expect(existsSync(join(r.dir, "turn-3"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
  expect(readFileSync(join(r.dir, "closed.md"), "utf8")).toContain("dropped true");
}, 120_000);

test("a turn that changed only tests and docs gets no check turn", () => {
  const r = run("parse-tests", { STUB_FILES: "test/parse.test.ts src/parse.spec.ts docs/parse.md types/parse.d.ts pkg/parse_test.go app/test_parse.py conftest.py src/__mocks__/api.ts" });
  expect(r.done).toContain("turn 1");
  expect(existsSync(join(r.dir, "turn-2"))).toBe(false);
  s.git(project, "branch", "landed-elsewhere", "gamo/parse-tests");
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
  expect(readFileSync(join(r.dir, "closed.md"), "utf8")).toMatch(/· [1-9]\d* commits · pushed false · discard true · dropped false/);
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
  expect(prompt).not.toContain("design reviewer");
  expect(existsSync(join(r.dir, "turn-3"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("a ui ticket with แบบ gets the click check but no design reviewer", () => {
  const r = run("form-ticket", { STUB_FILES: "src/Form.tsx" }, TICKET_BRIEF);
  const prompt = readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8");
  expect(prompt).toContain("clicked");
  expect(prompt).not.toContain("design reviewer");
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("a ui-redo brief whose turn changed UI with no design rows gets the design reviewer asked for in the check turn", () => {
  const r = run("form-design", { STUB_FILES: "src/Form.tsx" }, UI_BRIEF);
  expect(r.done).toContain("turn 2");
  const prompt = readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8");
  expect(prompt).toContain("design reviewer");
  expect(prompt).toContain("clicked");
  expect(existsSync(join(r.dir, "turn-3"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("design rows that differ from แบบ each show on their own line, with the match count and every side-by-side", () => {
  const design = JSON.stringify([
    { part: "หัวฟอร์ม", match: "same", why: "-", image: "/s/head.png" },
    { part: "popover ค่าเริ่มต้น", match: "differs", why: "ไม่มีรูปตัวเลือก", image: "/s/pop.png" },
    { part: "รูปซ้อน", match: "not-possible", why: "API ไม่ส่งรูปของกลุ่ม", image: "/s/img.png" },
  ]);
  const r = run("form-rows", { STUB_FILES: "src/Form.tsx", STUB_DESIGN: design }, UI_BRIEF);
  const prompt = readFileSync(join(r.dir, "turn-2/prompt.md"), "utf8");
  expect(prompt).not.toContain("design reviewer");
  expect(r.done).toContain("ตามแบบ: 1/3 ตรง · ภาพเทียบ: /s/head.png | /s/pop.png | /s/img.png");
  expect(r.done).toContain("ไม่ตรงแบบ: popover ค่าเริ่มต้น → ไม่มีรูปตัวเลือก");
  expect(r.done).toContain("ทำตามแบบไม่ได้: รูปซ้อน → API ไม่ส่งรูปของกลุ่ม");
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("files a turn brought in by merging the base branch do not count as the worker's code", () => {
  const remote = join(s.work, "remote.git");
  const other = join(s.work, "other");
  s.git(s.work, "init", "-q", "--bare", "-b", "develop", remote);
  s.git(project, "remote", "add", "origin", remote);
  s.git(project, "push", "-q", "origin", "main:develop");
  s.git(s.work, "clone", "-q", "-b", "develop", remote, other);
  const upstream = `cd ${other} && mkdir -p src && echo 'export const y = 2;' > src/upstream.ts && git add -A && git -c user.email=t@t -c user.name=t commit -qm up && git push -q origin develop`;
  const r = run("parse-merge", { STUB_FILES: "test/parse.test.ts", STUB_UPSTREAM: upstream });
  expect(s.git(join(project, ".claude/worktrees/gamo-parse-merge"), "log", "--format=%s", "-3")).toContain("up");
  expect(r.done).toContain("turn 1");
  expect(existsSync(join(r.dir, "turn-2"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);

test("UI and code under fixtures/, fixtures-*/ and testdata/ are test data and get no check turn", () => {
  const r = run("parse-fixtures", { STUB_FILES: "evals/fixtures-ui/dialog/index.html evals/fixtures/api/src/users.ts testdata/gen.go fixtures/page.css" });
  expect(r.done).toContain("turn 1");
  expect(existsSync(join(r.dir, "turn-2"))).toBe(false);
  expect(s.twin(["close", r.id, "--discard"]).code).toBe(0);
}, 120_000);
