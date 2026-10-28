import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compare } from "../lib/evalgate.ts";
import { GIT_ID, sandbox, type Sandbox } from "./harness.ts";

const FAKE_REPLAY = `const a = process.argv;
const out = a[a.indexOf("--json") + 1]!;
const reps = Number(a[a.indexOf("--reps") + 1]);
const ids = a.slice(a.indexOf("--json") + 2);
const pass = process.env.FAKE_REPLAY_PASS !== "0";
await Bun.write(out, JSON.stringify(ids.flatMap((id) => Array.from({ length: reps }, (_, i) => ({ id, rep: i + 1, pass, why: "" })))));
`;
const FAKE_ARMS = `const a = process.argv;
const at = (f: string) => a[a.indexOf(f) + 1]!;
const plan = JSON.parse(process.env.FAKE_ARMS ?? "{}");
const rows = at("--tasks").split(",").flatMap((task) => Array.from({ length: Number(at("--reps")) }, (_, i) => {
  const diff = \`evals/results/fake-\${task}-\${i}-\${crypto.randomUUID()}.diff\`;
  require("node:fs").mkdirSync("evals/results", { recursive: true });
  require("node:fs").writeFileSync(diff, "diff");
  return { task, rep: i + 1, outcome: "done", hiddenPass: 9, hiddenFail: 0, diff, ...plan[task] };
}));
await Bun.write(at("--out"), JSON.stringify(rows));
`;
const FAKE_JUDGE = `console.log(process.env.FAKE_JUDGE ?? "after: 2 points, ranked first 2 times");\n`;

function twin(prefix: string): Sandbox {
  const sb = sandbox(prefix);
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null, scope: "project" }));
  sb.write("evals/replay.ts", FAKE_REPLAY);
  sb.write("evals/arms.ts", FAKE_ARMS);
  sb.write("evals/judge.ts", FAKE_JUDGE);
  sb.write("profile/rules.json", `{ "rules": [] }\n`);
  sb.git(sb.repo, "init", "-q", "-b", "main");
  writeFileSync(join(sb.repo, ".git/info/exclude"), "node_modules\n");
  sb.git(sb.repo, "add", "-A");
  sb.git(sb.repo, "commit", "-q", "-m", "template");
  return sb;
}

let sb: Sandbox;
let fake: Record<string, string> = {};
const env = () => ({ TWIN_IN_GATE: "1", ...fake });
const evalCmd = (...args: string[]) => sb.twin(["eval", ...args], "", env());
const contractFile = () => join(sb.repo, "lib/contract.ts");

function commit(message: string, ...flags: string[]) {
  const r = Bun.spawnSync(["git", "-C", sb.repo, "commit", "-q", ...flags, "-m", message], { env: { ...process.env, ...GIT_ID, HOME: sb.home, PATH: "/usr/bin:/bin", ...env() } });
  return { code: r.exitCode, err: r.stderr.toString(), body: sb.git(sb.repo, "log", "-1", "--format=%B") };
}

function touchContract(text = "") {
  writeFileSync(contractFile(), `${readFileSync(contractFile(), "utf8")}\n${text}`);
  sb.git(sb.repo, "add", "lib/contract.ts");
}

beforeAll(() => {
  sb = twin("twin-evalgate-");
});

afterAll(() => sb.remove());

test("a baseline installs the commit-msg gate and records the fast fixtures on the current files", () => {
  const r = evalCmd("before");
  expect(r.err).toBe("");
  expect(r.out).toContain("baseline split-bill: ผ่านครบ 2/2");
  expect(evalCmd("before").out).toContain("(ผลเดิม ไฟล์ที่อ่านไม่เปลี่ยน)");
  expect(readFileSync(join(sb.repo, ".git/hooks/commit-msg"), "utf8")).toContain("eval gate");
});

test("a commit that is not improve: never starts the gate, even when the engine cannot run", () => {
  const file = join(sb.repo, "twin.ts");
  const saved = readFileSync(file, "utf8");
  writeFileSync(file, "process.exit(3);\n");
  expect(commit("chore: unrelated", "--allow-empty").code).toBe(0);
  expect(commit("improve: blocked when the engine is broken", "--allow-empty").code).not.toBe(0);
  writeFileSync(file, saved);
});

