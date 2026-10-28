import { $ } from "bun";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadProfile } from "./profile.ts";
import { MERGE_TARGETS, close, deleteRemoteBranch, fetchOrigin, landedOnTrunk, listRuns, mergedInto, runsReadable, sweepWorktrees } from "./dispatch.ts";
import { hasLiveSession, liveSessionCwds } from "./sessions.ts";

const IDLE_DAYS = 14;
const CLOSED_RUN_DAYS = 30;
const REGENERABLE = ["node_modules", ".next", "dist", ".turbo", "build", ".dart_tool", ".svelte-kit", ".nuxt", ".parcel-cache"];
const LOG = join(ROOT, "state/clean/log.md");
const DAY = 86_400_000;

type Freed = { what: string; kb: number; isLeftover?: boolean };

async function sizeKb(path: string): Promise<number> {
  const r = await $`du -sk ${path}`.quiet().nothrow();
  return Number(r.text().split("\t")[0]) || 0;
}

async function remove(path: string, dry: boolean): Promise<number> {
  const kb = await sizeKb(path);
  if (!dry) rmSync(path, { recursive: true, force: true });
  return kb;
}

async function closeMergedRuns(dry: boolean): Promise<Freed[]> {
  const out: Freed[] = [];
  const fetched = new Set<string>();
  for (const v of listRuns().filter((v) => v.status === "finished" || v.status === "crashed")) {
    if (!fetched.has(v.repo)) {
      await $`git -C ${v.repo} fetch -q origin`.quiet().nothrow();
      fetched.add(v.repo);
    }
    const onRemote = (await $`git -C ${v.repo} rev-parse -q --verify ${`refs/remotes/origin/${v.branch}`}`.quiet().nothrow()).exitCode === 0;
    if (!v.commits.length && !onRemote) continue;
    let into: string | undefined;
    for (const t of MERGE_TARGETS) {
      if ((await $`git -C ${v.repo} merge-base --is-ancestor ${v.branch} ${`origin/${t}`}`.quiet().nothrow()).exitCode === 0) {
        into = t;
        break;
      }
    }
    if (!into) continue;
    const kb = existsSync(v.worktree) ? await sizeKb(v.worktree) : 0;
    if (!dry) await close(v.id, { discard: true, stop: false, take: true });
    out.push({ what: `ปิด run ${v.id} (merge เข้า ${into} แล้ว)`, kb: Math.max(kb, 1) });
  }
  return out;
}

async function cleanRuns(dry: boolean): Promise<Freed[]> {
  const cutoff = Date.now() - CLOSED_RUN_DAYS * DAY;
  const out: Freed[] = [];
  for (const v of listRuns().filter((v) => v.status === "closed")) {
    const dir = join(ROOT, "runs", v.id);
    if (statSync(join(dir, "closed.md")).mtimeMs >= cutoff) continue;
    if (!dry && !(existsSync(LEDGER) && readFileSync(LEDGER, "utf8").split("\n").includes(v.branch))) appendFileSync(LEDGER, `${v.branch}\n`);
    out.push({ what: `runs/${v.id}`, kb: await remove(dir, dry) });
  }
  return out;
}

async function cleanRepos(dry: boolean, devRoot: string | null): Promise<Freed[]> {
  if (!devRoot) return [];
  const DEV_ROOT = devRoot;
  const live = liveSessionCwds();
  if (!live) return [];
  const out: Freed[] = [];
  for (const name of readdirSync(DEV_ROOT)) {
    const repo = join(DEV_ROOT, name);
    if (!existsSync(join(repo, ".git"))) continue;
    if (!dry) await $`git -C ${repo} worktree prune`.quiet().nothrow();
    const last = (await $`git -C ${repo} log -1 --format=%ct`.quiet().nothrow()).text().trim();
    const idleDays = last ? (Date.now() - Number(last) * 1000) / DAY : Infinity;
    if (idleDays < IDLE_DAYS || hasLiveSession(repo, live)) continue;
    for (const c of REGENERABLE) {
      const p = join(repo, c);
      if (!existsSync(p)) continue;
      const ignored = (await $`git -C ${repo} check-ignore -q ${c}`.quiet().nothrow()).exitCode === 0;
      if (ignored) out.push({ what: `${name}/${c} (ไม่แตะ ${Math.floor(idleDays)} วัน)`, kb: await remove(p, dry) });
    }
  }
  return out;
}

async function cleanToolCaches(dry: boolean): Promise<Freed[]> {
  const out: Freed[] = [];
  const npm = join(process.env.HOME ?? "", ".npm/_cacache");
  if (existsSync(npm)) {
    const kb = await sizeKb(npm);
    if (!dry) await $`npm cache clean --force`.quiet().nothrow();
    out.push({ what: "npm cache", kb });
  }
  const npx = join(process.env.HOME ?? "", ".npm/_npx");
  if (existsSync(npx)) {
    const cutoff = Date.now() - IDLE_DAYS * DAY;
    for (const d of readdirSync(npx)) {
      const p = join(npx, d);
      if (statSync(p).mtimeMs < cutoff) out.push({ what: `npx cache ${d}`, kb: await remove(p, dry) });
    }
  }
  const bunCache = join(process.env.HOME ?? "", ".bun/install/cache");
  if (existsSync(bunCache)) {
    const kb = await sizeKb(bunCache);
    if (!dry) await $`bun pm cache rm`.quiet().nothrow();
    out.push({ what: "bun cache", kb });
  }
  if ((await $`docker info`.quiet().nothrow()).exitCode === 0) {
    const r = dry ? null : await $`docker builder prune -f`.quiet().nothrow();
    const reclaimed = r?.text().match(/Total:\s+([\d.]+)([KMG]B)/);
    const kb = reclaimed ? Number(reclaimed[1]) * ({ KB: 1, MB: 1024, GB: 1_048_576 }[reclaimed[2] as "KB" | "MB" | "GB"]) : 0;
    out.push({ what: "docker build cache", kb });
  }
  return out;
}

