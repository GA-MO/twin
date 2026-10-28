import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandbox, type Sandbox } from "./harness.ts";

let s: Sandbox;
let project = "";
let calls = "";

const REPORT = { outcome: "done", did: "ทำแล้ว", pending: "-", discovered: "-", verified: "-", clicked: [], removed: [], ideas: [], gates_requested: [] };

const BRIEF = `ชนิด: bug
ขนาด: เล็ก
เป้าหมาย: ปุ่มบันทึกกดได้
อ้างอิง: src/save.ts
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: กดแล้วบันทึก
ลงที่: push branch นี้เท่านั้น
อาการ: กดแล้วเงียบ
คงไว้: หน้ารายการ`;

beforeAll(() => {
  s = sandbox("twin-dispatch-");
  calls = join(s.work, "claude-calls.log");
  writeFileSync(
    join(s.bin, "claude"),
    `#!/bin/sh\nif [ "$1" = agents ]; then echo "[]"; exit 0; fi\ncat > /dev/null\necho "$PWD $*" >> ${JSON.stringify(calls)}\nprintf '%s' '${JSON.stringify({ subtype: "success", is_error: false, result: "ok", structured_output: REPORT })}'\n`,
    { mode: 0o755 },
  );
  project = join(s.work, "proj");
  mkdirSync(project, { recursive: true });
  s.git(project, "init", "-q", "-b", "main");
  s.git(project, "commit", "-q", "--allow-empty", "-m", "base");
  expect(s.twin(["setup", "gamo", "--no-schedule"]).code).toBe(0);
}, 120_000);

afterAll(() => s.remove());

const idFrom = (out: string) => out.match(/ส่งแล้ว (\S+)/)?.[1] ?? "";

test("a worker's branch and worktree are named after the agent in the profile", () => {
  const sent = s.twin(["dispatch", project, "save-btn"], BRIEF);
  expect(sent.err).toBe("");
  expect(sent.out).toContain("gamo/save-btn");
  const id = idFrom(sent.out);
  expect(existsSync(join(project, ".claude/worktrees/gamo-save-btn"))).toBe(true);
  expect(s.git(project, "branch", "--list", "gamo/save-btn")).toContain("gamo/save-btn");
  expect(JSON.parse(readFileSync(join(s.repo, "runs", id, "run.json"), "utf8")).agent).toBe("gamo");
  expect(s.twin(["wait", id]).out).toContain("ทำแล้ว");
  expect(s.twin(["close", id]).code).toBe(0);
  expect(existsSync(join(project, ".claude/worktrees/gamo-save-btn"))).toBe(false);
}, 120_000);

test("a brief naming a secret the store does not have is refused before any worktree exists", () => {
  const r = s.twin(["dispatch", project, "needs-key"], BRIEF.replace("ชนิด: bug", "ชนิด: bug\nsecret: twin-test-absent-key"));
  expect(r.code).toBe(1);
  expect(r.err).toContain("bun twin.ts secret twin-test-absent-key");
  expect(existsSync(join(project, ".claude/worktrees/gamo-needs-key"))).toBe(false);
}, 120_000);

