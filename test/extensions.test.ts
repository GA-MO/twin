import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sandbox, type Sandbox } from "./harness.ts";

let s: Sandbox;

beforeAll(() => {
  s = sandbox("twin-ext-");
  s.git(s.repo, "init", "-q", "-b", "main");
  s.git(s.repo, "add", "-A");
  s.git(s.repo, "commit", "-q", "-m", "template");
  expect(s.twin(["setup", "nok", "--no-schedule"]).code).toBe(0);
}, 120_000);

afterAll(() => s.remove());

const HELLO = `import { defineCommand } from "../../lib/command.ts";

export default defineCommand({
  usage: "[ชื่อ]",
  help: "ทักทายเจ้าของ",
  run: (args, { profile }) => console.log(\`สวัสดี \${args[0] ?? "เจ้าของ"} จาก \${profile?.name}\`),
});
`;

test("a command file in profile/commands is listed and runs at once", () => {
  s.write("profile/commands/hello.ts", HELLO);
  const list = s.twin([]);
  expect(list.code).toBe(0);
  expect(list.out).toContain("bun twin.ts setup");
  expect(list.out).toContain("bun twin.ts hello [ชื่อ]  ทักทายเจ้าของ");
  const r = s.twin(["hello", "นก"]);
  expect(r.err).toBe("");
  expect(r.out.trim()).toBe("สวัสดี นก จาก nok");
});

test("a broken command file fails alone with its file and line, and every other command still works", () => {
  s.write("profile/commands/bad.ts", 'export default {\n  help: "x",\n  run( {\n');
  s.write("profile/commands/boom.ts", 'import { defineCommand } from "../../lib/command.ts";\nexport default defineCommand({ help: "พัง", run: () => { throw new Error("no api key"); } });\n');
  s.write("profile/commands/shape.ts", "export default { run: 1 };\n");
  s.write("profile/commands/Bad Name.ts", "export default {};\n");
  s.write("profile/commands/_util.ts", "export const x = 1;\n");
  const list = s.twin([]);
  expect(list.code).toBe(0);
  expect(list.out).toContain("⚠ bun twin.ts bad  profile/commands/bad.ts:3 โหลดไม่ได้");
  expect(list.out).toContain("⚠ bun twin.ts shape  profile/commands/shape.ts ต้อง export default defineCommand");
  expect(list.out).toContain("profile/commands/Bad Name.ts ชื่อไฟล์ต้องเป็น a-z 0-9 -");
  expect(list.out).not.toContain("_util");
  const bad = s.twin(["bad"]);
  expect(bad.code).toBe(1);
  expect(bad.err).toContain("profile/commands/bad.ts:3");
  const boom = s.twin(["boom"]);
  expect(boom.code).toBe(1);
  expect(boom.err).toContain("คำสั่ง boom (profile/commands/boom.ts) ล้ม: no api key");
  expect(s.twin(["hello"]).code).toBe(0);
  expect(s.twin(["profile"]).code).toBe(0);
  expect(s.twin(["brief"]).out).toStartWith("# nok ·");
  for (const f of ["bad", "boom", "shape", "Bad Name"]) rmSync(join(s.repo, `profile/commands/${f}.ts`));
});

test("a command named like an engine command is reported and the engine's runs", () => {
  s.write("profile/commands/todo.ts", 'export default { help: "ของฉัน", run() { console.log("MINE"); } };\n');
  const r = s.twin(["todo"]);
  expect(r.code).toBe(0);
  expect(r.out).not.toContain("MINE");
  expect(r.err).toContain("profile/commands/todo.ts ชื่อซ้ำกับคำสั่งของ engine");
  expect(s.twin([]).out).toContain("⚠ profile/commands/todo.ts ชื่อซ้ำกับของ engine");
  expect(s.twin(["brief"]).out).toContain("profile/commands/todo.ts ชื่อซ้ำกับของ engine");
  rmSync(join(s.repo, "profile/commands/todo.ts"));
  expect(s.twin(["brief"]).out).not.toContain("ของที่เพิ่มเอง");
});

