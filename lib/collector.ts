import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ROOT, type Profile } from "./profile.ts";
import { z } from "zod";
import { importOwner, ownerFiles, shown, type OwnerFiles } from "./extensions.ts";
import { inside } from "./paths.ts";
import { getSecret } from "./secrets.ts";

const STATE = join(ROOT, "state");
const BRIEF_DIR = join(STATE, "brief");
const LOCKS = join(STATE, ".locks");

export type AttentionItem = {
  key: string;
  title: string;
  project?: string;
  due?: string;
  owner?: string;
  score: number;
};

export type OwnedLine = { owner: string; text: string };

export type CollectorOutput = {
  files: Record<string, string>;
  brief: string;
  owned?: OwnedLine[];
  items: AttentionItem[];
};

export type CollectorResult = ({ kind: "ok" } & CollectorOutput) | { kind: "off"; why: string };

export type Context = {
  now: Date;
  profile: Profile;
  secret(name: string): Promise<string | null>;
};

export type Requirement = "macos" | "posix" | "devRoot" | "consent" | "claude";

const REQUIREMENTS: Record<Requirement, { met(p: Profile): boolean; why: string }> = {
  macos: { met: () => process.platform === "darwin", why: "ใช้ได้เฉพาะ macOS" },
  posix: { met: () => process.platform !== "win32", why: "ใช้บน Windows ไม่ได้" },
  devRoot: { met: (p) => p.devRoot !== null, why: "ยังไม่ได้ตั้ง devRoot: bun twin.ts profile devRoot=<path>" },
  claude: { met: (p) => p.capabilities.claude, why: "ไม่พบคำสั่ง claude: ติดตั้ง Claude Code แล้วรัน bun twin.ts setup อีกครั้ง" },
  consent: { met: (p) => p.sources.claudeCode || p.sources.claudeAi !== null || (p.sources.git && p.devRoot !== null), why: "เจ้าของยังไม่ได้ยินยอมให้อ่านประวัติ: bun twin.ts profile source.claudeCode=on" },
};

export type Collector = {
  title: string;
  order: number;
  everyMinutes: number;
  timeoutSeconds?: number;
  inBrief?: boolean;
  keep: "snapshot" | "archive";
  defaultOn: boolean;
  requires?: Requirement[];
  refreshOnBrief?: boolean;
  run(ctx: Context): Promise<CollectorResult>;
};

export const defineCollector = (c: Collector) => c;

export type Fragment = {
  name: string;
  title: string;
  order: number;
  status: "ok" | "off" | "error";
  ranAt: string;
  okAt?: string;
  why?: string;
  dir: string;
  inBrief: boolean;
  body: string;
  owned?: OwnedLine[];
  items: AttentionItem[];
};

const ENGINE_DIR = join(ROOT, "collectors");
const ENGINE_STATE = ["brief", "bin", "clean", "evals"];

const engineCollectors = () =>
  new Map(
    readdirSync(ENGINE_DIR)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => [basename(f, ".ts"), join(ENGINE_DIR, f)] as const),
  );

export function ownerCollectors(): OwnerFiles {
  return ownerFiles("collectors", [...engineCollectors().keys(), ...ENGINE_STATE]);
}

const isOwner = (name: string) => !engineCollectors().has(name);

export function collectorNames(): string[] {
  return [...engineCollectors().keys(), ...ownerCollectors().files.keys()].sort();
}

const OwnerCollector = z.object({
  title: z.string(),
  order: z.number(),
  everyMinutes: z.number().positive(),
  timeoutSeconds: z.number().positive().optional(),
  inBrief: z.boolean().optional(),
  keep: z.enum(["snapshot", "archive"]),
  defaultOn: z.boolean(),
  requires: z.array(z.enum(Object.keys(REQUIREMENTS) as [Requirement, ...Requirement[]])).optional(),
  run: z.custom<Collector["run"]>((v) => typeof v === "function", "run ต้องเป็น function"),
});

const broken = (name: string, why: string): Collector => ({
  title: name,
  order: 900,
  everyMinutes: 60,
  keep: "snapshot",
  defaultOn: true,
  run: async () => {
    throw new Error(why);
  },
});

