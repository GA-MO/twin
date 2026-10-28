import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bossExport, devTranscripts } from "../evals/fixtures/history.ts";

const SOURCE = dirname(import.meta.dir);
let work = "";
let repo = "";
let home = "";

function twin(args: string[], stdin = "", extra: Record<string, string> = {}) {
  const r = Bun.spawnSync([process.execPath, join(repo, "twin.ts"), ...args], { cwd: repo, env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, "AppData/Local"), PATH: "/usr/bin:/bin", CLAUDE_CODE_SESSION_ID: "", ...extra }, stdin: new Blob([stdin]) });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "twin-setup-"));
  repo = join(work, "repo");
  home = join(work, "home");
  const files = Bun.spawnSync(["git", "-C", SOURCE, "ls-files", "--cached", "--others", "--exclude-standard"]).stdout.toString().split("\n").filter((f) => f && f !== "node_modules");
  for (const f of files) if (existsSync(join(SOURCE, f))) cpSync(join(SOURCE, f), join(repo, f), { recursive: true });
  symlinkSync(join(SOURCE, "node_modules"), join(repo, "node_modules"));
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(
    join(home, ".claude/settings.json"),
    JSON.stringify({ model: "opus", hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }),
  );
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

test("setup names the agent, installs its mode skill and hook, and keeps the owner's settings", () => {
  const r = twin(["setup", "nok", "--no-schedule"]);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  const profile = JSON.parse(readFileSync(join(repo, "profile/twin.json"), "utf8"));
  expect(profile.name).toBe("nok");
  expect(profile.capabilities.pstack).toBe(false);
  expect(profile.onboarded).toBeNull();
  expect(readFileSync(join(home, ".claude/skills/nok-mode/SKILL.md"), "utf8")).toContain("name: nok-mode");
  const settings = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  expect(settings.model).toBe("opus");
  const commands = settings.hooks.SessionStart.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
  expect(commands).toContain("echo mine");
  expect(commands.filter((c: string) => c.endsWith('twin.ts" mode'))).toHaveLength(1);
}, 120_000);

test("running setup again changes nothing it already did", () => {
  expect(twin(["setup", "--no-schedule"]).code).toBe(0);
  const settings = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  expect(settings.hooks.SessionStart).toHaveLength(2);
}, 120_000);

test("project scope keeps the hook and the mode skill inside this repo, and global brings them back", () => {
  const hooks = (file: string) => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).hooks?.SessionStart ?? []) : []).flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
  const globalFile = join(home, ".claude/settings.json");
  const localFile = join(repo, ".claude/settings.local.json");
  expect(twin(["setup", "--scope", "project", "--no-schedule"]).code).toBe(0);
  expect(hooks(localFile).filter((c: string) => c.endsWith('twin.ts" mode'))).toHaveLength(1);
  expect(hooks(globalFile)).toEqual(["echo mine"]);
  expect(existsSync(join(repo, ".claude/skills/nok-mode/SKILL.md"))).toBe(true);
  expect(existsSync(join(home, ".claude/skills/nok-mode"))).toBe(false);
  expect(JSON.parse(readFileSync(localFile, "utf8")).enabledPlugins["twin@twin-mods"]).toBe(true);
  expect(twin(["setup", "--no-schedule"]).code).toBe(0);
  expect(hooks(localFile).filter((c: string) => c.endsWith('twin.ts" mode'))).toHaveLength(1);
  expect(twin(["setup", "--scope", "global", "--no-schedule"]).code).toBe(0);
  expect(hooks(localFile)).toEqual([]);
  expect(hooks(globalFile).filter((c: string) => c.endsWith('twin.ts" mode'))).toHaveLength(1);
  expect(existsSync(join(home, ".claude/skills/nok-mode/SKILL.md"))).toBe(true);
  expect(existsSync(join(repo, ".claude/skills/nok-mode"))).toBe(false);
  expect(JSON.parse(readFileSync(join(repo, "profile/twin.json"), "utf8")).bun).toBe(process.execPath);
}, 120_000);

test("a name that cannot be a skill name is refused with the rule", () => {
  const r = twin(["setup", "Nok Boss", "--no-schedule"]);
  expect(r.code).toBe(1);
  expect(r.err).toContain("a-z");
});

test("the brief and the mode hook speak as the named agent and point at onboard", () => {
  const brief = twin(["brief"]).out;
  expect(brief).toStartWith("# nok ·");
  expect(brief).toContain("พิมพ์ onboard");
  const mode = twin(["mode"]).out;
  expect(mode).toContain("You work for your owner as nok");
  expect(mode).not.toContain("poteto");
});

