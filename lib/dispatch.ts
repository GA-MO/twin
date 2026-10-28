import { $ } from "bun";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { z } from "zod";
import { parseBrief } from "./briefs.ts";
import { GATES, contract, currentMethod, type Gate } from "./contract.ts";
import { notify } from "./os.ts";
import { inside } from "./paths.ts";
import { HOME, MAX_RUNS_CEILING, ROOT, loadProfile, ownUserSettings } from "./profile.ts";
import { getSecret, workerEnv } from "./secrets.ts";
import { hasLiveSession, liveSessionCwds, liveSessions, ownerIsGone, type LiveSession } from "./sessions.ts";

const RUNS = join(ROOT, "runs");
const SKILL_READS = ["Read(~/.claude/plugins/**)", "Read(~/.claude/skills/**)"];
const FIRST_PORT = 4101;
const WORKER_MODEL = "opus";


const GATE_DENY: Record<Gate, string[]> = {
  push: [],
  "shared-write": ["Bash(glab *)", "Bash(gh issue *)", "Bash(gh pr *)", "Bash(gh repo *)", "Bash(*curl*-X POST*)", "Bash(*curl*-X PUT*)", "Bash(*curl*-X DELETE*)"],
  delete: ["Bash(rm -rf *)", "Bash(git branch -D *)", "Bash(git push*--delete*)", "Bash(git clean *)"],
};
const ALWAYS_DENY = ["Bash(*--no-verify*)", "Bash(*core.hooksPath*)", "Bash(*core.hookspath*)", "Bash(*GIT_CONFIG*)", "Bash(*env -i*)", "Bash(*pushurl*)", "Bash(security *)", "Bash(*Bun.secrets*)"];

const Report = z.object({
  outcome: z.enum(["done", "blocked", "needs-approval", "needs-input"]),
  did: z.string(),
  pending: z.string(),
  discovered: z.string(),
  verified: z.string(),
  clicked: z.array(z.object({ what: z.string(), where: z.string(), result: z.string() })),
  inputs_tried: z.array(z.object({ input: z.string(), result: z.string() })),
  removed: z.array(z.string()),
  ideas: z.array(z.string()),
  gates_requested: z.array(z.enum(GATES)),
  question: z.string().optional(),
});
export type Report = z.infer<typeof Report>;

const StoredReport = Report.extend({ clicked: Report.shape.clicked.default([]), inputs_tried: Report.shape.inputs_tried.default([]), removed: Report.shape.removed.default([]), ideas: Report.shape.ideas.default([]) });
export const readsAsReport = (value: unknown) => StoredReport.safeParse(value).success;
const { $schema: _draft, ...reportSchema } = z.toJSONSchema(Report);
const REPORT_SCHEMA = JSON.stringify(reportSchema);

const ClaudeResult = z.object({
  subtype: z.string(),
  is_error: z.boolean(),
  num_turns: z.number().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
});

const RunFile = z.object({
  id: z.string(),
  agent: z.string().optional(),
  project: z.string(),
  repo: z.string(),
  slug: z.string(),
  worktree: z.string(),
  branch: z.string(),
  base: z.string(),
  session: z.string(),
  port: z.number(),
  startedAt: z.string(),
  secrets: z.array(z.string()).default([]),
  isolated: z.boolean().default(false),
});
type Run = Omit<z.infer<typeof RunFile>, "agent"> & { agent: string };

const agentOf = (branch: string) => branch.split("/")[0]!;

function readRunFile(id: string): Run {
  const file = RunFile.parse(JSON.parse(readFileSync(join(runDir(id), "run.json"), "utf8")));
  return { ...file, agent: file.agent ?? agentOf(file.branch) };
}

export type RunStatus = "running" | "finished" | "crashed" | "closed";

export type RunView = Run & {
  status: RunStatus;
  turn: number;
  report: Report | null;
  rawResult: string | null;
  answer: string | null;
  owner: string | null;
  handling: string | null;
  commits: string[];
  pushed: boolean;
};

const runDir = (id: string) => join(RUNS, id);
const turnDir = (id: string, n: number) => join(runDir(id), `turn-${n}`);
const queueDir = (id: string) => join(runDir(id), "queue");
const ownerFile = (id: string) => join(runDir(id), "owner");
const handlingFile = (id: string) => join(runDir(id), "handling");
const Handling = z.object({ turn: z.number(), at: z.number(), note: z.string() });
export const HANDLING_MS = 2 * 60 * 60_000;

function handlingOf(id: string, turn: number, now = Date.now()): string | null {
  if (!existsSync(handlingFile(id))) return null;
  const h = (() => {
    try {
      return Handling.safeParse(JSON.parse(readFileSync(handlingFile(id), "utf8")));
    } catch {
      return null;
    }
  })();
  return h?.success && h.data.turn === turn && now - h.data.at < HANDLING_MS ? h.data.note : null;
}