test("a profile-only improve passes on the deterministic checks; a single replay run is only shown, never decides", () => {
  fake = { FAKE_REPLAY_PASS: "0" };
  sb.write("profile/rules.json", `{ "rules": [1] }\n`);
  const r = commit("improve: a rule", "--allow-empty");
  expect(r.code).toBe(0);
  expect(r.body).toMatch(/Eval-gate: ผ่าน \d+ วินาที · contract ครบ 10 กฎ · brief \d+ ไฟล์ parse ได้ · report 1 อัน parse ได้ · bun test ข้าม/);
  expect(r.body).toContain("Eval-info: replay รอบเดียว 0/7 (ข้อมูลเท่านั้น ไม่ใช้ตัดสิน)");
  expect(r.body).toContain("Eval-quality: ดีขึ้นหรือแย่ลงดูจากรอบกลางคืน");
  fake = {};
});

test("an engine change whose fixtures still pass fully commits, and amending it reuses the result", () => {
  touchContract();
  const r = commit("improve: harmless contract change");
  expect(r.code).toBe(0);
  expect(r.body).toContain("fixture split-bill ผ่านครบ");
  expect(r.body).toContain("fixture static-path ผ่านครบ");
  const again = commit("improve: harmless contract change, reworded", "--amend", "--allow-empty");
  expect(again.code).toBe(0);
  expect(again.body).toContain("fixture split-bill ผ่านครบ");
  expect(evalCmd().out).toContain("(ผลเดิม เนื้อหาไม่เปลี่ยน)");
});

test("a contract that lost a key rule is refused before any worker runs", () => {
  writeFileSync(contractFile(), readFileSync(contractFile(), "utf8").split("\n").filter((l) => !l.startsWith("- Code that takes input")).join("\n"));
  sb.git(sb.repo, "add", "lib/contract.ts");
  const r = commit("improve: drop the input rule");
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("contract ขาดกฎสำคัญ: ลอง input ที่ brief ไม่ได้บอก");
  expect(r.err).not.toContain("fixture");
  sb.git(sb.repo, "reset", "-q", "--hard");
});

test("hidden tests that fall from a full pass, or a worker that does not finish, refuse the commit", () => {
  fake = { FAKE_ARMS: JSON.stringify({ "split-bill": { hiddenPass: 6, hiddenFail: 3 } }) };
  touchContract("// a");
  const drop = commit("improve: worse split");
  expect(drop.code).not.toBe(0);
  expect(drop.err).toContain("fixture split-bill: hidden test ผ่าน 67% ตกจากที่เคยผ่านครบ");
  fake = { FAKE_ARMS: JSON.stringify({ "static-path": { outcome: "timeout", hiddenPass: 0, hiddenFail: 0 } }) };
  touchContract("// b");
  const stuck = commit("improve: stuck worker");
  expect(stuck.code).not.toBe(0);
  expect(stuck.err).toContain("fixture static-path: worker ไม่จบงาน");
  fake = {};
  sb.git(sb.repo, "reset", "-q", "--hard");
});

test("what is committed must be what was checked, and the yardstick cannot change with what it measures", () => {
  touchContract("// c");
  writeFileSync(contractFile(), `${readFileSync(contractFile(), "utf8")}// unstaged\n`);
  expect(commit("improve: partial").err).toContain("ยังไม่ได้ git add ให้ตรงกับที่จะ commit: lib/contract.ts");
  sb.git(sb.repo, "add", "lib/contract.ts");
  sb.write("evals/fixtures-hard/split-bill/hidden/h.test.ts", "");
  sb.git(sb.repo, "add", "evals");
  expect(commit("improve: hide it").err).toContain("แก้เกณฑ์วัด (evals/fixtures-hard/split-bill/hidden/h.test.ts) พร้อมกับสิ่งที่มันวัด (lib/contract.ts)");
  sb.git(sb.repo, "reset", "-q", "--hard");
  sb.write("evals/fixtures-hard/split-bill/brief.md", "no kind here\n");
  sb.git(sb.repo, "add", "evals");
  expect(commit("improve: broken brief").err).toContain("brief parse ไม่ได้: evals/fixtures-hard/split-bill/brief.md");
  sb.git(sb.repo, "reset", "-q", "--hard");
});

