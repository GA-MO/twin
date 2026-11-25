import { afterAll, beforeAll, expect, test } from "bun:test";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { localeLang } from "../lib/lang.ts";
import { bossExport, devTranscripts } from "../evals/fixtures/history.ts";

const SOURCE = dirname(import.meta.dir);
let work = "";
let repo = "";
let home = "";

function twin(args: string[], stdin = "", extra: Record<string, string> = {}) {
  const r = Bun.spawnSync([process.execPath, join(repo, "twin.ts"), ...args], { cwd: repo, env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, "AppData/Local"), PATH: "/usr/bin:/bin", CLAUDE_CODE_SESSION_ID: "", TWIN_LANG: "th", TZ: Intl.DateTimeFormat().resolvedOptions().timeZone, ...extra }, stdin: new Blob([stdin]) });
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
  writeFileSync(join(home, ".claude/CLAUDE.md"), "my own rules\n");
  writeFileSync(
    join(home, ".claude/settings.json"),
    JSON.stringify({ model: "opus", hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo mine" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo guard" }] }] }, permissions: { defaultMode: "auto", allow: ["Bash(ls)"], deny: ["Bash(rm)"] } }),
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
  expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toBe(`my own rules\n\n@${join(realpathSync(repo), "state/mode.md")}\n`);
}, 120_000);

test("setup speaks English on a computer set to English, and Thai on one set to the Thai language or region", () => {
  const en = twin(["setup", "--no-schedule"], "", { TWIN_LANG: "en" });
  expect(en.code).toBe(0);
  expect(en.out).toContain("no schedule (--no-schedule)");
  expect(en.out).toContain("Ready: open the Code tab in Claude Desktop");
  expect(en.out).not.toMatch(/[ก-๙]/);
  expect(twin(["setup", "--no-schedule", "--no-sync"]).out).toContain("ข้ามตารางเวลา (--no-schedule)");
  expect(["th_TH.UTF-8", "en_TH", "th", "en_US.UTF-8", "en-GB", "C.UTF-8"].map(localeLang)).toEqual(["th", "th", "th", "en", "en", "en"]);
}, 120_000);

test("the journal reads no prompt or commit before the owner says yes, and setup says what waits for that yes", () => {
  const transcript = join(home, ".claude/projects/-work-app");
  mkdirSync(transcript, { recursive: true });
  const line = { type: "user", timestamp: new Date().toISOString(), cwd: join(realpathSync(repo), "x"), message: { role: "user", content: "a private prompt" } };
  writeFileSync(join(transcript, "s.jsonl"), `${JSON.stringify(line)}\n`);
  const setup = twin(["setup", "--no-schedule"]);
  expect(setup.out).toContain("ยังไม่อ่าน prompt ที่คุณพิมพ์ใน Claude Code, ประวัติ claude.ai, commit ของคุณใน git จนกว่าคุณจะตอบว่าให้อ่านตอน onboard");
  expect(twin(["sync", "journal"]).out).toContain("journal: off");
  const today = new Date().toLocaleDateString("sv-SE");
  expect(existsSync(join(repo, "journal", `${today}.md`))).toBe(false);
  expect(twin(["profile", "source.claudeCode=on"]).code).toBe(0);
  expect(twin(["sync", "journal"]).out).toContain("journal: ok");
  expect(readFileSync(join(repo, "journal", `${today}.md`), "utf8")).toContain("a private prompt");
  expect(twin(["profile", "source.claudeCode=off"]).code).toBe(0);
  rmSync(transcript, { recursive: true, force: true });
}, 120_000);