export function handle(id: string, note: string) {
  claim(id, false);
  const v = readRun(id);
  if (v.status !== "finished" || v.report?.outcome === "done") throw new Error(`${id} ไม่ได้รอคำตอบอยู่ (${v.status}${v.report ? ` · ${v.report.outcome}` : ""})`);
  writeFileSync(handlingFile(id), JSON.stringify({ turn: v.turn, at: Date.now(), note }));
}

export const thisSession = (): string | null => process.env.CLAUDE_CODE_SESSION_ID || null;

export function claim(id: string, take: boolean) {
  const owner = readRun(id).owner;
  const session = thisSession();
  if (!session || owner === session) return;
  if (owner && !take && !ownerIsGone(owner, liveSessions())) throw new Error(`งาน ${id} เป็นของ session อื่น (${owner}) · ทำต่อใน session นั้นด้วย claude --resume ${owner} หรือใส่ --take เพื่อรับมาเป็นของ session นี้`);
  writeFileSync(ownerFile(id), session);
}

const Queued = z.object({ message: z.string(), approve: z.array(z.enum(GATES)), check: z.boolean().optional(), clickCheck: z.boolean().optional() });

function resolveRepo(project: string, devRoot: string | null): string {
  if (isAbsolute(project)) {
    if (!existsSync(join(project, ".git"))) throw new Error(`ไม่ใช่ git repo: ${project}`);
    return project;
  }
  if (!devRoot) throw new Error("ยังไม่ได้ตั้ง devRoot: ใช้ path เต็มของ repo หรือ bun twin.ts profile devRoot=<path>");
  const names = readdirSync(devRoot).filter((d) => existsSync(join(devRoot, d, ".git")));
  const exact = names.find((n) => n === project);
  if (exact) return join(devRoot, exact);
  const matches = names.filter((n) => n.includes(project));
  if (matches.length === 1) return join(devRoot, matches[0]!);
  throw new Error(matches.length ? `ชื่อกำกวม "${project}": ${matches.join(", ")}` : `ไม่พบ project "${project}"`);
}

async function freePort(): Promise<number> {
  const taken = new Set(listRuns().filter((r) => r.status === "running").map((r) => r.port));
  for (let p = FIRST_PORT; p < FIRST_PORT + 100; p++) {
    if (taken.has(p)) continue;
    try {
      Bun.listen({ hostname: "127.0.0.1", port: p, socket: { data() {} } }).stop(true);
      return p;
    } catch {}
  }
  throw new Error("ไม่มี port ว่าง");
}

const prePush = (agent: string, branch: string, commonDir: string, urls: string[]) => `#!/bin/sh
here=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
case "$here" in ${q(commonDir)}) ;; *) case "$2" in ${urls.length ? urls.map(q).join("|") : "''"}) ;; *) exit 0 ;; esac ;; esac
while read lref lsha rref rsha; do
  case "$lsha" in *[!0]*) ;; *) echo "${agent}: ลบ branch บน remote ต้องได้รับอนุมัติ (gate: push)" >&2; exit 1 ;; esac
  [ "$rref" = "refs/heads/${branch}" ] || { echo "${agent}: push ได้เองเฉพาะ ${branch}; ไป $rref ต้องได้รับอนุมัติ (gate: push)" >&2; exit 1; }
done
exit 0
`;

const withoutGitConfig = (env: NodeJS.ProcessEnv) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$/.test(k)));

async function pushBlockEnv(run: Run, blocked: boolean): Promise<Record<string, string>> {
  await $`git -C ${run.worktree} config --worktree --unset remote.origin.pushurl`.quiet().nothrow();
  await $`git -C ${run.worktree} config --worktree --unset core.hooksPath`.quiet().nothrow();
  if (!blocked) return {};
  const hooks = join(runDir(run.id), "hooks");
  mkdirSync(hooks, { recursive: true });
  const commonDir = (await $`git -C ${run.repo} rev-parse --path-format=absolute --git-common-dir`.quiet()).text().trim();
  const urls = (await $`git -C ${run.repo} config --get-regexp ${"^remote\\..*\\.(push)?url$"}`.quiet().nothrow()).text().split("\n").map((l) => l.split(" ").slice(1).join(" ")).filter(Boolean);
  writeFileSync(join(hooks, "pre-push"), prePush(run.agent, run.branch, commonDir, urls));
  chmodSync(join(hooks, "pre-push"), 0o755);
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: hooks };
}

function settingsFor(approved: Gate[]) {
  const deny = [...ALWAYS_DENY, ...GATES.filter((g) => !approved.includes(g)).flatMap((g) => GATE_DENY[g])];
  return { permissions: { allow: SKILL_READS, deny } };
}

const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