const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
const LEDGER = join(ROOT, "runs/branches.txt");

const originUrl = async (repo: string) => (await $`git -C ${repo} remote get-url origin`.quiet().nothrow()).text().trim();

function knownBranches(): Set<string> {
  const fromRuns = listRuns().map((v) => v.branch);
  const fromLedger = existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean) : [];
  return new Set([...fromRuns, ...fromLedger]);
}

async function sweepLeftovers(dry: boolean, devRoot: string | null): Promise<Freed[]> {
  if (!devRoot || !runsReadable()) return [];
  const live = liveSessionCwds();
  if (!live) return [];
  const agent = loadProfile().name;
  const known = knownBranches();
  const openRuns = listRuns().filter((v) => v.status !== "closed");
  const open = new Set(await Promise.all(openRuns.map(async (v) => `${await originUrl(v.repo)}\t${v.branch}`)));
  const out: Freed[] = [];
  for (const name of readdirSync(devRoot)) {
    const repo = real(join(devRoot, name));
    if (!existsSync(join(repo, ".git"))) continue;
    for (const wt of await sweepWorktrees(repo, agent, null, dry)) out.push({ what: `${name}: worktree ${wt} (งานอยู่ใน branch แล้ว)`, kb: 0, isLeftover: true });
    const refs = async (prefix: string) =>
      (await $`git -C ${repo} for-each-ref ${`--format=%(refname:lstrip=${prefix.split("/").length - 2})`} ${prefix}`.quiet().nothrow()).text().split("\n").filter((b) => b && known.has(b));
    if (!(await refs(`refs/remotes/origin/${agent}/`)).length && !(await refs(`refs/heads/${agent}/`)).length) continue;
    const fetched = await fetchOrigin(repo);
    const url = await originUrl(repo);
    if (fetched) {
      for (const branch of await refs(`refs/remotes/origin/${agent}/`)) {
        if (open.has(`${url}\t${branch}`)) continue;
        const into = await landedOnTrunk(repo, `refs/remotes/origin/${branch}`);
        if (!into || (!dry && (await deleteRemoteBranch(repo, branch)))) continue;
        out.push({ what: `${name}: branch ${branch} บน remote (merge เข้า ${into} แล้ว)`, kb: 0, isLeftover: true });
      }
    }
    const checkedOut = (await $`git -C ${repo} worktree list --porcelain`.quiet().nothrow()).text();
    for (const branch of await refs(`refs/heads/${agent}/`)) {
      if (open.has(`${url}\t${branch}`) || checkedOut.includes(`branch refs/heads/${branch}\n`)) continue;
      const into = await mergedInto(repo, `refs/heads/${branch}`);
      if (!into) continue;
      if (!dry) await $`git -C ${repo} branch -D ${branch}`.quiet().nothrow();
      out.push({ what: `${name}: branch ${branch} ในเครื่อง (merge เข้า ${into} แล้ว)`, kb: 0, isLeftover: true });
    }
  }
  const gone = new RegExp(`(/[^\\s'";:&|()]*?/\\.claude/worktrees/${agent}-[^/\\s'";:&|()]+)`, "g");
  for (const line of (await $`ps -axo pid=,command=`.quiet().nothrow()).text().split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m || [process.pid, process.ppid].includes(Number(m[1])) || /(^|\/)claude$/.test(m[2]!.split(/\s+/)[0] ?? "") || m[2]!.includes("/Claude.app/")) continue;
    const dirs = [...m[2]!.matchAll(gone)].map((g) => g[1]!).filter((d) => d.startsWith(`${devRoot}/`));
    if (!dirs.length || dirs.some((d) => existsSync(d))) continue;
    if (!dry) {
      try {
        process.kill(Number(m[1]));
      } catch {}
    }
    out.push({ what: `process ${m[1]} จาก worktree ที่ลบไปแล้ว ${dirs[0]!.slice(devRoot.length + 1)}`, kb: 0, isLeftover: true });
  }
  return out;
}

export async function clean(dry: boolean, devRoot: string | null, owned: "runs" | "all"): Promise<string> {
  const theirs = owned === "all" ? [...(await cleanRepos(dry, devRoot)), ...(await cleanToolCaches(dry))] : [];
  const freed = [...(await closeMergedRuns(dry)), ...(await cleanRuns(dry)), ...(await sweepLeftovers(dry, devRoot)), ...theirs].filter((f) => f.kb > 0 || f.isLeftover);
  const totalGb = freed.reduce((s, f) => s + f.kb, 0) / 1_048_576;
  const lines = freed.map((f) => (f.isLeftover ? `- ${f.what}` : `- ${f.what}: ${(f.kb / 1_048_576).toFixed(2)}G`));
  const summary = `${dry ? "จะลบ" : "ลบแล้ว"} ${totalGb.toFixed(1)}G จาก ${freed.length} รายการ`;
  if (!dry && freed.length) {
    mkdirSync(join(ROOT, "state/clean"), { recursive: true });
    appendFileSync(LOG, `## ${new Date().toLocaleString("sv-SE")} · ${summary}\n${lines.join("\n")}\n\n`);
  }
  return [summary, ...lines].join("\n");
}
