import { afterAll, beforeAll, expect, test } from "bun:test";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SOURCE = dirname(import.meta.dir);
let work = "";
let origin = "";
let repo = "";
let author = "";
let home = "";

const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, PATH: "/usr/bin:/bin", CLAUDE_CODE_SESSION_ID: "", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });

function sh(cwd: string, cmd: string[]) {
  const r = Bun.spawnSync(cmd, { cwd, env: env() });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

function twin(args: string[]) {
  const r = Bun.spawnSync([process.execPath, join(repo, "twin.ts"), ...args], { cwd: repo, env: env() });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function publish(file: string, line: string, subject: string) {
  sh(author, ["git", "pull", "-q", "--ff-only"]);
  appendFileSync(join(author, file), line);
  sh(author, ["git", "commit", "-qam", subject]);
  sh(author, ["git", "push", "-q"]);
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "twin-update-"));
  const seed = join(work, "seed");
  origin = join(work, "origin.git");
  repo = join(work, "repo");
  author = join(work, "author");
  home = join(work, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  const files = Bun.spawnSync(["git", "-C", SOURCE, "ls-files", "--cached", "--others", "--exclude-standard"]).stdout.toString().split("\n").filter((f) => f && f !== "node_modules");
  for (const f of files) if (existsSync(join(SOURCE, f))) cpSync(join(SOURCE, f), join(seed, f), { recursive: true });
  sh(seed, ["git", "init", "-q", "-b", "main"]);
  sh(seed, ["git", "add", "-A"]);
  sh(seed, ["git", "commit", "-qm", "seed"]);
  sh(work, ["git", "clone", "-q", "--bare", seed, origin]);
  sh(work, ["git", "clone", "-q", origin, repo]);
  sh(work, ["git", "clone", "-q", origin, author]);
  symlinkSync(join(SOURCE, "node_modules"), join(repo, "node_modules"));
  expect(twin(["setup", "nok", "--no-schedule"]).code).toBe(0);
}, 120_000);

afterAll(() => rmSync(work, { recursive: true, force: true }));

test("update with nothing new says so and leaves the checkout alone", () => {
  const head = sh(repo, ["git", "rev-parse", "HEAD"]);
  const r = twin(["update"]);
  expect(r.code).toBe(0);
  expect(r.out).toContain("เป็นรุ่นล่าสุดของ origin/main แล้ว");
  expect(sh(repo, ["git", "rev-parse", "HEAD"])).toBe(head);
}, 120_000);

test("the brief says when a newer engine waits upstream, and update clears it", () => {
  publish("README.md", "\nnotice\n", "readme: a line the notice counts");
  expect(twin(["sync", "update"]).code).toBe(0);
  expect(twin(["todo"]).out).toContain("มี nok รุ่นใหม่ 1 เรื่อง (origin/main)");
  expect(twin(["update"]).code).toBe(0);
  expect(twin(["todo"]).out).not.toContain("รุ่นใหม่");
}, 120_000);

test("update fast-forwards to the new engine, lists what changed, and reruns setup with the owner's choices", () => {
  publish("README.md", "\nnew line\n", "readme: a new line for owners");
  rmSync(join(repo, "mods/.claude-plugin/marketplace.json"));
  const r = twin(["update"]);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  expect(r.out).toContain("1 เรื่อง");
  expect(r.out).toContain("readme: a new line for owners");
  expect(sh(repo, ["git", "rev-parse", "HEAD"])).toBe(sh(author, ["git", "rev-parse", "HEAD"]));
  expect(existsSync(join(repo, "mods/.claude-plugin/marketplace.json"))).toBe(true);
  const profile = JSON.parse(readFileSync(join(repo, "profile/twin.json"), "utf8"));
  expect(profile.name).toBe("nok");
  expect(profile.schedule).toBe(false);
}, 120_000);

test("update refuses while an engine file has the owner's own edits, and names the file", () => {
  publish("README.md", "\nanother\n", "readme: another line");
  const head = sh(repo, ["git", "rev-parse", "HEAD"]);
  writeFileSync(join(repo, "docs/design.md"), "mine\n");
  const r = twin(["update"]);
  expect(r.code).toBe(1);
  expect(r.err).toContain("docs/design.md");
  expect(sh(repo, ["git", "rev-parse", "HEAD"])).toBe(head);
  sh(repo, ["git", "checkout", "--", "docs/design.md"]);
}, 120_000);