async function spawnTurn(run: Run, n: number, prompt: string, approved: Gate[]) {
  const pushEnv = await pushBlockEnv(run, !approved.includes("push"));
  const dir = turnDir(run.id, n);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "prompt.md"), prompt);
  writeFileSync(join(dir, "head"), Bun.spawnSync(["git", "-C", run.worktree, "rev-parse", "HEAD"]).stdout.toString().trim());
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ ...settingsFor(approved), ...(run.isolated ? ownUserSettings(loadProfile().scope) : {}) }, null, 2));
  const args = [
    "claude", "-p", "--model", WORKER_MODEL, "--output-format", "json", "--json-schema", REPORT_SCHEMA,
    "--permission-mode", "auto", "--permission-prompts", "none", "--settings", join(dir, "settings.json"),
    ...(run.isolated ? ["--setting-sources", "project,local"] : []),
    ...(n === 1
      ? ["--session-id", run.session, "-n", `${run.agent}-${run.slug}`, "--append-system-prompt-file", join(runDir(run.id), "contract.md")]
      : ["--resume", run.session]),
  ];
  const twin = (sub: string) => [process.execPath, join(ROOT, "twin.ts"), sub, run.id].map(q).join(" ");
  const inner = [
    `cd ${q(run.worktree)}`,
    `TWIN_PORT=${run.port} ${args.map(q).join(" ")} < ${q(join(dir, "prompt.md"))} > ${q(join(dir, "result.json"))} 2> ${q(join(dir, "err.log"))}`,
    `code=$?`,
    `${twin("_clickcheck")} > ${q(join(dir, "clickcheck.log"))} 2>&1`,
    `${twin("_drain")} > ${q(join(dir, "drain.log"))} 2>&1`,
    `echo $code > ${q(join(dir, "exit"))}`,
    `${twin("_drain")} >> ${q(join(dir, "drain.log"))} 2>&1`,
    twin("_done"),
  ].join("; ");
  const env = await workerEnv(run.secrets);
  const pid = Bun.spawnSync(["sh", "-c", `nohup sh -c ${q(inner)} >/dev/null 2>&1 & echo $!`], { env: { ...withoutGitConfig(process.env), ...env, ...pushEnv } }).stdout.toString().trim();
  writeFileSync(join(dir, "pid"), pid);
}

function lastTurn(id: string): number {
  return Math.max(0, ...readdirSync(runDir(id)).filter((f) => f.startsWith("turn-") && existsSync(join(runDir(id), f, "pid"))).map((f) => Number(f.slice(5))));
}

const alive = (pidFile: string) => {
  if (!existsSync(pidFile)) return false;
  try {
    process.kill(Number(readFileSync(pidFile, "utf8")), 0);
    return true;
  } catch {
    return false;
  }
};



function parseTurn(dir: string): { report: Report | null; rawResult: string | null; answer: string | null } {
  const text = existsSync(join(dir, "result.json")) ? readFileSync(join(dir, "result.json"), "utf8") : "";
  const parsed = (() => {
    try {
      return ClaudeResult.safeParse(JSON.parse(text));
    } catch {
      return null;
    }
  })();
  const r = parsed?.success ? StoredReport.safeParse(parsed.data.structured_output) : null;
  const report = r?.success ? r.data : null;
  const answer = parsed?.success ? (parsed.data.result ?? null) : null;
  const rawResult = report ? null : (answer ?? (text || readFileSync(join(dir, "err.log"), "utf8"))).slice(0, 2000);
  return { report, rawResult, answer };
}

export function readRun(id: string): RunView {
  if (!existsSync(join(runDir(id), "run.json"))) throw new Error(`ไม่มีงาน ${id}: ดูรายการด้วย bun twin.ts runs`);
  const run = readRunFile(id);
  const n = lastTurn(id);
  const dir = turnDir(id, n);
  const { report, rawResult, answer } = existsSync(join(dir, "exit")) ? parseTurn(dir) : { report: null, rawResult: null, answer: null };
  const status: RunStatus = existsSync(join(runDir(id), "closed.md"))
    ? "closed"
    : existsSync(join(dir, "exit"))
      ? "finished"
      : alive(join(dir, "pid"))
        ? "running"
        : "crashed";
  const git = (args: string[]) => Bun.spawnSync(["git", "-C", run.repo, ...args]).stdout.toString().trim();
  const commits = status === "closed" ? [] : git(["log", "--format=%h %s", `${run.base}..${run.branch}`]).split("\n").filter(Boolean);
  const remoteHead = git(["rev-parse", "-q", "--verify", `refs/remotes/origin/${run.branch}`]);
  const localHead = git(["rev-parse", run.branch]);
  const owner = existsSync(ownerFile(id)) ? readFileSync(ownerFile(id), "utf8").trim() || null : null;
  const handling = status === "finished" ? handlingOf(id, n) : null;
  return { ...run, owner, handling, status, turn: n, report, rawResult, answer, commits, pushed: !!remoteHead && remoteHead === localHead };
}

