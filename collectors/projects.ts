import { $ } from "bun";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { defineCollector, type AttentionItem } from "../lib/collector.ts";
import { hasLiveSession, liveSessionCwds } from "../lib/sessions.ts";

const DAY = 86_400_000;
const ACTIVE_DAYS = 14;
const BRIEF_DAYS = 7;
const BRIEF_LINES = 8;
const CONCURRENCY = 8;

type Repo = {
  name: string;
  path: string;
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
  lastCommitAt: string | null;
  lastSubject: string;
  remoteHost: string;
  worktrees: { path: string; branch: string; ageDays: number }[];
  plans: { file: string; pending: string[]; next: string | null }[];
  liveSession: boolean;
};

async function git(repo: string, args: string[]): Promise<string> {
  const r = await $`git -C ${repo} ${args}`.quiet().nothrow();
  return r.exitCode === 0 ? r.text().trim() : "";
}

function readPlans(repo: string): Repo["plans"] {
  const dir = join(repo, "docs/plans");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const lines = readFileSync(join(dir, file), "utf8").split("\n");
      const pending = lines.filter((l) => /^\s*ค้าง:/.test(l)).map((l) => l.replace(/^\s*ค้าง:\s*/, "").trim()).filter((l) => l && l !== "-");
      const next = lines.find((l) => /^\s*ถัดไป:/.test(l))?.replace(/^\s*ถัดไป:\s*/, "").trim() ?? null;
      return { file, pending, next };
    });
}

async function inspect(path: string, live: string[] | null, now: Date): Promise<Repo> {
  const [branch, status, last, counts, worktreeList, remote] = await Promise.all([
    git(path, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(path, ["status", "--porcelain"]),
    git(path, ["log", "-1", "--format=%cI%x09%s"]),
    git(path, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]),
    git(path, ["worktree", "list", "--porcelain"]),
    git(path, ["remote", "get-url", "origin"]),
  ]);
  const [lastCommitAt, lastSubject] = last ? (last.split("\t") as [string, string]) : [null, ""];
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [0, 0];
  const worktrees = worktreeList
    .split("\n\n")
    .slice(1)
    .map((block) => {
      const wt = block.match(/^worktree (.+)$/m)?.[1] ?? "";
      const br = block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "(detached)";
      const ageDays = existsSync(wt) ? Math.floor((now.getTime() - statSync(wt).mtimeMs) / DAY) : -1;
      return { path: wt, branch: br, ageDays };
    })
    .filter((w) => w.path);
  return {
    name: basename(path),
    path,
    branch,
    dirty: status ? status.split("\n").length : 0,
    ahead: ahead ?? 0,
    behind: behind ?? 0,
    lastCommitAt,
    lastSubject,
    remoteHost: remote.match(/(github|gitlab)\.com/)?.[1] ?? (remote ? "other" : "none"),
    worktrees,
    plans: readPlans(path),
    liveSession: hasLiveSession(path, live),
  };
}

async function inParallel<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await f(xs[i]!);
      }
    }),
  );
  return out;
}

const daysSince = (iso: string | null, now: Date) => (iso ? Math.floor((now.getTime() - Date.parse(iso)) / DAY) : Infinity);

const isActive = (r: Repo, now: Date) => r.liveSession || r.dirty > 0 || r.worktrees.length > 0 || daysSince(r.lastCommitAt, now) <= ACTIVE_DAYS;

const SUMMARY_PENDING_CHARS = 100;

function summary(r: Repo, now: Date): string {
  const parts = [r.name, r.branch || "(ยังไม่มี commit)"];
  if (r.ahead) parts.push(`↑${r.ahead}`);
  if (r.dirty) parts.push(`${r.dirty} dirty`);
  if (r.liveSession) parts.push("● session เปิดอยู่");
  if (r.lastCommitAt) parts.push(`commit ${daysSince(r.lastCommitAt, now)}d`);
  const plan = r.plans.find((p) => p.pending.length);
  const pending = plan?.pending[0];
  if (plan && pending)
    parts.push(`ค้าง: ${pending.length > SUMMARY_PENDING_CHARS ? `${pending.slice(0, SUMMARY_PENDING_CHARS - 1)}…` : pending} (${plan.file})`);
  return parts.join(" · ");
}