test("consent shows each source, allows and withdraws one at a time, and refuses what it cannot mean", () => {
  const shown = twin(["consent"]);
  expect(shown.code).toBe(0);
  expect(shown.out).toContain("· Claude Code · ยังไม่ให้");
  expect(shown.out).toContain("· claude.ai · ยังไม่ให้");
  expect(shown.out).toContain("· git · ยังไม่ให้");
  expect(twin(["consent", "claudeCode", "on"]).code).toBe(0);
  expect(twin(["consent"]).out).toContain("✓ Claude Code · ให้อ่าน");
  const off = twin(["consent", "claudeCode", "off"]);
  expect(off.code).toBe(0);
  expect(off.out).toContain("หยุดอ่าน Claude Code แล้ว · ลบ state/history แล้ว เพราะไม่เหลือแหล่งที่ให้อ่าน");
  expect(existsSync(join(repo, "state/history/index.md"))).toBe(false);
  expect(twin(["consent", "claudeCode", "off"]).out).not.toContain("หยุดอ่าน");
  const notExport = join(work, "not-an-export.json");
  writeFileSync(notExport, "{}");
  for (const args of [["consent", "slack", "on"], ["consent", "git"], ["consent", "git", "yes"], ["consent", "git", "on", "off"], ["consent", "claudeAi", "on"], ["consent", "claudeAi", "none"], ["consent", "claudeAi", ""], ["consent", "toString", "on"], ["consent", "claudeAi", notExport]]) {
    const r = twin(args);
    expect(r.code).toBe(1);
    expect(r.err.length).toBeGreaterThan(0);
  }
  expect(JSON.parse(readFileSync(join(repo, "profile/twin.json"), "utf8")).sources).toMatchObject({ claudeCode: false, claudeAi: null, git: false });
}, 120_000);

const marketplace = (): string => JSON.parse(readFileSync(join(repo, "mods/.claude-plugin/marketplace.json"), "utf8")).name;

test("the mod's marketplace is named for this checkout, so another twin clone on the machine cannot take it over", () => {
  const localFile = join(repo, ".claude/settings.local.json");
  const before = marketplace();
  expect(before).toMatch(/^twin-mods-[0-9a-f]{8}$/);
  const legacy = { extraKnownMarketplaces: { "twin-mods": { source: { source: "directory", path: "/tmp/gone/mods" } }, other: { source: { source: "directory", path: "/x" } } }, enabledPlugins: { "twin@twin-mods": true, "keep@other": true } };
  writeFileSync(localFile, JSON.stringify(legacy));
  expect(twin(["setup", "--no-schedule"]).code).toBe(0);
  const local = JSON.parse(readFileSync(localFile, "utf8"));
  expect(marketplace()).toBe(before);
  expect(Object.keys(local.extraKnownMarketplaces).sort()).toEqual([before, "other"].sort());
  expect(local.extraKnownMarketplaces[before].source.path).toBe(realpathSync(join(repo, "mods")));
  expect(local.enabledPlugins).toEqual({ "keep@other": true, [`twin@${before}`]: true });
}, 120_000);

test("a session start rebuilds the mod's marketplace after a pull removed the manifest or left the old shared name", () => {
  const localFile = join(repo, ".claude/settings.local.json");
  const ours = marketplace();
  rmSync(join(repo, "mods/.claude-plugin/marketplace.json"));
  writeFileSync(localFile, JSON.stringify({ extraKnownMarketplaces: { "twin-mods": { source: { source: "directory", path: join(repo, "mods") } } }, enabledPlugins: { "twin@twin-mods": true } }));
  expect(twin(["mode"]).code).toBe(0);
  expect(marketplace()).toBe(ours);
  expect(Object.keys(JSON.parse(readFileSync(localFile, "utf8")).extraKnownMarketplaces)).toEqual([ours]);
  writeFileSync(localFile, JSON.stringify({ enabledPlugins: {} }));
  rmSync(join(repo, "mods/.claude-plugin/marketplace.json"));
  expect(twin(["mode"]).code).toBe(0);
  expect(existsSync(join(repo, "mods/.claude-plugin/marketplace.json"))).toBe(false);
  expect(twin(["setup", "--no-schedule"]).code).toBe(0);
}, 120_000);

test("a mod the owner turned off stays off when its marketplace is renamed", () => {
  const localFile = join(repo, ".claude/settings.local.json");
  writeFileSync(localFile, JSON.stringify({ extraKnownMarketplaces: { "twin-mods": { source: { source: "directory", path: join(repo, "mods") } } }, enabledPlugins: { "twin@twin-mods": false } }));
  expect(twin(["mode"]).code).toBe(0);
  expect(JSON.parse(readFileSync(localFile, "utf8")).enabledPlugins).toEqual({ [`twin@${marketplace()}`]: false });
  writeFileSync(localFile, JSON.stringify({}));
  expect(twin(["setup", "--no-schedule"]).code).toBe(0);
}, 120_000);