export function listRuns(): RunView[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS)
    .filter((d) => existsSync(join(RUNS, d, "run.json")))
    .sort()
    .flatMap((d) => {
      try {
        return [readRun(d)];
      } catch {
        return [];
      }
    });
}

function transcript(run: Run): string | null {
  const projects = join(HOME, ".claude/projects");
  if (!existsSync(projects)) return null;
  for (const d of readdirSync(projects)) {
    const p = join(projects, d, `${run.session}.jsonl`);
    if (existsSync(p)) return p;
  }
  return null;
}

function lastText(file: string): string | null {
  for (const l of readFileSync(file, "utf8").trim().split("\n").reverse()) {
    try {
      const j = JSON.parse(l) as { type?: string; message?: { content?: { type: string; text?: string }[] } };
      const text = j.type === "assistant" ? j.message?.content?.find((c) => c.type === "text")?.text : undefined;
      if (text && text !== "No response requested.") return text.replace(/\s+/g, " ").slice(0, 300);
    } catch {}
  }
  return null;
}

export function lastWords(run: Run): string | null {
  const p = transcript(run);
  return p ? lastText(p) : null;
}

const SubagentMeta = z.object({ agentType: z.string(), description: z.string(), model: z.string().optional(), finished: z.boolean().optional() });

export type SubagentSummary = { id: string; type: string; description: string; model: string; isRunning: boolean; doing: string; activeAt: number };

function subagents(dir: string): SubagentSummary[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".meta.json"))
    .flatMap((f) => {
      const meta = SubagentMeta.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      const log = join(dir, f.replace(/\.meta\.json$/, ".jsonl"));
      if (!meta.success || !existsSync(log)) return [];
      return [
        {
          id: f.replace(/\.meta\.json$/, ""),
          type: meta.data.agentType.replace(/^[a-z-]+:/, "").replace(/-(low|medium|high|xhigh|max)$/, "").replace(/^effort$/, "general"),
          description: meta.data.description,
          model: meta.data.model ?? "",
          isRunning: meta.data.finished !== true,
          doing: (lastText(log) ?? "").slice(0, 200),
          activeAt: statSync(log).mtimeMs,
        },
      ];
    })
    .sort((a, b) => Number(b.isRunning) - Number(a.isRunning) || b.activeAt - a.activeAt);
}

export type ReportSummary = { did: string; pending: string; discovered: string; verified: string; question: string | null; clicked: string[]; ideas: string[]; commits: string[] };
export type OwnerSession = { state: "live"; name: string; where: LiveSession["where"]; status: string } | { state: "closed" };

export type RunSummary = {
  id: string;
  owner: string | null;
  ownerSession: OwnerSession | null;
  handling: string | null;
  report: ReportSummary | null;
  project: string;
  slug: string;
  status: RunStatus;
  outcome: Report["outcome"] | null;
  answered: boolean;
  gates: Gate[];
  turn: number;
  doing: string;
  agents: SubagentSummary[];
  commits: number;
  pushed: boolean;
  activeAt: number;
};

function ownerSession(owner: string | null, live: LiveSession[] | null): OwnerSession | null {
  if (!owner || live === null) return null;
  const s = live.find((l) => l.sessionId === owner);
  return s ? { state: "live", name: s.name, where: s.where, status: s.status } : { state: "closed" };
}

export function summarize(v: RunView, live: LiveSession[] | null = null): RunSummary {
  const p = transcript(v);
  const doing = v.status === "running" ? lastWords(v) : v.handling ? v.handling : v.report ? (v.report.question ?? v.report.did) : v.rawResult;
  return {
    id: v.id,
    owner: v.owner,
    ownerSession: ownerSession(v.owner, live),
    handling: v.handling,
    report: v.report
      ? {
          did: v.report.did,
          pending: v.report.pending,
          discovered: v.report.discovered,
          verified: v.report.verified,
          question: v.report.question ?? null,
          clicked: v.report.clicked.map((c) => `${c.what} @ ${c.where} → ${c.result}`),
          ideas: v.report.ideas,
          commits: v.commits,
        }
      : null,
    project: v.project,
    slug: v.slug,
    status: v.status,
    outcome: v.report?.outcome ?? null,
    answered: v.report === null && v.answer !== null,
    gates: v.report?.gates_requested ?? [],
    turn: v.turn,
    doing: (doing ?? "").replace(/\s+/g, " ").slice(0, 200),
    agents: p ? subagents(p.replace(/\.jsonl$/, "/subagents")) : [],
    commits: v.commits.length,
    pushed: v.pushed,
    activeAt: p ? statSync(p).mtimeMs : 0,
  };
}