export async function loadCollector(name: string): Promise<Collector> {
  const engine = engineCollectors().get(name);
  if (engine) return ((await import(engine)) as { default: Collector }).default;
  const file = ownerCollectors().files.get(name);
  if (!file) throw new Error(`ไม่มี collector ${name} (มี: ${collectorNames().join(", ")})`);
  const loaded = await importOwner(file);
  if (!loaded.ok) return broken(name, loaded.why);
  const parsed = OwnerCollector.safeParse(loaded.value);
  if (!parsed.success) return broken(name, `${shown(file)} ต้อง export default defineCollector({...}): ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return parsed.data as Collector;
}

export const unmetRequirement = (c: Collector, p: Profile): string | null => (c.requires ?? []).map((r) => REQUIREMENTS[r]).find((r) => !r.met(p))?.why ?? null;

export const isEnabled = (c: Collector, name: string, p: Profile) => p.collectors[name] ?? (c.defaultOn && unmetRequirement(c, p) === null);

export async function enabledCollectors(p: Profile): Promise<string[]> {
  const out: string[] = [];
  for (const name of collectorNames()) if (isEnabled(await loadCollector(name), name, p)) out.push(name);
  return out;
}

export function readFragments(enabled: string[]): Fragment[] {
  if (!existsSync(BRIEF_DIR)) return [];
  return readdirSync(BRIEF_DIR)
    .filter((f) => f.endsWith(".json") && enabled.includes(basename(f, ".json")))
    .map((f) => JSON.parse(readFileSync(join(BRIEF_DIR, f), "utf8")) as Fragment)
    .sort((a, b) => a.order - b.order);
}

function readFragment(name: string): Fragment | null {
  const p = join(BRIEF_DIR, `${name}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Fragment) : null;
}

export function isDue(c: Collector, name: string, now: Date): boolean {
  const f = readFragment(name);
  return !f || now.getTime() - Date.parse(f.ranAt) >= c.everyMinutes * 60_000;
}

function writeAtomic(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function outputDir(name: string, c: Collector) {
  return c.keep === "archive" && !isOwner(name) ? join(ROOT, name) : join(STATE, name);
}

function acquireLock(name: string): boolean {
  mkdirSync(LOCKS, { recursive: true });
  const lock = join(LOCKS, `${name}.pid`);
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    try {
      process.kill(pid, 0);
      return false;
    } catch {}
  }
  writeFileSync(lock, String(process.pid));
  return true;
}

function releaseLock(name: string) {
  rmSync(join(LOCKS, `${name}.pid`), { force: true });
}

export async function runCollector(name: string, profile: Profile): Promise<Fragment["status"] | "busy"> {
  if (!acquireLock(name)) return "busy";
  try {
    const c = await loadCollector(name);
    const now = new Date();
    const dir = outputDir(name, c);
    const prev = readFragment(name);
    const base = { name, title: c.title, order: c.order, ranAt: now.toISOString(), dir: dir.slice(ROOT.length + 1) + "/", inBrief: c.inBrief ?? true };
    let fragment: Fragment;
    try {
      const unmet = unmetRequirement(c, profile);
      const r: CollectorResult = unmet ? { kind: "off", why: unmet } : await c.run({ now, profile, secret: getSecret });
      if (r.kind === "off") {
        if (c.keep === "snapshot") mirror(dir, new Set());
        fragment = { ...base, status: "off", why: r.why, body: "", items: [] };
      } else {
        const outside = Object.keys(r.files).find((rel) => !inside(dir, join(dir, rel)));
        if (outside) throw new Error(`ไฟล์ ${outside} อยู่นอก ${dir.slice(ROOT.length + 1)}/`);
        for (const [rel, content] of Object.entries(r.files)) writeAtomic(join(dir, rel), content);
        if (c.keep === "snapshot") mirror(dir, new Set(Object.keys(r.files)));
        fragment = { ...base, status: "ok", okAt: now.toISOString(), body: r.brief, owned: r.owned ?? [], items: r.items };
      }
    } catch (e) {
      fragment = {
        ...base,
        status: "error",
        why: e instanceof Error ? e.message.split("\n")[0]! : String(e),
        ...(prev?.okAt ? { okAt: prev.okAt } : {}),
        body: prev?.body ?? "",
        owned: prev?.owned ?? [],
        items: prev?.items ?? [],
      };
    }
    writeAtomic(join(BRIEF_DIR, `${name}.json`), JSON.stringify(fragment, null, 2));
    return fragment.status;
  } finally {
    releaseLock(name);
  }
}

export async function clearCollector(name: string) {
  const c = await loadCollector(name);
  if (c.keep === "snapshot") rmSync(outputDir(name, c), { recursive: true, force: true });
  rmSync(join(BRIEF_DIR, `${name}.json`), { force: true });
}

function mirror(dir: string, keep: Set<string>) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!f.isFile()) continue;
    const rel = join(f.parentPath, f.name).slice(dir.length + 1);
    if (!keep.has(rel)) rmSync(join(dir, rel));
  }
}
