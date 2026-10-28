import { $ } from "bun";
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profile.ts";
import { close, listRuns } from "./dispatch.ts";
import { hasLiveSession, liveSessionCwds } from "./sessions.ts";

const IDLE_DAYS = 14;
const CLOSED_RUN_DAYS = 30;
const REGENERABLE = ["node_modules", ".next", "dist", ".turbo", "build", ".dart_tool", ".svelte-kit", ".nuxt", ".parcel-cache"];
const MERGE_TARGETS = ["develop", "uat", "sit", "sit-2", "main", "master"];
const LOG = join(ROOT, "state/clean/log.md");
const DAY = 86_400_000;

type Freed = { what: string; kb: number };

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
  for (const v of listRuns().filter((v) => (v.status === "finished" || v.status === "crashed") && v.commits.length)) {
    if (!fetched.has(v.repo)) {
      await $`git -C ${v.repo} fetch -q origin`.quiet().nothrow();
      fetched.add(v.repo);
    }
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
    if (statSync(join(dir, "closed.md")).mtimeMs < cutoff) out.push({ what: `runs/${v.id}`, kb: await remove(dir, dry) });
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

export async function clean(dry: boolean, devRoot: string | null, owned: "runs" | "all"): Promise<string> {
  const theirs = owned === "all" ? [...(await cleanRepos(dry, devRoot)), ...(await cleanToolCaches(dry))] : [];
  const freed = [...(await closeMergedRuns(dry)), ...(await cleanRuns(dry)), ...theirs].filter((f) => f.kb > 0);
  const totalGb = freed.reduce((s, f) => s + f.kb, 0) / 1_048_576;
  const lines = freed.map((f) => `- ${f.what}: ${(f.kb / 1_048_576).toFixed(2)}G`);
  const summary = `${dry ? "จะลบ" : "ลบแล้ว"} ${totalGb.toFixed(1)}G จาก ${freed.length} รายการ`;
  if (!dry && freed.length) {
    mkdirSync(join(ROOT, "state/clean"), { recursive: true });
    appendFileSync(LOG, `## ${new Date().toLocaleString("sv-SE")} · ${summary}\n${lines.join("\n")}\n\n`);
  }
  return [summary, ...lines].join("\n");
}