export async function start(project: string, slug: string, task: string, opts: { contract?: string; isolated?: boolean } = {}): Promise<RunView> {
  const profile = loadProfile();
  const method = currentMethod();
  const brief = parseBrief(task, profile.name, method);
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) throw new Error(`slug ต้องเป็น a-z0-9- : ${slug}`);
  for (const name of brief.secrets) if (!(await getSecret(name))) throw new Error(`ไม่มี secret ${name}: ตั้งด้วย bun twin.ts secret ${name}`);
  const running = listRuns().filter((r) => r.status === "running").length;
  if (running >= profile.maxRuns) throw new Error(`มีงานรันอยู่ ${running} งานแล้ว (สูงสุด ${profile.maxRuns}): รอให้งานหนึ่งจบ หรือเพิ่มด้วย bun twin.ts profile maxRuns=${Math.min(profile.maxRuns + 1, MAX_RUNS_CEILING)} (ได้ถึง ${MAX_RUNS_CEILING})`);
  const repo = resolveRepo(project, profile.devRoot);
  await $`git -C ${repo} fetch -q origin`.quiet().nothrow();
  const has = async (ref: string) => (await $`git -C ${repo} rev-parse -q --verify ${ref}`.quiet().nothrow()).exitCode === 0;
  const base = (await has("origin/develop")) ? "origin/develop" : (await has("origin/HEAD")) ? "origin/HEAD" : "HEAD";
  const worktree = join(repo, ".claude/worktrees", `${profile.name}-${slug}`);
  const branch = `${profile.name}/${slug}`;
  if (existsSync(worktree)) throw new Error(`มี worktree ${worktree} อยู่แล้ว`);
  await $`git -C ${repo} worktree add -q -b ${branch} ${worktree} ${base}`.quiet();
  const exclude = join(repo, ".git/info/exclude");
  for (const entry of [".claude/worktrees/", ".twin-scratch/"])
    if (existsSync(exclude) && !readFileSync(exclude, "utf8").split("\n").includes(entry)) writeFileSync(exclude, `${readFileSync(exclude, "utf8").trimEnd()}\n${entry}\n`);
  for (const f of readdirSync(repo)) if (f.startsWith(".env") && !existsSync(join(worktree, f))) copyFileSync(join(repo, f), join(worktree, f));
  const now = new Date();
  const run: Run = {
    id: `${now.toLocaleDateString("sv-SE").slice(5).replace("-", "")}-${now.toTimeString().slice(0, 5).replace(":", "")}-${basename(repo)}-${slug}`.replace(/[^\w.-]/g, "_"),
    agent: profile.name,
    project: basename(repo),
    repo,
    slug,
    worktree,
    branch,
    base,
    session: crypto.randomUUID(),
    port: await freePort(),
    startedAt: now.toISOString(),
    secrets: brief.secrets,
    isolated: opts.isolated === true,
  };
  mkdirSync(runDir(run.id), { recursive: true });
  writeFileSync(join(runDir(run.id), "run.json"), JSON.stringify(run, null, 2));
  writeFileSync(join(runDir(run.id), "contract.md"), opts.contract ?? contract(profile.name, method));
  const session = thisSession();
  if (session) writeFileSync(ownerFile(run.id), session);
  await spawnTurn(run, 1, brief.prompt, []);
  return readRun(run.id);
}

export async function followup(id: string, approve: Gate[], message: string, take = false): Promise<{ queued: boolean; view: RunView }> {
  if (readRun(id).status === "closed") throw new Error("งานนี้ปิดแล้ว");
  claim(id, take);
  mkdirSync(queueDir(id), { recursive: true });
  writeFileSync(join(queueDir(id), `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`), JSON.stringify({ message, approve }));
  const queued = readRun(id).status === "running";
  if (!queued) await drain(id);
  return { queued, view: readRun(id) };
}

const CHECKS: { file: RegExp; skip?: RegExp; tried: (r: Report) => boolean; ask: (files: string) => string }[] = [
  {
    file: /\.(tsx|jsx|vue|svelte|astro|html|css|scss|mdx)$/,
    tried: (r) => r.clicked.length > 0,
    ask: (files) => `turn นี้แก้ไฟล์ UI แต่ยังไม่ได้กดบนหน้าจริง: ${files} กดเท่าที่การแก้นี้ไปถึงตามกฎใน contract แก้ที่เจอ แล้วใส่ทุกการกดใน clicked`,
  },
  {
    file: /\.(ts|mts|cts|js|mjs|cjs|py|go|rs|php|rb)$/,
    skip: /(^|\/)(test|tests|__tests__|__mocks__|spec|e2e)\/|\.(test|spec)\.|_test\.(go|py)$|(^|\/)(test_[^/]*\.py|conftest\.py)$|\.d\.ts$/,
    tried: (r) => r.inputs_tried.length > 0,
    ask: (files) => `turn นี้แก้ code ที่รับ input แต่ยังไม่ได้ลอง input ที่ brief ไม่ได้บอก: ${files} ลองตามกฎ input ใน contract (ว่าง, ศูนย์, ติดลบ, ทศนิยม, ใหญ่มาก, ผิดรูปแบบ, ผิดชนิด, encode หรือซ้ำ) แก้ที่ไม่ถูก เพิ่ม test แล้วใส่ทุกอันใน inputs_tried`,
  },
];
const CHECK_MARKS = ["check", "click-check"];
const TEST_DATA = /(^|\/)(fixtures|fixtures-[^/]+|testdata)\//;