test("setup forgets only the twin marketplaces Claude registered for this checkout or for a folder that is gone", () => {
  const bin = join(work, "fake-claude");
  const removed = join(work, "removed.txt");
  mkdirSync(bin, { recursive: true });
  const listed = [
    { name: "twin-mods", path: realpathSync(join(repo, "mods")) },
    { name: "twin-mods-deadbeef", path: join(work, "gone/mods") },
    { name: "twin-mods-live0001", path: work },
    { name: "twin-mods-nopath01", source: "github" },
    { name: "other-mods", path: join(work, "gone/other") },
    { name: marketplace(), path: realpathSync(join(repo, "mods")) },
  ];
  writeFileSync(join(bin, "claude"), `#!/bin/sh\nif [ "$3" = list ]; then echo '${JSON.stringify(listed)}'; elif [ "$3" = remove ]; then echo "$4" >> ${removed}; fi\n`, { mode: 0o755 });
  expect(twin(["setup", "--no-schedule"], "", { PATH: `${bin}:/usr/bin:/bin` }).code).toBe(0);
  expect(readFileSync(removed, "utf8").trim().split("\n")).toEqual(["twin-mods", "twin-mods-deadbeef"]);
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
  expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toBe("my own rules\n");
  expect(existsSync(join(repo, ".claude/skills/nok-mode/SKILL.md"))).toBe(true);
  expect(existsSync(join(home, ".claude/skills/nok-mode"))).toBe(false);
  expect(JSON.parse(readFileSync(localFile, "utf8")).enabledPlugins[`twin@${marketplace()}`]).toBe(true);
  expect(twin(["setup", "--no-schedule"]).code).toBe(0);
  expect(hooks(localFile).filter((c: string) => c.endsWith('twin.ts" mode'))).toHaveLength(1);
  expect(twin(["setup", "--scope", "global", "--no-schedule"]).code).toBe(0);
  expect(hooks(localFile)).toEqual([]);
  expect(hooks(globalFile).filter((c: string) => c.endsWith('twin.ts" mode'))).toHaveLength(1);
  expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8").match(/state\/mode\.md/g)).toHaveLength(1);
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
  expect(twin(["mode"]).out).toBe("");
  expect(twin(["mode"], JSON.stringify({ session_id: "s", source: "compact" })).out).toContain("invoke again");
  expect(twin(["mode"], JSON.stringify({ session_id: "s", source: "resume" })).out).toBe("");
  const mode = readFileSync(join(repo, "state/mode.md"), "utf8");
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
  mkdirSync(join(repo, "notes/2026-11-01-qa"), { recursive: true });
  writeFileSync(join(repo, "notes/2026-11-01-qa.md"), "---\nkind: fact\n---\n# qa\n");
  writeFileSync(join(repo, "notes/2026-11-01-qa/shot.PNG"), "png");
  writeFileSync(join(repo, "notes/2026-11-01-qa/run.mp4"), "mp4");
  writeFileSync(join(repo, "notes/2026-11-01-qa/steps.txt"), "steps");
  mkdirSync(join(repo, "profile/invoices/INV-1"), { recursive: true });
  writeFileSync(join(repo, "profile/invoices/INV-1/invoice.pdf"), "pdf");
  writeFileSync(join(repo, "profile/invoices/signature.png"), "png");
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
  expect(tree).toContain("notes/2026-11-01-qa.md");
  expect(tree).toContain("notes/2026-11-01-qa/steps.txt");
  expect(tree).toContain("profile/invoices/INV-1/invoice.pdf");
  expect(tree).toContain("profile/invoices/signature.png");
  expect(tree).not.toContain("shot.PNG");
  expect(tree).not.toContain("run.mp4");
  const held = Bun.spawnSync([process.execPath, "-e", 'import { backupOnlyBytes } from "./lib/backup.ts"; console.log(await backupOnlyBytes());'], { cwd: repo });
  expect(Number(held.stdout.toString())).toBeGreaterThan(0);
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
  expect(messages).toContain("พิมพ์เองจาก Desktop");
  expect(messages).toContain("พิมพ์ผ่านแอปมือถือ");
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
  expect(twin(["mode"]).out).toContain(`read ${join(realpathSync(repo), "state/mode.md")} in full`);
  expect(twin(["mode"]).out).toBe("");
  const mode = readFileSync(join(repo, "state/mode.md"), "utf8");
  expect(mode).toContain("ห้ามบอกราคากับลูกค้า");
  expect(mode).toContain("| อนุมัติเงิน | ถามก่อนทุกครั้ง |");
  const skill = join(repo, "profile/mode/SKILL.md");
  const kept = readFileSync(skill, "utf8");
  writeFileSync(skill, `${kept}\n${"x".repeat(40_000)}\n`);
  const long = twin(["identity"]);
  expect(long.code).toBe(1);
  expect(long.err).toContain("เกินงบ 40,000");
  writeFileSync(skill, kept);
  expect(twin(["identity"]).code).toBe(0);
  writeFileSync(join(repo, "profile/rules.json"), "{ not json");
  expect(twin(["identity"]).code).toBe(1);
  expect(twin(["brief"]).out).toContain("ไฟล์ตัวตนอ่านไม่ได้");
});