test("a run written by an earlier engine, with no agent field, still lists, follows up and closes, and close sweeps merged delegate worktrees", () => {
  const wt = (dir: string, branch: string) => s.git(project, "worktree", "add", "-q", "-b", branch, join(project, ".claude/worktrees", dir), "main");
  wt("gamo-old", "gamo/old");
  wt("agent-merged", "gamo/old-helper");
  wt("agent-wip", "gamo/wip");
  s.git(join(project, ".claude/worktrees/agent-wip"), "commit", "-q", "--allow-empty", "-m", "wip");
  wt("agent-other", "someone/else");
  const id = "1022-1107-proj-old";
  const dir = join(s.repo, "runs", id);
  mkdirSync(join(dir, "turn-1"), { recursive: true });
  writeFileSync(
    join(dir, "run.json"),
    JSON.stringify({ id, project: "proj", repo: project, slug: "old", worktree: join(project, ".claude/worktrees/gamo-old"), branch: "gamo/old", base: "main", session: "11111111-2222-3333-4444-555555555555", port: 4102, startedAt: "2026-10-22T04:07:00.000Z", budgetUsd: 5 }),
  );
  writeFileSync(join(dir, "owner"), "a-session-that-closed");
  writeFileSync(join(dir, "contract.md"), "old contract");
  for (const [f, v] of [["pid", "1"], ["exit", "0"], ["prompt.md", "go"]]) writeFileSync(join(dir, "turn-1", f!), v!);
  writeFileSync(join(dir, "turn-1/result.json"), JSON.stringify({ subtype: "success", is_error: false, structured_output: { ...REPORT, outcome: "needs-input", question: "สีไหน", inputs_tried: [] } }));

  const me = { CLAUDE_CODE_SESSION_ID: "me" };
  expect(s.twin(["runs"], "", me).out).toContain(`${id} · finished · turn 1`);
  const json = JSON.parse(s.twin(["runs", "--json"], "", me).out);
  expect(json.runs.find((r: { id: string }) => r.id === id).report.question).toBe("สีไหน");

  const sent = s.twin(["followup", id, "สีน้ำเงิน"], "", me);
  expect(sent.err).toBe("");
  expect(s.twin(["wait", id], "", me).out).toContain(`${id} · finished · turn 2`);
  expect(readFileSync(calls, "utf8")).toContain("--resume 11111111-2222-3333-4444-555555555555");
  expect(readFileSync(join(dir, "turn-2/prompt.md"), "utf8")).toBe("สีน้ำเงิน");

  const blocker = join(s.repo, "runs", "1022-1200-proj-open");
  mkdirSync(join(blocker, "turn-1"), { recursive: true });
  writeFileSync(join(blocker, "run.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(dir, "run.json"), "utf8")), id: "1022-1200-proj-open", repo: `${project}/`, worktree: join(project, ".claude/worktrees/gamo-open") }));
  for (const [f, v] of [["pid", "1"], ["exit", "0"], ["result.json", "{}"], ["err.log", ""]]) writeFileSync(join(blocker, "turn-1", f!), v!);
  mkdirSync(join(s.repo, "runs", "1022-1300-broken"), { recursive: true });
  writeFileSync(join(s.repo, "runs", "1022-1300-broken", "run.json"), "{ not json");
  wt("agent-scratch", "gamo/scratch");
  mkdirSync(join(project, ".claude/worktrees/agent-scratch/.twin-scratch"));
  writeFileSync(join(project, ".claude/worktrees/agent-scratch/.twin-scratch/still.png"), "png");
  s.git(project, "config", "core.excludesFile", join(s.work, "ignore"));
  writeFileSync(join(s.work, "ignore"), ".twin-scratch/\n");

  expect(s.twin(["runs"], "", me).out).toContain(id);
  const closed = s.twin(["close", id], "", me);
  expect(closed.err).toBe("");
  expect(closed.out).not.toContain("delegate");
  expect(existsSync(join(project, ".claude/worktrees/agent-merged"))).toBe(true);
  writeFileSync(join(blocker, "closed.md"), "closed");
  const reopen = (slug: string) => {
    s.git(project, "worktree", "add", "-q", "-b", `gamo/${slug}`, join(project, ".claude/worktrees", `gamo-${slug}`), "main");
    const file = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
    writeFileSync(join(dir, "run.json"), JSON.stringify({ ...file, worktree: join(project, ".claude/worktrees", `gamo-${slug}`), branch: `gamo/${slug}` }));
    rmSync(join(dir, "closed.md"));
  };
  reopen("again");
  const unreadable = s.twin(["close", id], "", me);
  expect(unreadable.out).toContain("ปิด");
  expect(unreadable.out).not.toContain("delegate");
  expect(existsSync(join(project, ".claude/worktrees/agent-merged"))).toBe(true);
  rmSync(join(s.repo, "runs", "1022-1300-broken"), { recursive: true });
  reopen("third");
  const swept = s.twin(["close", id], "", me);
  expect(swept.err).toBe("");
  expect(swept.out).toContain("ลบ worktree ของ delegate ที่ merge แล้ว 1 อัน");
  expect(existsSync(join(project, ".claude/worktrees/agent-scratch/.twin-scratch/still.png"))).toBe(true);
  expect(existsSync(join(project, ".claude/worktrees/gamo-old"))).toBe(false);
  expect(existsSync(join(project, ".claude/worktrees/agent-merged"))).toBe(false);
  expect(s.git(project, "branch", "--list", "gamo/old-helper")).toBe("");
  expect(existsSync(join(project, ".claude/worktrees/agent-wip"))).toBe(true);
  expect(existsSync(join(project, ".claude/worktrees/agent-other"))).toBe(true);
  expect(s.twin(["runs", id], "", me).out).toContain("closed");
}, 120_000);

test("how many runs may run at once is the owner's setting, kept across setup, and a full queue says how to raise it", () => {
  const profile = () => JSON.parse(readFileSync(join(s.repo, "profile/twin.json"), "utf8"));
  expect(profile().maxRuns).toBe(3);
  expect(s.twin(["profile", "maxRuns=6"]).code).toBe(0);
  expect(s.twin(["setup", "--no-schedule"]).code).toBe(0);
  expect(profile().maxRuns).toBe(6);
  for (const bad of ["0", "-1", "2.5", "abc", "", "21"]) {
    const r = s.twin(["profile", `maxRuns=${bad}`]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("maxRuns ต้องเป็นจำนวนเต็ม 1-20");
  }
  expect(profile().maxRuns).toBe(6);
  expect(s.twin(["profile", "maxRuns=1"]).code).toBe(0);
  const sleeper = Bun.spawn(["sleep", "60"]);
  const busy = join(s.repo, "runs", "1028-0900-proj-busy");
  mkdirSync(join(busy, "turn-1"), { recursive: true });
  writeFileSync(join(busy, "run.json"), JSON.stringify({ id: "1028-0900-proj-busy", agent: "gamo", project: "proj", repo: project, slug: "busy", worktree: join(project, ".claude/worktrees/gamo-busy"), branch: "gamo/busy", base: "main", session: "s", port: 4150, startedAt: new Date().toISOString() }));
  writeFileSync(join(busy, "turn-1/pid"), String(sleeper.pid));
  try {
    const r = s.twin(["dispatch", project, "one-more"], BRIEF);
    expect(r.code).toBe(1);
    expect(r.err).toContain("มีงานรันอยู่ 1 งานแล้ว (สูงสุด 1)");
    expect(r.err).toContain("bun twin.ts profile maxRuns=2");
    expect(existsSync(join(project, ".claude/worktrees/gamo-one-more"))).toBe(false);
  } finally {
    sleeper.kill();
    rmSync(busy, { recursive: true });
  }
  expect(s.twin(["profile", "maxRuns=6"]).code).toBe(0);
}, 120_000);