function uncheckedAsks(run: Run, dir: string, report: Report | null): string[] {
  if (!report || report.outcome !== "done" || !existsSync(join(dir, "head"))) return [];
  const names = (...range: string[]) => Bun.spawnSync(["git", "-C", run.worktree, "diff", "--name-only", "--diff-filter=d", ...range]).stdout.toString().split("\n").filter(Boolean);
  const base = run.base === "HEAD" ? readFileSync(join(turnDir(run.id, 1), "head"), "utf8").trim() : run.base;
  const ours = new Set(names(`${base}...HEAD`));
  const changed = names(readFileSync(join(dir, "head"), "utf8").trim(), "HEAD").filter((f) => ours.has(f));
  return CHECKS.flatMap((c) => {
    const files = c.tried(report) ? [] : changed.filter((f) => c.file.test(f) && !c.skip?.test(f) && !TEST_DATA.test(f));
    return files.length ? [c.ask(files.join(", "))] : [];
  });
}

export function queueChecks(id: string) {
  const run = readRunFile(id);
  const dir = turnDir(id, lastTurn(id));
  if (CHECK_MARKS.some((m) => existsSync(join(dir, m)))) return;
  const asks = uncheckedAsks(run, dir, parseTurn(dir).report);
  if (!asks.length) return;
  mkdirSync(queueDir(id), { recursive: true });
  writeFileSync(join(queueDir(id), `${Date.now()}-check.json`), JSON.stringify({ message: `${asks.join("\n")}\nแล้วรายงานใหม่`, approve: [], check: true }));
}

export async function drain(id: string) {
  const dir = queueDir(id);
  if (existsSync(join(runDir(id), "closed.md")) || !existsSync(dir)) return;
  const claimed = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().flatMap((f) => {
    const to = join(dir, `${f}.${process.pid}`);
    try {
      renameSync(join(dir, f), to);
      return [to];
    } catch {
      return [];
    }
  });
  if (!claimed.length) return;
  const items = claimed.map((f) => Queued.parse(JSON.parse(readFileSync(f, "utf8"))));
  for (const f of claimed) rmSync(f);
  const approve = GATES.filter((g) => items.some((i) => i.approve.includes(g)));
  const prefix = approve.length ? `อนุมัติแล้ว: ${approve.join(", ")} (เฉพาะ turn นี้)\n` : "";
  const run = readRunFile(id);
  const n = lastTurn(id) + 1;
  mkdirSync(turnDir(id, n), { recursive: true });
  if (items.some((i) => i.check || i.clickCheck)) writeFileSync(join(turnDir(id, n), "check"), "");
  if (items.some((i) => !i.check && !i.clickCheck && !i.approve.length)) writeFileSync(join(turnDir(id, n), "touch"), "");
  await spawnTurn(run, n, prefix + items.map((i) => i.message).join("\n\n"), approve);
}

export async function waitFor(id: string): Promise<RunView> {
  while (readRun(id).status === "running") await Bun.sleep(3000);
  return readRun(id);
}

export async function close(id: string, opts: { discard: boolean; stop: boolean; take: boolean; dropUnmergedRemote?: boolean }): Promise<string> {
  const view = readRun(id);
  if (view.status === "closed") return "ปิดไปแล้ว";
  if (view.status === "running" && !opts.stop) throw new Error("งานยังรันอยู่ (ใช้ --stop เพื่อหยุด)");
  if (view.commits.length && !view.pushed && !opts.discard) throw new Error(`มี ${view.commits.length} commit ยังไม่ push (ใช้ --discard เพื่อทิ้ง ซึ่งลบ branch บน remote ด้วย)`);
  claim(id, opts.take);
  if (view.status === "running") {
    const pid = Number(readFileSync(join(turnDir(id, view.turn), "pid"), "utf8"));
    await $`pkill -P ${pid}`.quiet().nothrow();
    process.kill(pid);
  }
  const stopped = await stopProcessesIn(view.worktree);
  await $`git -C ${view.repo} worktree remove --force ${view.worktree}`.quiet().nothrow();
  await $`git -C ${view.repo} branch -D ${view.branch}`.quiet().nothrow();
  rmSync(join(runDir(id), "hooks"), { recursive: true, force: true });
  const remote = await dropRemoteBranch(view.repo, view.branch, opts.dropUnmergedRemote ?? false);
  writeFileSync(join(runDir(id), "closed.md"), `closed ${new Date().toISOString()} · ${view.commits.length} commits · pushed ${view.pushed} · discard ${opts.discard}\n`);
  const swept = (await sweepWorktrees(view.repo, view.agent, view.base).catch(() => [])).length;
  return [
    `ปิด ${id} · ลบ worktree + branch local`,
    ...(remote ? [remote] : []),
    ...(stopped ? [`หยุด process ที่ค้าง ${stopped} ตัว`] : []),
    ...(swept ? [`ลบ worktree ที่ค้างอยู่ ${swept} อัน (งานอยู่ใน branch แล้ว)`] : []),
  ].join(" · ");
}

