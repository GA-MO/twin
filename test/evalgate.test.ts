import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compare } from "../lib/evalgate.ts";
import { GIT_ID, sandbox, type Sandbox } from "./harness.ts";

let sb: Sandbox;
const rows = (fails: string[] = [], failRep = 0) =>
  ["a", "b", "c"].flatMap((id) => [1, 2].map((rep) => ({ id, rep, pass: !(fails.includes(id) && (failRep === 0 || failRep === rep)), why: "" })));

function setRows(r: { id: string; rep: number; pass: boolean | null; why: string }[]) {
  writeFileSync(join(sb.work, "rows.json"), JSON.stringify(r));
}

const env = () => ({ FAKE_ROWS: join(sb.work, "rows.json") });
const evalCmd = (...args: string[]) => sb.twin(["eval", ...args], "", env());

function commit(message: string, ...flags: string[]) {
  const r = Bun.spawnSync(["git", "-C", sb.repo, "commit", "-q", ...flags, "-m", message], { env: { ...process.env, ...GIT_ID, HOME: sb.home, PATH: "/usr/bin:/bin", ...env() } });
  return { code: r.exitCode, err: r.stderr.toString(), subject: sb.git(sb.repo, "log", "-1", "--format=%B") };
}

beforeAll(() => {
  sb = sandbox("twin-evalgate-");
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null, scope: "project" }));
  sb.write("evals/replay.ts", `const out = process.argv[process.argv.indexOf("--json") + 1]!;\nawait Bun.write(out, await Bun.file(process.env.FAKE_ROWS!).text());\n`);
  sb.write("profile/rules.json", `{ "rules": [] }\n`);
  sb.git(sb.repo, "init", "-q", "-b", "main");
  writeFileSync(join(sb.repo, ".git/info/exclude"), "node_modules\n");
  sb.git(sb.repo, "add", "-A");
  sb.git(sb.repo, "commit", "-q", "-m", "template");
  setRows(rows());
});

afterAll(() => sb.remove());

test("a baseline installs the commit-msg gate and measures the suites the planned files affect", () => {
  const r = evalCmd("before", "profile/rules.json", "collectors/notes.ts");
  expect(r.err).toBe("");
  expect(r.out).toContain("baseline replay: 6/6");
  expect(r.out).toContain("ไม่มี eval วัด: collectors/notes.ts");
  expect(readFileSync(join(sb.repo, ".git/hooks/commit-msg"), "utf8")).toContain("eval gate");
});

test("a commit that is not improve: never reaches the gate, even with a broken round", () => {
  const round = join(sb.repo, "state/evals/round.json");
  const saved = readFileSync(round, "utf8");
  writeFileSync(round, "{ broken");
  sb.write("collectors/notes.ts", `${readFileSync(join(sb.repo, "collectors/notes.ts"), "utf8")}\n`);
  sb.git(sb.repo, "add", "collectors/notes.ts");
  const r = commit("fix: something else");
  expect(r.code).toBe(0);
  expect(r.subject.trim()).toBe("fix: something else");
  writeFileSync(round, saved);
});

test("an improve: commit that made a scenario fail every time is refused, naming it", () => {
  sb.write("profile/rules.json", `{ "rules": [1] }\n`);
  setRows(rows(["b"]));
  const after = evalCmd();
  expect(after.out).toContain("replay 6/6 → 4/6 · แย่ลง");
  expect(after.out).toContain("b 2/2 → 0/2 (ไม่ผ่านเลย)");
  expect(after.out).toContain("ยัง commit improve: ไม่ได้");
  const r = commit("improve: worse rule", "--allow-empty");
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("replay แย่ลง 6/6 → 4/6");
  expect(r.err).toContain("b 2/2 → 0/2");
});

test("an improve: commit changed after its last measurement is refused", () => {
  sb.write("profile/rules.json", `{ "rules": [2] }\n`);
  const r = commit("improve: unmeasured", "--allow-empty");
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("ยังไม่ได้วัดหลังแก้");
});

test("an improve: commit that is not worse goes through with the numbers in its message, and closes the round", () => {
  setRows(rows());
  const after = evalCmd();
  expect(after.out).toContain("replay 6/6 → 6/6 · ไม่แย่ลง");
  const r = commit("improve: better rule", "--allow-empty");
  expect(r.err).toBe("Eval-replay: 6/6 → 6/6 ไม่แย่ลง\n");
  expect(r.code).toBe(0);
  expect(r.subject).toContain("Eval-replay: 6/6 → 6/6 ไม่แย่ลง");
  expect(existsSync(join(sb.repo, "state/evals/round.json"))).toBe(false);
});

test("amending the last improve: commit keeps its numbers, even with git commit -v", () => {
  const r = commit("improve: better rule, reworded", "--amend", "--allow-empty");
  expect(r.code).toBe(0);
  expect(r.subject).toContain("Eval-replay: 6/6 → 6/6 ไม่แย่ลง");
  const file = join(sb.work, "COMMIT_EDITMSG");
  writeFileSync(file, "improve: edited\n# ------------------------ >8 ------------------------\ndiff --git a b\n");
  expect(evalCmd("gate", file).code).toBe(0);
  expect(readFileSync(file, "utf8")).toBe("improve: edited\n\nEval-replay: 6/6 → 6/6 ไม่แย่ลง\n\n# ------------------------ >8 ------------------------\ndiff --git a b\n");
});