test("update reruns setup even when nothing is new, so a rerun repairs a broken install", () => {
  rmSync(join(repo, "mods/.claude-plugin/marketplace.json"));
  expect(twin(["update"]).code).toBe(0);
  rmSync(join(repo, "mods/.claude-plugin/marketplace.json"));
  const r = twin(["update"]);
  expect(r.code).toBe(0);
  expect(r.out).toContain("เป็นรุ่นล่าสุดของ origin/main แล้ว");
  expect(r.out).toContain("ตั้งค่าซ้ำแล้ว");
  expect(existsSync(join(repo, "mods/.claude-plugin/marketplace.json"))).toBe(true);
}, 120_000);

test("an owner whose profile predates the schedule flag keeps no schedule when none is installed", () => {
  const file = join(repo, "profile/twin.json");
  const { schedule: _, ...rest } = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify(rest));
  rmSync(join(home, "Library"), { recursive: true, force: true });
  expect(twin(["update"]).code).toBe(0);
  expect(JSON.parse(readFileSync(file, "utf8")).schedule).toBe(false);
  expect(existsSync(join(home, "Library/LaunchAgents"))).toBe(false);
}, 120_000);

test("plain setup keeps the owner's schedule choice, and --schedule turns it back on", () => {
  const file = join(repo, "profile/twin.json");
  const schedule = () => JSON.parse(readFileSync(file, "utf8")).schedule;
  expect(twin(["setup", "--no-sync"]).code).toBe(0);
  expect(schedule()).toBe(false);
  expect(twin(["setup", "--no-sync", "--schedule"]).code).toBe(0);
  expect(schedule()).toBe(true);
  expect(twin(["setup", "--no-sync", "--no-schedule"]).code).toBe(0);
  expect(schedule()).toBe(false);
  rmSync(join(home, "Library"), { recursive: true, force: true });
}, 120_000);

test("update names an untracked file of the owner's that the new engine would overwrite", () => {
  sh(author, ["git", "pull", "-q", "--ff-only"]);
  writeFileSync(join(author, "docs/zz-new.md"), "export {};\n");
  sh(author, ["git", "add", "docs/zz-new.md"]);
  sh(author, ["git", "commit", "-qm", "docs: zz"]);
  sh(author, ["git", "push", "-q"]);
  writeFileSync(join(repo, "docs/zz-new.md"), "mine\n");
  const r = twin(["update"]);
  expect(r.code).toBe(1);
  expect(r.err).toContain("docs/zz-new.md");
  rmSync(join(repo, "docs/zz-new.md"));
  expect(twin(["update"]).code).toBe(0);
}, 120_000);

test("update refuses to merge when the checkout has commits the upstream lacks", () => {
  publish("README.md", "\nupstream\n", "readme: upstream line");
  appendFileSync(join(repo, "README.md"), "\nlocal\n");
  sh(repo, ["git", "commit", "-qam", "local work"]);
  const r = twin(["update"]);
  expect(r.code).toBe(1);
  expect(r.err).toContain("1 commit ที่ origin/main ไม่มี");
}, 120_000);

test("update rolls back to the old engine when the new one cannot install its dependencies", () => {
  sh(repo, ["git", "reset", "-q", "--hard", "origin/main"]);
  sh(author, ["git", "pull", "-q", "--ff-only"]);
  const pkg = JSON.parse(readFileSync(join(author, "package.json"), "utf8"));
  writeFileSync(join(author, "package.json"), JSON.stringify({ ...pkg, dependencies: { ...pkg.dependencies, "left-pad": "1.3.0" } }, null, 2));
  sh(author, ["git", "commit", "-qam", "deps: a package without its lockfile"]);
  sh(author, ["git", "push", "-q"]);
  const head = sh(repo, ["git", "rev-parse", "HEAD"]);
  const r = twin(["update"]);
  expect(r.code).toBe(1);
  expect(r.err).toContain("ถอยกลับไปรุ่นเดิม");
  expect(sh(repo, ["git", "rev-parse", "HEAD"])).toBe(head);
  expect(sh(repo, ["git", "status", "--porcelain", "--untracked-files=no"])).toBe("");
}, 120_000);