test("a repo whose hooks live elsewhere keeps them: eval says how to add the gate instead", () => {
  const key = ["core", "hooksPath"].join(".");
  sb.git(sb.repo, "config", key, ".husky");
  expect(sb.twin(["eval", "before"]).out).toContain("ไม่ได้ติดตั้ง eval gate");
  expect(existsSync(join(sb.repo, ".husky/commit-msg"))).toBe(false);
  sb.git(sb.repo, "config", "--unset", key);
});

test("nightly measures several runs, compares with the night before, and a worse night shows in the brief", () => {
  fake = {};
  const first = evalCmd("nightly");
  expect(first.err).toBe("");
  expect(first.out).toContain("รอบแรก");
  expect(evalCmd("nightly").out).toContain("วัดใหม่ 0 ข้อ");
  touchContract("// night");
  sb.git(sb.repo, "commit", "-q", "-m", "chore: contract tweak");
  fake = { FAKE_ARMS: JSON.stringify({ "split-bill": { hiddenPass: 3, hiddenFail: 6 }, "static-path": { hiddenPass: 0, hiddenFail: 9 } }), FAKE_JUDGE: "before: 6 points, ranked first 6 times\nafter: 0 points, ranked first 0 times" };
  const night = evalCmd("nightly");
  expect(night.out).toContain("แย่ลง ❌");
  expect(night.out).toContain("static-path 100% → 0% (ไม่ผ่านเลย)");
  expect(night.out).toContain("judge 18/18 → 0/18 (18 ครั้ง) แย่ลง");
  sb.twin(["sync", "nightly"], "", env());
  expect(sb.twin(["todo"], "", env()).out).toContain("eval กลางคืน");
  fake = {};
});

test("bun test failing refuses an improve commit", () => {
  const other = twin("twin-evalgate-tests-");
  for (const f of readdirSync(join(other.repo, "test")).filter((f) => f.endsWith(".test.ts"))) rmSync(join(other.repo, "test", f));
  other.write("test/broken.test.ts", `import { test, expect } from "bun:test";\ntest("broken", () => expect(1).toBe(2));\n`);
  other.git(other.repo, "add", "-A");
  other.git(other.repo, "commit", "-q", "-m", "broken test");
  expect(other.twin(["eval", "before"]).code).toBe(0);
  const r = Bun.spawnSync(["git", "-C", other.repo, "commit", "-q", "--allow-empty", "-m", "improve: with a failing test"], { env: { ...process.env, ...GIT_ID, HOME: other.home, PATH: "/usr/bin:/bin" } });
  expect(r.exitCode).not.toBe(0);
  expect(r.stderr.toString()).toContain("bun test ล้ม: (fail) broken");
  other.remove();
});

test("eval refuses what it does not know", () => {
  expect(evalCmd("bogus").err).toContain("ไม่รู้จัก bogus");
  expect(evalCmd("gate").err).toContain("ใช้: eval gate");
});

test("worse at night means a fully passing item now never passes, or the total drops by more than a tenth of the items", () => {
  const seven = (a: number[]) => Object.fromEntries(["a", "b", "c", "d", "e", "f", "g"].map((id, i) => [id, i === 0 ? a : [1, 1, 1]]));
  expect(compare("replay", { a: [1, 1, 1], b: [1, 1, 1] }, { a: [1, 1, 1], b: [0, 0, 0] }).worse).toBe(true);
  expect(compare("replay", seven([1, 1, 1]), seven([1, 1, 0])).worse).toBe(false);
  expect(compare("replay", seven([1, 1, 1]), { ...seven([0, 0, 1]), b: [1, 0, 0] }).worse).toBe(true);
  expect(compare("arms", { s: [1, 1, 1], p: [1, 1, 1] }, { s: [2 / 3, 2 / 3, 2 / 3], p: [1, 1, 1] }).worse).toBe(true);
  expect(compare("arms", { s: [1, 2 / 3, 1], p: [1, 1, 1] }, { s: [2 / 3, 1, 2 / 3], p: [1, 1, 1] }).worse).toBe(false);
  expect(compare("arms", { s: [1] }, { s: [1], t: [0] }).compared).toBe(1);
});