test("an improve: commit with no baseline this round is refused", () => {
  sb.write("profile/rules.json", `{ "rules": [3] }\n`);
  const r = commit("improve: no round", "--allow-empty");
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("ยังไม่ได้วัด eval ของรอบนี้");
  sb.write("profile/rules.json", `{ "rules": [2] }\n`);
});

test("drop puts the owner's files back as they were when the round began", () => {
  evalCmd("before", "profile/rules.json");
  sb.write("profile/rules.json", `{ "rules": ["bad"] }\n`);
  const r = evalCmd("drop");
  expect(r.out).toContain("ย้อน profile/rules.json กลับเป็นตอนเริ่มรอบ");
  expect(readFileSync(join(sb.repo, "profile/rules.json"), "utf8")).toBe(`{ "rules": [2] }\n`);
});

test("changing the scenarios in the same round as the rule cannot hide a regression", () => {
  evalCmd("before", "profile/rules.json");
  sb.write("profile/rules.json", `{ "rules": [4] }\n`);
  sb.write("profile/evals/replay.json", "[]\n");
  setRows(rows().filter((r) => r.id !== "b"));
  expect(evalCmd().out).toContain("เกณฑ์วัดเปลี่ยนในรอบเดียวกับการแก้");
  const r = commit("improve: hide b", "--allow-empty");
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("profile/evals/replay.json");
  evalCmd("drop");
  Bun.spawnSync(["rm", join(sb.repo, "profile/evals/replay.json")]);
  setRows(rows());
});

test("an improve: commit of a measured file with no baseline is refused, and a baseline cannot start on a dirty file", () => {
  sb.write("lib/contract.ts", `${readFileSync(join(sb.repo, "lib/contract.ts"), "utf8")}\n`);
  expect(evalCmd("before", "lib/contract.ts").err).toContain("ยังไม่ได้ commit: lib/contract.ts");
  sb.git(sb.repo, "checkout", "lib/contract.ts");
  expect(evalCmd("before", "collectors/notes.ts").err).toBe("");
  sb.write("lib/contract.ts", `${readFileSync(join(sb.repo, "lib/contract.ts"), "utf8")}\n`);
  sb.git(sb.repo, "add", "lib/contract.ts");
  const r = commit("improve: contract");
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("arms: ไม่มี baseline");
  expect(evalCmd("before", "arms").err).toContain("แก้ไปแล้วตั้งแต่เริ่มรอบนี้");
  sb.git(sb.repo, "reset", "-q", "--hard");
  expect(evalCmd("drop").out).toContain("ทิ้งรอบนี้แล้ว");
});

test("eval refuses what it cannot measure", () => {
  expect(evalCmd("before").err).toContain("ใช้: eval before");
  expect(evalCmd("before", "../outside.ts").err).toContain("ไม่ได้อยู่ใน");
  expect(evalCmd("bogus").err).toContain("ไม่รู้จัก bogus");
  expect(evalCmd("gate").err).toContain("ใช้: eval gate");
  sb.write("state/evals/round.json", "{ broken");
  expect(evalCmd("before", "profile/rules.json").err).toContain("round.json เสีย");
  evalCmd("drop");
});

test("a repo whose hooks live elsewhere keeps them: the gate says how to add itself instead", () => {
  const key = ["core", "hooksPath"].join(".");
  sb.git(sb.repo, "config", key, ".husky");
  const r = evalCmd("drop");
  expect(r.out).not.toContain("⚠");
  expect(sb.twin(["eval", "before", "collectors/notes.ts"]).out).toContain("ไม่ได้ติดตั้ง eval gate");
  expect(existsSync(join(sb.repo, ".husky/commit-msg"))).toBe(false);
  sb.git(sb.repo, "config", "--unset", key);
  evalCmd("drop");
});

test("worse means a fully passing item now never passes, or the total drops by more than a tenth of the items", () => {
  const all = (n: number) => Array.from({ length: n }, () => 1);
  const items = (o: Record<string, number[]>) => ({ items: o, complete: true });
  expect(compare("replay", items({ a: [1, 1], b: [1, 1] }), items({ a: [1, 1], b: [0, 0] })).worse).toBe(true);
  expect(compare("replay", items({ a: [1, 1], b: [1, 1], c: [1, 1], d: [1, 1], e: [1, 1], f: [1, 1], g: [1, 1] }), items({ a: [1, 0], b: [1, 1], c: [1, 1], d: [1, 1], e: [1, 1], f: [1, 1], g: [1, 1] })).worse).toBe(false);
  expect(compare("replay", items({ a: [1, 1], b: [1, 1], c: [1, 1], d: [1, 1], e: [1, 1], f: [1, 1], g: [1, 1] }), items({ a: [1, 0], b: [1, 0], c: [1, 1], d: [1, 1], e: [1, 1], f: [1, 1], g: [1, 1] })).worse).toBe(true);
  expect(compare("arms", items({ s: all(3), p: all(3) }), items({ s: [2 / 3, 2 / 3, 2 / 3], p: all(3) })).worse).toBe(true);
  expect(compare("arms", items({ s: [1, 2 / 3, 1], p: all(3) }), items({ s: [2 / 3, 1, 2 / 3], p: all(3) })).worse).toBe(false);
  expect(compare("arms", items({ s: all(3) }), items({ s: all(3), t: [0] })).before).toBe("100%");
  expect(compare("replay", items({ a: [1] }), { items: { a: [1] }, complete: false }).incomplete).toBe(true);
});