const X = `import { defineCollector } from "../../lib/collector.ts";

export default defineCollector({
  title: "ของฉัน X",
  order: 95,
  everyMinutes: 60,
  keep: "archive",
  defaultOn: true,
  async run({ profile }) {
    return { kind: "ok", files: { "index.md": "x\\n" }, brief: \`- ค่า X ของ \${profile.name} วันนี้ 42\`, items: [{ key: "x:1", title: "ดูค่า X", score: 10 }] };
  },
});
`;

test("a collector file in profile/collectors syncs into state/ and shows in the brief", () => {
  s.write("profile/collectors/x.ts", X);
  expect(s.twin(["sync", "x"]).out.trim()).toBe("x: ok");
  expect(readFileSync(join(s.repo, "state/x/index.md"), "utf8")).toBe("x\n");
  expect(existsSync(join(s.repo, "x"))).toBe(false);
  const brief = s.twin(["brief"]).out;
  expect(brief).toContain("## ของฉัน X");
  expect(brief).toContain("- ค่า X ของ nok วันนี้ 42");
  expect(brief).toContain("ดูค่า X");
  expect(s.twin(["profile", "collector.x=off"]).code).toBe(0);
  expect(s.twin(["brief"]).out).not.toContain("ของฉัน X");
  expect(s.twin(["profile", "collector.x=on"]).code).toBe(0);
});

test("a broken collector shows as failed in the brief and stops nothing else", () => {
  s.write("profile/collectors/y.ts", "export default defineCollector({ title: \n");
  s.write("profile/collectors/z.ts", 'export default { title: "z" };\n');
  s.write("profile/collectors/notes.ts", X);
  s.write("profile/collectors/brief.ts", X);
  const all = s.twin(["sync"]);
  expect(all.code).toBe(0);
  expect(all.out).toContain("y: error");
  expect(s.twin(["sync", "y", "notes"]).out.trim()).toBe("y: error\nnotes: ok");
  const brief = s.twin(["brief"]).out;
  expect(brief).toContain("⚠ y ล้ม");
  expect(brief).toContain("profile/collectors/y.ts:1 โหลดไม่ได้");
  expect(brief).toContain("⚠ z ล้ม");
  expect(brief).toContain("profile/collectors/z.ts ต้อง export default defineCollector");
  expect(brief).toContain("profile/collectors/notes.ts ชื่อซ้ำกับของ engine");
  expect(brief).toContain("profile/collectors/brief.ts ชื่อซ้ำกับของ engine");
  expect(brief).toContain("## ของฉัน X");
  for (const f of ["y", "z", "notes", "brief"]) rmSync(join(s.repo, `profile/collectors/${f}.ts`));
}, 120_000);

const skill = (name: string) => s.write(`profile/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${name} ของเจ้าของ\n---\n# ${name}\n`);
const isLink = (p: string) => existsSync(p) && lstatSync(p).isSymbolicLink();

