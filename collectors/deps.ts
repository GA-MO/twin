import { $ } from "bun";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector, type AttentionItem } from "../lib/collector.ts";

const DAY = 86_400_000;
const ACTIVE_DAYS = 14;
const SERIOUS = new Set(["high", "critical"]);

type Manager = "bun" | "pnpm" | "npm";
type Advisory = { pkg: string; severity: string };
type Behind = { pkg: string; current: string; latest: string };
type Report = { name: string; manager: Manager; advisories: Advisory[]; majorsBehind: Behind[] };

const LOCKS: [string, Manager][] = [["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["package-lock.json", "npm"]];

const BunAudit = z.record(z.string(), z.array(z.object({ severity: z.string() })));
const PnpmAudit = z.object({ advisories: z.record(z.string(), z.object({ module_name: z.string(), severity: z.string() })) });
const NpmAudit = z.object({ vulnerabilities: z.record(z.string(), z.object({ severity: z.string() })) });
const JsonOutdated = z.record(z.string(), z.object({ current: z.string().optional(), latest: z.string().optional() }));

const json = (text: string): unknown => {
  const start = text.indexOf("{");
  if (start < 0) return {};
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return {};
  }
};

async function run(repo: string, cmd: string[]): Promise<string> {
  return (await $`${cmd}`.cwd(repo).quiet().nothrow()).stdout.toString();
}

async function audit(repo: string, manager: Manager): Promise<Advisory[]> {
  const out = json(await run(repo, [manager, "audit", "--json"]));
  if (manager === "bun") {
    const r = BunAudit.safeParse(out);
    return r.success ? Object.entries(r.data).flatMap(([pkg, list]) => list.map((a) => ({ pkg, severity: a.severity }))) : [];
  }
  if (manager === "pnpm") {
    const r = PnpmAudit.safeParse(out);
    return r.success ? Object.values(r.data.advisories).map((a) => ({ pkg: a.module_name, severity: a.severity })) : [];
  }
  const r = NpmAudit.safeParse(out);
  return r.success ? Object.entries(r.data.vulnerabilities).map(([pkg, v]) => ({ pkg, severity: v.severity })) : [];
}

const major = (v: string) => Number(v.replace(/^[^\d]*/, "").split(".")[0]);

async function outdated(repo: string, manager: Manager): Promise<Behind[]> {
  const rows: Behind[] =
    manager === "bun"
      ? (await run(repo, ["bun", "outdated"]))
          .split("\n")
          .map((l) => l.split("|").map((c) => c.trim()))
          .filter((c) => c.length >= 6 && c[1] && c[1] !== "Package" && !c[1].startsWith("-"))
          .map((c) => ({ pkg: c[1]!.replace(/ \(dev\)$/, ""), current: c[2]!, latest: c[4]! }))
      : Object.entries(JsonOutdated.safeParse(json(await run(repo, manager === "pnpm" ? ["pnpm", "outdated", "-r", "--format", "json"] : ["npm", "outdated", "--json"]))).data ?? {}).map(
          ([pkg, v]) => ({ pkg, current: v.current ?? "", latest: v.latest ?? "" }),
        );
  return rows.filter((r) => r.current && r.latest && major(r.latest) > major(r.current));
}

async function activeRepos(devRoot: string): Promise<{ name: string; path: string; manager: Manager }[]> {
  const out: { name: string; path: string; manager: Manager }[] = [];
  for (const name of readdirSync(devRoot)) {
    const path = join(devRoot, name);
    const lock = LOCKS.find(([f]) => existsSync(join(path, f)));
    if (!lock || !existsSync(join(path, ".git"))) continue;
    const last = Number((await $`git -C ${path} log -1 --format=%ct`.quiet().nothrow()).text().trim());
    if (last && Date.now() - last * 1000 < ACTIVE_DAYS * DAY) out.push({ name, path, manager: lock[1] });
  }
  return out;
}

const serious = (r: Report) => r.advisories.filter((a) => SERIOUS.has(a.severity));
const uniq = (xs: string[]) => [...new Set(xs)];

function section(r: Report): string {
  const lines = [`## ${r.name} · ${r.manager}`];
  lines.push(r.advisories.length ? `- advisory ${r.advisories.length} (high/critical ${serious(r).length}): ${uniq(serious(r).map((a) => a.pkg)).join(", ") || "-"}` : "- advisory: ไม่มี");
  lines.push(r.majorsBehind.length ? `- ตามหลัง major ${r.majorsBehind.length}: ${r.majorsBehind.map((b) => `${b.pkg} ${b.current}→${b.latest}`).join(", ")}` : "- ตามหลัง major: ไม่มี");
  return lines.join("\n");
}

export default defineCollector({
  title: "Dependencies",
  order: 75,
  everyMinutes: 24 * 60,
  timeoutSeconds: 600,
  inBrief: false,
  keep: "snapshot",
  defaultOn: false,
  requires: ["devRoot"],
  async run({ now, profile }) {
    const reports: Report[] = [];
    for (const repo of await activeRepos(profile.devRoot!)) {
      const [advisories, majorsBehind] = await Promise.all([audit(repo.path, repo.manager), outdated(repo.path, repo.manager)]);
      reports.push({ name: repo.name, manager: repo.manager, advisories, majorsBehind });
    }
    const flagged = reports.filter((r) => serious(r).length);
    const items: AttentionItem[] = flagged.length
      ? [{ key: "deps:advisories", title: `security advisory high/critical ใน ${flagged.length} project: ${flagged.map((r) => `${r.name} ${serious(r).length}`).join(", ")} (state/deps/)`, score: 30 }]
      : [];
    const md = [`# Dependencies · ${now.toLocaleDateString("sv-SE")}`, "รายงานอย่างเดียว ไม่อัปเกรดเอง. project ที่มี commit ใน 14 วัน.", ...reports.map(section)].join("\n\n");
    return { kind: "ok", files: { "index.md": `${md}\n` }, brief: "", items };
  },
});
