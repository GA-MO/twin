import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

export const ROOT = dirname(import.meta.dir);
export const HOME = homedir();
export const PROFILE_DIR = join(ROOT, "profile");
export const PROFILE_FILE = join(PROFILE_DIR, "twin.json");
export const MODE_DIR = join(PROFILE_DIR, "mode");
export const INTERVIEW_FILE = join(PROFILE_DIR, "interview.md");

export const AgentName = z.string().regex(/^[a-z][a-z0-9-]{1,19}$/, "ชื่อ agent ต้องเป็น a-z 0-9 - ยาว 2-20 ตัว ขึ้นต้นด้วยตัวอักษร (ใช้เป็นชื่อ skill <ชื่อ>-mode)");

export const DEFAULT_MAX_RUNS = 3;
export const MAX_RUNS_CEILING = 20;

export const Browser = z.enum(["baton", "claude-in-chrome", "none"]);
export type Browser = z.infer<typeof Browser>;

const Sources = z.object({ claudeCodeDir: z.string(), claudeCode: z.boolean(), claudeAi: z.string().nullable(), git: z.boolean() });
export const defaultSources = () => ({ claudeCodeDir: join(HOME, ".claude/projects"), claudeCode: false, claudeAi: null, git: false });

export const Profile = z.object({
  name: AgentName,
  os: z.string(),
  devRoot: z.string().nullable(),
  capabilities: z.object({ pstack: z.boolean(), browser: Browser, claude: z.boolean() }),
  collectors: z.record(z.string(), z.boolean()),
  radar: z.string().nullable(),
  onboarded: z.iso.date().nullable(),
  autoClean: z.boolean().default(false),
  sources: Sources.default(defaultSources()),
  scope: z.enum(["global", "project"]).default("global"),
  bun: z.string().default("bun"),
  secretService: AgentName.optional(),
  maxRuns: z.number().int().min(1).max(MAX_RUNS_CEILING).default(DEFAULT_MAX_RUNS),
});
export type Profile = z.infer<typeof Profile>;

export function readProfile(): Profile | null {
  if (!existsSync(PROFILE_FILE)) return null;
  return Profile.parse(JSON.parse(readFileSync(PROFILE_FILE, "utf8")));
}

export function loadProfile(): Profile {
  const p = readProfile();
  if (!p) throw new Error("ยังไม่ได้ setup: รัน bun twin.ts setup");
  return p;
}

export function writeProfile(p: Profile) {
  mkdirSync(PROFILE_DIR, { recursive: true });
  const tmp = `${PROFILE_FILE}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(Profile.parse(p), null, 2)}\n`);
  renameSync(tmp, PROFILE_FILE);
}

export function isSandboxedHome(): boolean {
  if (process.platform === "win32") return false;
  const real = Bun.spawnSync(["sh", "-c", 'eval echo "~$(id -un)"']).stdout.toString().trim();
  return real !== "" && resolve(real) !== resolve(HOME);
}

const InstalledPlugins = z.object({ plugins: z.record(z.string(), z.array(z.object({ installPath: z.string() }))) });
const PSTACK = "pstack@pstack-claude";

export function potetoDir(): string | null {
  const file = join(HOME, ".claude/plugins/installed_plugins.json");
  if (!existsSync(file)) return null;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const parsed = InstalledPlugins.safeParse(json);
  const install = parsed.success ? parsed.data.plugins[PSTACK]?.[0]?.installPath : undefined;
  const dir = install ? join(install, "skills/poteto-mode") : null;
  return dir && existsSync(join(dir, "SKILL.md")) ? dir : null;
}

export const modeHookCommand = () => `"${process.execPath}" "${join(ROOT, "twin.ts")}" mode`;

export const ownUserSettings = (scope: Profile["scope"]) =>
  scope === "global" ? { hooks: { SessionStart: [{ matcher: "startup|clear|compact", hooks: [{ type: "command", command: modeHookCommand(), timeout: 10 }] }] } } : {};