function detail(r: Repo): string {
  const lines = [
    `# ${r.name}`,
    `path: ${r.path}`,
    `branch: ${r.branch} · ahead ${r.ahead} · behind ${r.behind} (ณ fetch ล่าสุด) · dirty ${r.dirty} · remote ${r.remoteHost}`,
    `last commit: ${r.lastCommitAt ?? "-"} ${r.lastSubject}`,
    `session เปิดอยู่: ${r.liveSession ? "ใช่" : "ไม่"}`,
  ];
  if (r.worktrees.length) lines.push("", "## worktrees", ...r.worktrees.map((w) => `- ${w.branch} · ${w.ageDays}d · ${w.path}`));
  for (const p of r.plans) {
    lines.push("", `## plan ${p.file}`, ...p.pending.map((x) => `- ค้าง: ${x}`));
    if (p.next) lines.push(`- ถัดไป: ${p.next}`);
  }
  return lines.join("\n") + "\n";
}

function attention(r: Repo, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const idle = daysSince(r.lastCommitAt, now);
  if (r.dirty && idle > 3 && !r.liveSession)
    items.push({ key: `projects:dirty:${r.name}`, project: r.name, title: `แก้ค้าง ${r.dirty} ไฟล์ ไม่ได้ commit มา ${idle} วัน`, score: 30 });
  if (r.ahead && !r.liveSession)
    items.push({ key: `projects:ahead:${r.name}`, project: r.name, title: `${r.ahead} commit ยังไม่ push (${r.branch})`, score: 35 });
  for (const w of r.worktrees.filter((w) => w.ageDays > 3))
    items.push({ key: `projects:worktree:${w.path}`, project: r.name, title: `worktree ค้าง ${w.ageDays} วัน: ${w.branch}`, score: 25 });
  if (idle <= ACTIVE_DAYS)
    for (const p of r.plans)
      for (const x of p.pending) items.push({ key: `projects:plan:${r.name}:${p.file}:${x}`, project: r.name, title: `ค้าง: ${x} (${p.file})`, score: 40 });
  return items;
}

export default defineCollector({
  title: "โปรเจกต์",
  order: 30,
  everyMinutes: 10,
  inBrief: false,
  keep: "snapshot",
  defaultOn: true,
  requires: ["devRoot"],
  async run({ now, profile }) {
    const devRoot = profile.devRoot!;
    const live = liveSessionCwds();
    const paths = readdirSync(devRoot)
      .map((d) => join(devRoot, d))
      .filter((p) => existsSync(join(p, ".git")));
    const repos = await inParallel(paths, CONCURRENCY, (p) => inspect(p, live, now));
    const active = repos
      .filter((r) => isActive(r, now))
      .sort((a, b) => Number(b.liveSession) - Number(a.liveSession) || daysSince(a.lastCommitAt, now) - daysSince(b.lastCommitAt, now));
    const index = [
      "| project | branch | dirty | ↑ | last commit | session | remote |",
      "|---|---|---|---|---|---|---|",
      ...repos
        .sort((a, b) => daysSince(a.lastCommitAt, now) - daysSince(b.lastCommitAt, now))
        .map((r) => `| ${r.name} | ${r.branch} | ${r.dirty} | ${r.ahead} | ${daysSince(r.lastCommitAt, now)}d | ${r.liveSession ? "●" : ""} | ${r.remoteHost} |`),
    ].join("\n");
    const recent = active.filter((r) => r.liveSession || r.dirty > 0 || daysSince(r.lastCommitAt, now) <= BRIEF_DAYS);
    const files: Record<string, string> = { "index.md": `# โปรเจกต์ทั้งหมด (${repos.length})\n\n${index}\n` };
    for (const r of active) files[`${r.name}.md`] = detail(r);
    const brief = [
      ...recent.slice(0, BRIEF_LINES).map((r) => `- ${summary(r, now)}`),
      ...(recent.length > BRIEF_LINES ? [`- +${recent.length - BRIEF_LINES} project: state/projects/index.md`] : []),
    ].join("\n");
    return { kind: "ok", files, brief, items: active.flatMap((r) => attention(r, now)) };
  },
});