test("setup links the owner's skills where Claude Code reads them, in either scope, and uninstall takes them out", () => {
  skill("foo");
  skill("dispatch");
  skill("mine");
  mkdirSync(join(s.home, ".claude/skills/mine"), { recursive: true });
  writeFileSync(join(s.home, ".claude/skills/mine/SKILL.md"), "the owner's own");
  expect(s.twin(["brief"]).out).toContain("skill foo ยังไม่ได้ลิงก์");
  const global = s.twin(["setup", "--no-schedule"]);
  expect(global.code).toBe(0);
  expect(global.out).toContain("ข้าม skill dispatch");
  expect(global.out).toContain("ข้าม skill mine");
  expect(readFileSync(join(s.home, ".claude/skills/foo/SKILL.md"), "utf8")).toContain("name: foo");
  expect(isLink(join(s.home, ".claude/skills/dispatch"))).toBe(false);
  expect(readFileSync(join(s.home, ".claude/skills/mine/SKILL.md"), "utf8")).toBe("the owner's own");
  const brief = s.twin(["brief"]).out;
  expect(brief).not.toContain("skill foo ยังไม่ได้ลิงก์");
  expect(brief).toContain("skill dispatch ชื่อซ้ำกับ skill ที่มีอยู่แล้ว");
  rmSync(join(s.repo, "profile/skills/dispatch"), { recursive: true });

  expect(s.twin(["setup", "--scope", "project", "--no-schedule"]).code).toBe(0);
  expect(readFileSync(join(s.repo, ".claude/skills/foo/SKILL.md"), "utf8")).toContain("name: foo");
  expect(readFileSync(join(s.repo, ".claude/skills/mine/SKILL.md"), "utf8")).toContain("name: mine");
  expect(existsSync(join(s.home, ".claude/skills/foo"))).toBe(false);
  expect(readFileSync(join(s.repo, ".claude/skills/dispatch/SKILL.md"), "utf8")).not.toContain("ของเจ้าของ");
  expect(s.git(s.repo, "status", "--porcelain", "--", ".claude")).toBe("");

  rmSync(join(s.repo, "profile/skills/mine"), { recursive: true });
  expect(s.twin(["setup", "--no-schedule"]).code).toBe(0);
  expect(isLink(join(s.repo, ".claude/skills/mine"))).toBe(false);
  expect(existsSync(join(s.repo, ".claude/skills/foo"))).toBe(true);

  const out = s.twin(["uninstall"]);
  expect(out.code).toBe(0);
  expect(existsSync(join(s.repo, ".claude/skills/foo"))).toBe(false);
  expect(existsSync(join(s.home, ".claude/skills/foo"))).toBe(false);
  expect(existsSync(join(s.home, ".claude/skills/mine/SKILL.md"))).toBe(true);
  expect(existsSync(join(s.repo, "profile/skills/foo/SKILL.md"))).toBe(true);
  expect(s.twin(["setup", "--scope", "global", "--no-schedule"]).code).toBe(0);
  expect(readFileSync(join(s.home, ".claude/skills/foo/SKILL.md"), "utf8")).toContain("name: foo");
}, 120_000);

test("a dangling link in profile/skills costs only that skill", () => {
  symlinkSync(join(s.work, "nowhere"), join(s.repo, "profile/skills/ghost"));
  const brief = s.twin(["brief"]);
  expect(brief.code).toBe(0);
  expect(brief.out).toStartWith("# nok ·");
  expect(s.twin(["setup", "--no-schedule"]).code).toBe(0);
  rmSync(join(s.repo, "profile/skills/ghost"));
}, 120_000);

test("a collector cannot write outside its own state folder", () => {
  s.write("profile/collectors/esc.ts", X.replace('"index.md"', '"../../profile/twin.json"'));
  expect(s.twin(["sync", "esc"]).out.trim()).toBe("esc: error");
  expect(JSON.parse(readFileSync(join(s.repo, "profile/twin.json"), "utf8")).name).toBe("nok");
  expect(s.twin(["brief"]).out).toContain("อยู่นอก state/esc/");
  rmSync(join(s.repo, "profile/collectors/esc.ts"));
});

test("renaming the agent keeps the secret service it started with", () => {
  expect(JSON.parse(readFileSync(join(s.repo, "profile/twin.json"), "utf8")).secretService).toBe("nok");
  expect(s.twin(["setup", "kai", "--no-schedule"]).code).toBe(0);
  const profile = JSON.parse(readFileSync(join(s.repo, "profile/twin.json"), "utf8"));
  expect(profile.name).toBe("kai");
  expect(profile.secretService).toBe("nok");
  expect(s.twin(["setup", "nok", "--no-schedule"]).code).toBe(0);
}, 120_000);

test("profile/CLAUDE.md is imported into this repo's sessions", () => {
  const lines = readFileSync(join(dirname(import.meta.dir), "CLAUDE.md"), "utf8").split("\n");
  expect(lines).toContain("@profile/CLAUDE.md");
});

test("backup keeps the owner's commands, collectors and skills, and the checked-out branch never sees them", () => {
  rmSync(join(s.repo, "state/backup.log"), { force: true });
  expect(s.twin(["sync"]).out).toContain("backup:");
  const tree = s.git(s.repo, "ls-tree", "-r", "--name-only", "refs/twin/backup");
  for (const f of ["profile/commands/hello.ts", "profile/collectors/x.ts", "profile/skills/foo/SKILL.md"]) expect(tree).toContain(f);
  expect(s.git(s.repo, "status", "--porcelain")).toBe("");
}, 120_000);