export const MERGE_TARGETS = ["develop", "uat", "sit", "sit-2", "main", "master"];
const TRUNKS = ["develop", "main", "master"];

export async function mergedInto(repo: string, ref: string, targets = MERGE_TARGETS): Promise<string | null> {
  for (const t of targets)
    if ((await $`git -C ${repo} merge-base --is-ancestor ${ref} ${`refs/remotes/origin/${t}`}`.quiet().nothrow()).exitCode === 0) return t;
  return null;
}

export async function landedOnTrunk(repo: string, ref: string): Promise<string | null> {
  const head = (await $`git -C ${repo} symbolic-ref -q --short refs/remotes/origin/HEAD`.quiet().nothrow()).text().trim().replace(/^origin\//, "");
  return mergedInto(repo, ref, [...new Set([...(head ? [head] : []), ...TRUNKS])]);
}

export async function fetchOrigin(repo: string): Promise<boolean> {
  return (await $`git -C ${repo} fetch -q --prune origin`.quiet().nothrow()).exitCode === 0;
}

export async function deleteRemoteBranch(repo: string, branch: string): Promise<string | null> {
  const sha = (await $`git -C ${repo} rev-parse -q --verify ${`refs/remotes/origin/${branch}`}`.quiet().nothrow()).text().trim();
  if (!sha) return null;
  const r = await $`git -C ${repo} push -q ${`--force-with-lease=refs/heads/${branch}:${sha}`} origin ${`:refs/heads/${branch}`}`.quiet().nothrow();
  if (r.exitCode === 0) return null;
  const lines = r.stderr.toString().split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /^remote: \S/.test(l) && !/^remote: *$/.test(l))?.replace(/^remote: */, "") ?? lines.pop() ?? "push ไม่ผ่าน";
}

async function dropRemoteBranch(repo: string, branch: string, dropUnmerged: boolean): Promise<string | null> {
  const fetched = await fetchOrigin(repo);
  const ref = `refs/remotes/origin/${branch}`;
  if ((await $`git -C ${repo} rev-parse -q --verify ${ref}`.quiet().nothrow()).exitCode !== 0) return null;
  if (!fetched) return "branch บน remote ยังอยู่ (fetch ไม่ได้ จึงยังไม่ลบ)";
  const into = await landedOnTrunk(repo, ref);
  if (!into && !dropUnmerged) return "branch บน remote ยังอยู่ (ยังไม่ merge เข้า develop/main)";
  const failed = await deleteRemoteBranch(repo, branch);
  if (failed) return `ลบ branch บน remote ไม่ได้: ${failed}`;
  return `ลบ branch บน remote แล้ว${into ? ` (merge เข้า ${into} แล้ว)` : ""}`;
}

const isClaude = (command: string) => /(^|\/)claude$/.test(command.split(/\s+/)[0] ?? "") || command.includes("/Claude.app/");

export async function stopProcessesIn(dir: string): Promise<number> {
  const prefixes = [...new Set([dir, real(dir) ?? dir, dir.replace(/^\/private\//, "/")].map((p) => `${p.replace(/\/$/, "")}/`))];
  const under = (path: string) => prefixes.some((p) => `${path}/`.startsWith(p));
  const pids = new Set<number>();
  const commands = new Map<number, string>();
  for (const line of (await $`ps -axo pid=,command=`.quiet().nothrow()).text().split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m) continue;
    commands.set(Number(m[1]), m[2]!);
    if (prefixes.some((p) => m[2]!.includes(p))) pids.add(Number(m[1]));
  }
  const lsof = Bun.which("lsof") ?? ["/usr/sbin/lsof", "/usr/bin/lsof"].find((p) => existsSync(p));
  let pid = 0;
  for (const line of lsof ? (await $`${lsof} -w -d cwd -Fpcn`.quiet().nothrow()).text().split("\n") : []) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid && under(line.slice(1))) pids.add(pid);
  }
  for (const p of pids) if (isClaude(commands.get(p) ?? "")) pids.delete(p);
  for (const own of [process.pid, process.ppid]) pids.delete(own);
  for (const p of pids) {
    try {
      process.kill(p);
    } catch {}
  }
  return pids.size;
}

const real = (p: string) => (existsSync(p) ? realpathSync(p) : null);
const FRESH_MS = 10 * 60_000;

export function runsReadable(): boolean {
  return listRuns().length === readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, "run.json"))).length;
}