test("the profile file is written only through the CLI", () => {
  const deny = twin(["guard"], JSON.stringify({ tool_input: { file_path: join(repo, "profile/twin.json") } })).out;
  expect(deny).toContain('"permissionDecision":"deny"');
  const allow = twin(["guard"], JSON.stringify({ tool_input: { file_path: join(repo, "profile/mode/SKILL.md") } })).out;
  expect(allow).toBe("");
  expect(twin(["profile", "collector.radar=on", "onboarded=today"]).code).toBe(0);
  const profile = JSON.parse(readFileSync(join(repo, "profile/twin.json"), "utf8"));
  expect(profile.collectors.radar).toBe(true);
  expect(profile.onboarded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(twin(["brief"]).out).not.toContain("พิมพ์ onboard");
});

test("a new name that collides with the owner's own skill changes nothing", () => {
  mkdirSync(join(home, ".claude/skills/boss-mode"), { recursive: true });
  const r = twin(["setup", "boss", "--no-schedule"]);
  expect(r.code).toBe(1);
  expect(JSON.parse(readFileSync(join(repo, "profile/twin.json"), "utf8")).name).toBe("nok");
  expect(readFileSync(join(home, ".claude/skills/nok-mode/SKILL.md"), "utf8")).toContain("name: nok-mode");
});

test("backup snapshots the owner's files to a private ref, even with no git identity, and never moves the checked-out branch", () => {
  const git = (...a: string[]) => Bun.spawnSync(["git", "-C", repo, ...a], { env: { ...process.env, HOME: home, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).stdout.toString().trim();
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "template");
  const head = git("rev-parse", "HEAD");
  rmSync(join(repo, "state/backup.log"), { force: true });
  writeFileSync(join(repo, "profile/conversations.json"), "[]");
  writeFileSync(join(repo, "profile/export.zip"), "zip");
  const noIdentity = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.useConfigOnly", GIT_CONFIG_VALUE_0: "true" };
  const r = twin(["sync"], "", noIdentity);
  expect(r.code).toBe(0);
  expect(r.out).toContain("บันทึก snapshot ใหม่");
  expect(git("rev-parse", "HEAD")).toBe(head);
  expect(git("status", "--porcelain")).toBe("");
  expect(git("ls-tree", "-r", "--name-only", "refs/twin/backup")).toContain("profile/twin.json");
  expect(git("branch", "--list")).not.toContain("twin-backup");
  const tree = git("ls-tree", "-r", "--name-only", "refs/twin/backup");
  expect(tree).not.toContain("conversations.json");
  expect(tree).not.toContain("export.zip");
}, 120_000);

test("history is read only after consent, keeps only the owner's own words, and says how much there is", () => {
  devTranscripts(join(home, ".claude/projects"), join(home, "Development"));
  const exported = join(work, "conversations.json");
  bossExport(exported);
  expect(twin(["sync", "history"]).out).toContain("history: off");
  expect(twin(["profile", "source.claudeCode=on", `source.claudeAi=${exported}`]).code).toBe(0);
  expect(twin(["sync", "history"]).out).toContain("history: ok");
  const index = readFileSync(join(repo, "state/history/index.md"), "utf8");
  expect(index).toContain("ระดับ: มาก");
  const messages = readFileSync(join(repo, "state/history/messages.jsonl"), "utf8");
  expect(messages).toContain("อย่า mock db");
  expect(messages).toContain("ฮาล์ฟมาราธอน");
  expect(messages).not.toContain("not the owner");
  expect(messages).not.toContain("system-reminder");
  expect(messages).not.toContain("คำตอบของ Claude");
}, 120_000);

test("a broken export record or a missing file costs only that record or source", () => {
  const broken = join(work, "broken.json");
  writeFileSync(broken, JSON.stringify([{ name: "x", chat_messages: null }, { name: "y", chat_messages: [{ sender: "human", created_at: "garbage", text: "bad date" }, { sender: "human", created_at: "2026-10-20T10:00:00Z", text: "ข้อความที่ใช้ได้" }] }]));
  expect(twin(["profile", `source.claudeAi=${broken}`]).code).toBe(0);
  expect(readFileSync(join(repo, "state/history/messages.jsonl"), "utf8")).toContain("ข้อความที่ใช้ได้");
  rmSync(broken);
  expect(twin(["sync", "history"]).out).toContain("history: ok");
  const index = readFileSync(join(repo, "state/history/index.md"), "utf8");
  expect(index).toContain("อ่านไม่ได้: claude.ai export");
  expect(readFileSync(join(repo, "state/history/messages.jsonl"), "utf8")).toContain("อย่า mock db");
}, 120_000);

test("withdrawing consent removes what was collected, and history the owner switched off stays off", () => {
  expect(twin(["profile", "source.claudeCode=off", "source.claudeAi=none"]).code).toBe(0);
  expect(existsSync(join(repo, "state/history/messages.jsonl"))).toBe(false);
  expect(twin(["profile", "collector.history=off", "source.claudeCode=on"]).code).toBe(0);
  expect(existsSync(join(repo, "state/history/messages.jsonl"))).toBe(false);
  expect(twin(["profile", "collector.history=on", "source.claudeCode=off"]).code).toBe(0);
});

test("the mode hook prints red lines and autonomy from the identity files", () => {
  writeFileSync(join(repo, "profile/red-lines.json"), JSON.stringify({ redLines: [{ id: "price", never: "บอกราคากับลูกค้า", why: "คุยเอง", source: "ข้อ 3" }] }));
  writeFileSync(join(repo, "profile/autonomy.json"), JSON.stringify({ categories: [{ id: "spend", name: "อนุมัติเงิน", level: "ask", why: "เพิ่งเริ่ม", source: "ข้อ 4" }] }));
  const mode = twin(["mode"]).out;
  expect(mode).toContain("ห้ามบอกราคากับลูกค้า");
  expect(mode).toContain("| อนุมัติเงิน | ถามก่อนทุกครั้ง |");
  writeFileSync(join(repo, "profile/rules.json"), "{ not json");
  expect(twin(["identity"]).code).toBe(1);
  expect(twin(["brief"]).out).toContain("ไฟล์ตัวตนอ่านไม่ได้");
});

test("a run belongs to the session that sent it: others see it apart, take moves it, runs --json carries the report and no money", () => {
  const project = join(work, "proj");
  const git = (...a: string[]) => Bun.spawnSync(["git", "-C", project, ...a], { env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  mkdirSync(project, { recursive: true });
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "base");
  git("branch", "twin/x");
  const id = "1028-0100-proj-x";
  const dir = join(repo, "runs", id);
  mkdirSync(join(dir, "turn-1"), { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify({ id, agent: "nok", project: "proj", repo: project, slug: "x", worktree: join(project, ".claude/worktrees/twin-x"), branch: "twin/x", base: "main", session: "s", port: 4101, startedAt: new Date().toISOString() }));
  writeFileSync(join(dir, "owner"), "other");
  for (const [f, v] of [["pid", "1"], ["exit", "0"], ["head", ""]]) writeFileSync(join(dir, "turn-1", f!), v!);
  const report = { outcome: "needs-approval", did: "built the page", pending: "push", discovered: "-", verified: "clicked it", clicked: [], removed: [], ideas: [], gates_requested: ["push"] };
  writeFileSync(join(dir, "turn-1/result.json"), JSON.stringify({ subtype: "success", is_error: false, total_cost_usd: 3.5, structured_output: report }));
  const me = { CLAUDE_CODE_SESSION_ID: "me" };
  const json = JSON.parse(twin(["runs", "--json"], "", me).out);
  expect(json.runs[0].owner).toBe("other");
  expect(json.runs[0].report.did).toBe("built the page");
  expect(JSON.stringify(json)).not.toMatch(/cost|spent|usd/i);
  expect(twin(["runs"], "", me).out).toContain("จาก session อื่น");
  expect(twin(["brief"], "", me).out).toContain("session อื่น: proj/x");
  const refused = twin(["followup", id, "go on"], "", me);
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("--take");
  expect(twin(["take", id], "", me).code).toBe(0);
  expect(readFileSync(join(dir, "owner"), "utf8")).toBe("me");
  expect(twin(["brief"], "", me).out).not.toContain("session อื่น: proj/x");
}, 120_000);

test("a run whose session has closed belongs to whoever picks it up next", () => {
  const id = "1028-0100-proj-x";
  writeFileSync(join(repo, "runs", id, "owner"), "gone");
  const bin = join(work, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "claude"), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  const env = { CLAUDE_CODE_SESSION_ID: "me", PATH: `${bin}:/usr/bin:/bin` };
  expect(twin(["brief"], "", env).out).not.toContain("session อื่น: proj/x");
  expect(twin(["runs"], "", env).out).not.toContain("จาก session อื่น");
  expect(JSON.parse(twin(["runs", "--json"], "", env).out).runs[0].ownerSession).toEqual({ state: "closed" });
  expect(twin(["take", id], "", { PATH: "/usr/bin:/bin", CLAUDE_CODE_SESSION_ID: "" }).code).toBe(1);
}, 120_000);

test("uninstall removes the hook, the skill link, the mod and the schedule files, and keeps the owner's data", () => {
  expect(twin(["setup", "--scope", "global"]).code).toBe(0);
  const out = twin(["uninstall"]);
  expect(out.code).toBe(0);
  const hooks = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8")).hooks.SessionStart.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
  expect(hooks).toEqual(["echo mine"]);
  expect(existsSync(join(home, ".claude/skills/nok-mode"))).toBe(false);
  expect(JSON.parse(readFileSync(join(repo, ".claude/settings.local.json"), "utf8")).enabledPlugins["twin@twin-mods"]).toBeUndefined();
  if (process.platform === "darwin") expect(Bun.spawnSync(["ls", join(home, "Library/LaunchAgents")]).stdout.toString().trim()).toBe("");
  expect(existsSync(join(repo, "profile/twin.json"))).toBe(true);
}, 120_000);