test("the mode hooks send Explore and Plan to read the mode, remind a long session of it, and say when it changed", () => {
  const modeFile = join(realpathSync(repo), "state/mode.md");
  const hook = (input: unknown) => {
    const r = Bun.spawnSync([process.execPath, join(repo, "lib/mode-hook.ts")], { cwd: repo, env: { ...process.env, HOME: home, TWIN_LANG: "th" }, stdin: new Blob([typeof input === "string" ? input : JSON.stringify(input)]) });
    expect(r.exitCode).toBe(0);
    return r.stdout.toString();
  };
  const settings = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  const commands = (event: string) => settings.hooks[event].flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
  expect(commands("SessionStart").filter((c: string) => c.endsWith('twin.ts" mode'))).toHaveLength(1);
  for (const event of ["UserPromptSubmit", "PreToolUse"]) expect(commands(event).filter((c: string) => c.endsWith('mode-hook.ts"'))).toHaveLength(1);
  expect(settings.hooks.PreToolUse.at(-1).matcher).toBe("Agent|Task");
  expect(settings.permissions).toEqual({ defaultMode: "auto", allow: ["Bash(ls)", `Read(/${modeFile})`], deny: ["Bash(rm)"] });
  expect(settings.hooks.PreToolUse[0]).toEqual({ matcher: "Bash", hooks: [{ type: "command", command: "echo guard" }] });

  const lent = JSON.parse(hook({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: "Explore", description: "d", prompt: "find x" } })).hookSpecificOutput;
  expect(lent.permissionDecision).toBe("allow");
  expect(lent.updatedInput).toMatchObject({ subagent_type: "Explore", description: "d" });
  expect(lent.updatedInput.prompt).toStartWith(`find x\n\nBefore you start, read ${modeFile} in full`);
  expect(hook({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: "general-purpose", prompt: "find x" } })).toBe("");
  for (const odd of ["", "not json", "{}", JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s", transcript_path: 5 })]) expect(hook(odd)).toBe("");

  const rule = (id: string, text: string) => ({ id, layer: "tools", rule: text, why: "w", source: "s", status: "stated" });
  writeFileSync(join(repo, "profile/rules.json"), JSON.stringify({ rules: [rule("chrome", "ทดสอบบน Chrome"), rule("short", "ตอบสั้น")] }));
  const tag = (rule: string, daysAgo: number, agentFault = true) => JSON.stringify({ key: `k${Math.random()}`, at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), project: null, rule, cause: "c", agentFault });
  mkdirSync(join(repo, "state/reflect"), { recursive: true });
  writeFileSync(join(repo, "state/reflect/tags.jsonl"), [tag("chrome", 1), tag("chrome", 3), tag("short", 2), tag("short", 40), tag("short", 1, false)].join("\n"));
  const transcript = join(work, "transcript.jsonl");
  const assistant = (tokens: number, extra: object = {}) => JSON.stringify({ type: "assistant", ...extra, message: { model: "claude-test", usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: tokens } } });
  const turn = (tokens: number, extra: object = {}) => appendFileSync(transcript, `${JSON.stringify({ type: "user", message: { content: "x".repeat(500_000) } })}\n${assistant(tokens, extra)}\n`);
  const prompt = (id = "s1") => hook({ session_id: id, hook_event_name: "UserPromptSubmit", transcript_path: transcript });
  twin(["identity"]);
  expect(twin(["mode"], JSON.stringify({ session_id: "s1", source: "startup" })).out).toBe("");
  writeFileSync(transcript, "");
  turn(88_000);
  expect(prompt()).toBe("");
  turn(150_000);
  expect(prompt()).toBe("");
  turn(190_000);
  const card = prompt();
  expect(card).toContain("nok-mode reminder: this session is long");
  expect(card).toContain("- ห้ามบอกราคากับลูกค้า");
  expect(card).toContain("- ทดสอบบน Chrome (2)");
  expect(card).not.toContain("ตอบสั้น");
  expect(card).not.toContain("changed");
  expect(prompt()).toBe("");
  turn(900_000, { isSidechain: true });
  appendFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { model: "<synthetic>", usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } })}\n`);
  expect(prompt()).toBe("");
  turn(250_000);
  expect(prompt()).toBe("");
  appendFileSync(transcript, `${JSON.stringify({ type: "system", subtype: "compact_boundary" })}\n`);
  expect(prompt()).toBe("");
  turn(112_000);
  expect(prompt()).toBe("");
  turn(200_000);
  expect(prompt()).toBe("");
  turn(215_000);
  expect(prompt()).toContain("reminder");

  writeFileSync(join(repo, "profile/red-lines.json"), JSON.stringify({ redLines: [{ id: "price", never: "บอกราคากับใคร", why: "คุยเอง", source: "ข้อ 3" }] }));
  twin(["identity"]);
  const changed = prompt();
  expect(changed).toContain(`nok-mode changed after this session loaded it. Before any other step, read ${modeFile} in full`);
  expect(changed).not.toContain("reminder");
  expect(prompt()).toBe("");
  expect(prompt("never-started")).toBe("");
  twin(["mode"], JSON.stringify({ session_id: "s2", source: "startup" }));
  writeFileSync(join(repo, "profile/red-lines.json"), JSON.stringify({ redLines: [{ id: "price", never: "บอกราคากับลูกค้า", why: "คุยเอง", source: "ข้อ 3" }] }));
  twin(["identity"]);
  expect(twin(["mode"], JSON.stringify({ session_id: "s2", source: "resume" })).out).toBe("");
  expect(prompt("s2")).toBe("");
  expect(hook({ session_id: "../x", hook_event_name: "UserPromptSubmit", transcript_path: transcript })).toBe("");
  expect(hook({ session_id: "s3", hook_event_name: "UserPromptSubmit", transcript_path: join(work, "missing.jsonl") })).toBe("");
}, 60_000);

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
  const after = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  const hooks = after.hooks.SessionStart.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
  expect(Object.keys(after.hooks)).toEqual(["SessionStart", "PreToolUse"]);
  expect(after.hooks.PreToolUse).toEqual([{ matcher: "Bash", hooks: [{ type: "command", command: "echo guard" }] }]);
  expect(after.permissions).toEqual({ defaultMode: "auto", allow: ["Bash(ls)"], deny: ["Bash(rm)"] });
  expect(hooks).toEqual(["echo mine"]);
  expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toBe("my own rules\n");
  expect(existsSync(join(home, ".claude/skills/nok-mode"))).toBe(false);
  expect(Object.keys(JSON.parse(readFileSync(join(repo, ".claude/settings.local.json"), "utf8")).enabledPlugins).filter((k) => k.startsWith("twin@"))).toEqual([]);
  expect(existsSync(join(repo, "mods/.claude-plugin/marketplace.json"))).toBe(false);
  if (process.platform === "darwin") expect(Bun.spawnSync(["ls", join(home, "Library/LaunchAgents")]).stdout.toString().trim()).toBe("");
  expect(existsSync(join(repo, "profile/twin.json"))).toBe(true);
}, 120_000);

test("uninstall pushes a last backup before it says the folder can go, and says to keep it when there is no copy elsewhere", () => {
  const git = (...a: string[]) => Bun.spawnSync(["git", "-C", repo, ...a], { env: { ...process.env, HOME: home } });
  expect(twin(["uninstall"]).out).toContain("ลบโฟลเดอร์นี้แล้วข้อมูลหายถาวร");
  git("remote", "add", "backup", join(home, "missing.git"));
  const broken = twin(["uninstall"]);
  expect(broken.out).toContain("อย่าเพิ่งลบโฟลเดอร์นี้");
  expect(broken.out).not.toContain("ลบทั้งโฟลเดอร์นี้ได้");
  const remote = join(home, "backup.git");
  Bun.spawnSync(["git", "init", "-q", "--bare", remote]);
  git("remote", "set-url", "backup", remote);
  const pushed = twin(["uninstall"]);
  expect(pushed.out).toContain("ลบทั้งโฟลเดอร์นี้ได้");
  expect(Bun.spawnSync(["git", "--git-dir", remote, "ls-tree", "-r", "--name-only", "twin-backup"]).stdout.toString()).toContain("profile/twin.json");
  git("remote", "remove", "backup");
}, 120_000);