export async function sweepWorktrees(repoPath: string, agent: string, base: string | null, dry = false): Promise<string[]> {
  const repo = real(repoPath);
  if (!repo) return [];
  const runs = listRuns();
  const all = readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, "run.json"))).length;
  if (runs.length !== all || runs.some((r) => r.status !== "closed" && real(r.repo) === repo)) return [];
  const live = liveSessionCwds();
  const owned = new Set(runs.map((r) => real(r.worktree) ?? r.worktree));
  const root = join(repo, ".claude/worktrees");
  const list = (await $`git -C ${repo} worktree list --porcelain`.quiet().nothrow()).stdout.toString();
  const swept: string[] = [];
  for (const block of list.split("\n\n")) {
    const path = real(block.match(/^worktree (.+)$/m)?.[1] ?? "");
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    const head = block.match(/^HEAD ([0-9a-f]+)$/m)?.[1];
    const detached = /^detached$/m.test(block) && !!path && basename(path).startsWith(`${agent}-`);
    if (!path || !(branch?.startsWith(`${agent}/`) || detached) || !inside(root, path) || owned.has(path)) continue;
    if (existsSync(join(path, ".twin-scratch")) && readdirSync(join(path, ".twin-scratch")).length) continue;
    if (hasLiveSession(path, live) || Date.now() - statSync(path).mtimeMs < FRESH_MS) continue;
    const kept = branch
      ? base
        ? (await $`git -C ${repo} merge-base --is-ancestor ${branch} ${base}`.quiet().nothrow()).exitCode === 0
        : (await mergedInto(repo, `refs/heads/${branch}`)) !== null
      : !!head && (await $`git -C ${repo} for-each-ref --contains ${head} --count=1 refs/heads refs/remotes`.quiet().nothrow()).text().trim() !== "";
    const status = await $`git -C ${path} status --porcelain`.quiet().nothrow();
    if (!kept || status.exitCode !== 0 || status.text().trim() !== "") continue;
    if (!dry) {
      await stopProcessesIn(path);
      if ((await $`git -C ${repo} worktree remove --force ${path}`.quiet().nothrow()).exitCode !== 0) continue;
      if (branch) await $`git -C ${repo} branch -D ${branch}`.quiet().nothrow();
    }
    swept.push(basename(path));
  }
  return swept;
}

export function describe(v: RunView): string {
  const head = `${v.id} · ${v.status} · turn ${v.turn} · ${v.commits.length} commits${v.pushed ? " · pushed" : ""}${v.handling ? ` · ${v.agent} จัดการอยู่: ${v.handling}` : ""}`;
  if (v.status === "running") return `${head}\n  ล่าสุด: ${lastWords(v) ?? "-"}`;
  if (v.report) {
    const r = v.report;
    return [
      `${head} · ${r.outcome}${r.gates_requested.length ? ` · ขออนุมัติ: ${r.gates_requested.join(",")}` : ""}`,
      `  ทำแล้ว: ${r.did}`,
      `  ค้าง: ${r.pending}`,
      `  ค้นพบ: ${r.discovered}`,
      `  ตรวจ: ${r.verified}`,
      ...(r.clicked.length ? [`  กดแล้ว: ${r.clicked.map((c) => `${c.what} @ ${c.where} → ${c.result}`).join(" | ")}`] : []),
      ...(r.inputs_tried.length ? [`  ลองแล้ว: ${r.inputs_tried.map((c) => `${c.input} → ${c.result}`).join(" | ")}`] : []),
      ...(r.removed.length ? [`  หายไปจากของเดิม: ${r.removed.join(" | ")}`] : []),
      ...(r.ideas.length ? [`  ต่อยอดได้: ${r.ideas.join(" | ")}`] : []),
      ...(r.question ? [`  ถาม: ${r.question}`] : []),
      ...(v.commits.length ? [`  commits: ${v.commits.join(" | ")}`] : []),
      `  worktree: ${v.worktree} · takeover: cd ${v.worktree} && claude --resume ${v.session}`,
    ].join("\n");
  }
  return v.rawResult ? `${head} · unparsed\n  ${v.rawResult.slice(0, 500)}` : head;
}

export async function notifyDone(id: string) {
  const v = readRun(id);
  if (v.status === "running" || v.isolated) return;
  const what = v.report ? (v.report.outcome === "needs-approval" ? `ขออนุมัติ ${v.report.gates_requested.join(",")}` : v.report.outcome) : "unparsed";
  await notify(v.agent, `${v.project}/${v.slug}: ${what}`);
}
