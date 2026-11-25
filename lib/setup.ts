import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { enabledCollectors } from "./collector.ts";
import { installGate, removeGate } from "./evalgate.ts";
import { OWNER, ownerSkills } from "./extensions.ts";
import { FILES, starterCoverage } from "./identity.ts";
import { installSchedule, removeSchedule } from "./os.ts";
import { MODE_FILE, MODE_HOOK_FILE, MODE_HOOKS, modeReadRule, placeImport, writeMode } from "./mode.ts";
import { inside } from "./paths.ts";
import { AgentName, DEFAULT_MAX_RUNS, HOME, MODE_DIR, ROOT, defaultSources, isSandboxedHome, potetoDir, readProfile, writeProfile, type Browser, type Profile } from "./profile.ts";
import { tr } from "./lang.ts";

const CLAUDE_IN_CHROME = "fcoeoabgfenejglbffodgkkbkcdhcgfn";
const DEV_CANDIDATES = ["Development", "Projects", "projects", "code", "src", "dev"];

function chromeProfiles(): string {
  if (process.platform === "darwin") return join(HOME, "Library/Application Support/Google/Chrome");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(HOME, "AppData/Local"), "Google/Chrome/User Data");
  return join(HOME, ".config/google-chrome");
}

function detectBrowser(): Browser {
  if (Bun.which("baton")) return "baton";
  const root = chromeProfiles();
  if (!existsSync(root)) return "none";
  const found = readdirSync(root).some((d) => existsSync(join(root, d, "Extensions", CLAUDE_IN_CHROME)));
  return found ? "claude-in-chrome" : "none";
}

function detectDevRoot(): string | null {
  return DEV_CANDIDATES.map((d) => join(HOME, d)).find((p) => existsSync(p)) ?? null;
}

export const skeleton = (name: string) => `---
name: ${name}-mode
description: "ตัวตนของเจ้าของ ${name}: ${name} ตัดสินใจ คุย และทำงานแทนเขาอย่างไร โหลดเต็มเข้าทุก session ผ่าน CLAUDE.md (state/mode.md) จึงไม่ต้องเรียกเป็น skill"
disable-model-invocation: true
---

# ${name}-mode

${name} ยังไม่รู้จักเจ้าของ: ยังไม่ได้ onboard

- ทุก session ที่ไฟล์นี้ยังเป็นแบบนี้ ให้ชวนเจ้าของพิมพ์ \`onboard\` ใน repo ของ ${name} ก่อนเรื่องอื่น (ประมาณ 20-30 นาที ถามทีละข้อ)
- จนกว่าจะ onboard ทุกเรื่องอยู่ขั้น 1: แนะนำได้อย่างเดียว ห้ามทำสิ่งที่คนอื่นเห็นหรือย้อนกลับไม่ได้ในนามเจ้าของ
- ตอบภาษาเดียวกับที่เจ้าของพิมพ์ สั้น และให้คำแนะนำเดียวเมื่อมีทางเลือก
`;

const SCOPES = ["global", "project"] as const;
export type Scope = (typeof SCOPES)[number];
export const isScope = (s: string): s is Scope => (SCOPES as readonly string[]).includes(s);

const skillsDir = (scope: Scope) => (scope === "global" ? join(HOME, ".claude/skills") : join(ROOT, ".claude/skills"));
const skillLink = (name: string, scope: Scope) => join(skillsDir(scope), `${name}-mode`);

function checkModeLink(name: string, scope: Scope) {
  const link = skillLink(name, scope);
  if (!pointsHere(link) && (existsSync(link) || isLink(link))) throw new Error(tr(`มี ${link} อยู่แล้วและไม่ใช่ของ twin นี้: ตั้งชื่ออื่น หรือย้ายของเดิมออกก่อน`, `${link} exists and is not from this twin: pick another name, or move it away first`));
}

export const renameInMode = (text: string, previous: string, name: string) =>
  text.replace(new RegExp(`(^|[^\\w.-])${previous}(?![\\w.-])`, "g"), `$1${name}`).replaceAll(`${previous}-mode`, `${name}-mode`);

function installMode(name: string, previous: string | null, scope: Scope): string {
  const file = join(MODE_DIR, "SKILL.md");
  mkdirSync(MODE_DIR, { recursive: true });
  if (!existsSync(file)) writeFileSync(file, skeleton(name));
  else if (previous && previous !== name) writeFileSync(file, renameInMode(readFileSync(file, "utf8"), previous, name));
  const at = skillLink(name, scope);
  if (!pointsHere(at)) link(MODE_DIR, at);
  const stale = [...new Set(SCOPES.flatMap((sc) => [skillLink(name, sc), ...(previous ? [skillLink(previous, sc)] : [])]))].filter((p) => p !== at && pointsHere(p));
  for (const p of stale) rmSync(p);
  return `skill ${name}-mode → ${MODE_DIR} (${at})`;
}

const isLink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

const linkTarget = (p: string) => (isLink(p) ? resolve(dirname(p), readlinkSync(p).replace(/^\\\\\?\\/, "")) : null);
const pointsHere = (p: string) => linkTarget(p) === resolve(MODE_DIR);
const link = (target: string, at: string) => {
  mkdirSync(dirname(at), { recursive: true });
  symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
};

export type SkillState = { skill: string; link: string; state: "linked" | "unlinked" | "taken" };

const engineSkills = () => {
  const dir = join(ROOT, ".claude/skills");
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
};

export function ownerSkillStates(agent: string, scope: Scope): SkillState[] {
  const reserved = new Set([...engineSkills(), `${agent}-mode`]);
  return ownerSkills().map((skill) => {
    const at = join(skillsDir(scope), skill);
    const state = linkTarget(at) === resolve(OWNER.skills, skill) ? "linked" : reserved.has(skill) || existsSync(at) || isLink(at) ? "taken" : "unlinked";
    return { skill, link: at, state };
  });
}

const ownerSkillLinks = (scope: Scope) => {
  const dir = skillsDir(scope);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((d) => join(dir, d))
    .filter((p) => {
      const target = linkTarget(p);
      return target !== null && inside(OWNER.skills, target);
    });
};

function installOwnerSkills(agent: string, scope: Scope): string[] {
  const states = ownerSkillStates(agent, scope);
  const log: string[] = [];
  for (const s of states) {
    if (s.state === "unlinked") link(join(OWNER.skills, s.skill), s.link);
    if (s.state === "taken") log.push(tr(`⚠ ข้าม skill ${s.skill}: มี ${s.link} อยู่แล้วและไม่ใช่ของ twin นี้ (เปลี่ยนชื่อโฟลเดอร์ใน profile/skills/)`, `⚠ skipped skill ${s.skill}: ${s.link} exists and is not from this twin (rename the folder in profile/skills/)`));
  }
  const keep = new Set(states.filter((s) => s.state !== "taken").map((s) => s.link));
  for (const sc of SCOPES)
    for (const p of ownerSkillLinks(sc))
      if (!keep.has(p)) {
        rmSync(p);
        log.push(tr(`เอาลิงก์ skill ${p} ออก`, `removed the skill link ${p}`));
      }
  const linked = states.filter((s) => s.state !== "taken").map((s) => s.skill);
  return [...(linked.length ? [`${tr("skill ของคุณเอง", "your own skills")}: ${linked.join(", ")} → ${skillsDir(scope)}`] : []), ...log];
}

export const skillNotices = (agent: string, scope: Scope) =>
  ownerSkillStates(agent, scope).flatMap((s) =>
    s.state === "unlinked" ? [`skill ${s.skill} ยังไม่ได้ลิงก์ให้ Claude Code เห็น: รัน bun twin.ts setup`] : s.state === "taken" ? [`skill ${s.skill} ชื่อซ้ำกับ skill ที่มีอยู่แล้ว: เปลี่ยนชื่อโฟลเดอร์ใน profile/skills/`] : [],
  );

const HookCommand = z.looseObject({ type: z.string(), command: z.string().optional() });
const HookGroup = z.looseObject({ matcher: z.string().optional(), hooks: z.array(HookCommand) });
const Settings = z.looseObject({ hooks: z.record(z.string(), z.array(z.unknown())).optional(), permissions: z.looseObject({ allow: z.array(z.string()).optional() }).optional() });


function readSettings(file: string): z.infer<typeof Settings> {
  if (!existsSync(file)) return {};
  try {
    return Settings.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    throw new Error(tr(`อ่าน ${file} ไม่ได้: แก้ให้เป็น JSON ที่ถูกต้องก่อน แล้วลองใหม่`, `cannot read ${file}: make it valid JSON, then try again`));
  }
}

const globalSettings = () => join(HOME, ".claude/settings.json");
const localSettings = () => join(ROOT, ".claude/settings.local.json");
const readLocal = () => (existsSync(localSettings()) ? z.looseObject({}).parse(JSON.parse(readFileSync(localSettings(), "utf8"))) : {});

const ours = (group: unknown) => {
  const g = HookGroup.safeParse(group);
  return g.success && g.data.hooks.some((h) => h.command?.endsWith(`"${join(ROOT, "twin.ts")}" mode`) || h.command?.endsWith(`"${MODE_HOOK_FILE}"`));
};

function placeHook(file: string, present: boolean): boolean {
  if (!present && !existsSync(file)) return false;
  const settings = readSettings(file);
  const current = (event: string) => settings.hooks?.[event] ?? [];
  const rule = modeReadRule();
  const allow = settings.permissions?.allow ?? [];
  if (!present && !MODE_HOOKS.some((h) => current(h.event).some(ours)) && !allow.includes(rule)) return false;
  const placed = Object.fromEntries(
    MODE_HOOKS.flatMap((h) => {
      const others = current(h.event).filter((g) => !ours(g));
      const group = { ...("matcher" in h ? { matcher: h.matcher } : {}), hooks: [{ type: "command", command: h.command(), timeout: h.timeout }] };
      return present ? [[h.event, [...others, group]]] : others.length ? [[h.event, others]] : [];
    }),
  );
  const hooks = Object.fromEntries(Object.entries({ ...settings.hooks, ...placed }).filter(([event]) => event in placed || !MODE_HOOKS.some((h) => h.event === event)));
  const kept = allow.filter((r) => r !== rule);
  const { allow: _allow, ...restPermissions } = settings.permissions ?? {};
  const permissions = present || kept.length ? { ...restPermissions, allow: present ? [...kept, rule] : kept } : restPermissions;
  const next = Object.fromEntries(Object.entries({ ...settings, hooks, permissions }).filter(([key, value]) => !["hooks", "permissions"].includes(key) || Object.keys(value ?? {}).length));
  const target = existsSync(file) ? realpathSync(file) : file;
  mkdirSync(dirname(target), { recursive: true });
  writeAtomic(target, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}

function installHook(scope: Scope): string {
  const [target, other] = scope === "global" ? [globalSettings(), localSettings()] : [localSettings(), globalSettings()];
  placeHook(target, true);
  const moved = placeHook(other, false);
  placeImport(scope === "global");
  writeMode();
  const via = scope === "global" ? "~/.claude/CLAUDE.md" : tr("CLAUDE.md ของ repo นี้", "the CLAUDE.md of this repo");
  return tr(`hook ของ mode ใน ${target}${moved ? ` (เอาของเดิมออกจาก ${other})` : ""} · ตัวตนโหลดผ่าน ${via}`, `mode hooks in ${target}${moved ? ` (removed the old one from ${other})` : ""} · identity loads through ${via}`);
}

const MARKETPLACE = `twin-mods-${new Bun.CryptoHasher("sha256").update(ROOT).digest("hex").slice(0, 8)}`;
const isOurMarketplace = (key: string) => key === "twin-mods" || key.startsWith("twin-mods-");
const isOurPlugin = (key: string) => key.startsWith("twin@") && isOurMarketplace(key.slice("twin@".length));

function withoutMods(): { current: Record<string, unknown>; known: Record<string, unknown>; enabled: Record<string, unknown>; had: boolean; off: boolean } {
  const current = readLocal();
  const Plugins = z.record(z.string(), z.unknown()).optional();
  const known = Plugins.parse(current["extraKnownMarketplaces"]) ?? {};
  const enabled = Plugins.parse(current["enabledPlugins"]) ?? {};
  const had = Object.keys(known).some(isOurMarketplace) || Object.keys(enabled).some(isOurPlugin);
  const off = Object.entries(enabled).some(([k, v]) => isOurPlugin(k) && v === false);
  return {
    current,
    known: Object.fromEntries(Object.entries(known).filter(([k]) => !isOurMarketplace(k))),
    enabled: Object.fromEntries(Object.entries(enabled).filter(([k]) => !isOurPlugin(k))),
    had,
    off,
  };
}

const MODS = join(ROOT, "mods");
const MANIFEST = join(MODS, ".claude-plugin/marketplace.json");
const Registered = z.array(z.looseObject({ name: z.string(), path: z.string().optional() }));

async function forgetMarketplaces(drop: (name: string) => boolean): Promise<string[]> {
  if (!Bun.which("claude")) return [];
  const list = await Bun.$`claude plugin marketplace list --json`.quiet().nothrow();
  if (list.exitCode !== 0) return [];
  const parsed = Registered.safeParse(parseJson(list.text()));
  if (!parsed.success) return [];
  const stale = parsed.data.filter((m) => isOurMarketplace(m.name) && drop(m.name) && m.path !== undefined && (m.path === MODS || !existsSync(m.path)));
  for (const m of stale) await Bun.$`claude plugin marketplace remove ${m.name}`.quiet().nothrow();
  return stale.map((m) => m.name);
}

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  const mode = statSync(file, { throwIfNoEntry: false })?.mode;
  writeFileSync(tmp, text, mode === undefined ? {} : { mode: mode & 0o777 });
  renameSync(tmp, file);
}

function writeManifest(): void {
  const manifest = { name: MARKETPLACE, owner: { name: "twin" }, plugins: [{ name: "twin", source: "./twin", description: "What the twin's workers are doing, beside the chat" }] };
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeAtomic(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function healMods(): void {
  if (!existsSync(localSettings())) return;
  const local = z.object({ extraKnownMarketplaces: z.record(z.string(), z.unknown()).optional() }).safeParse(parseJson(readFileSync(localSettings(), "utf8")));
  if (!local.success) return;
  const known = Object.keys(local.data.extraKnownMarketplaces ?? {}).filter(isOurMarketplace);
  if (known.length === 0) return;
  const manifest = existsSync(MANIFEST) ? z.object({ name: z.string() }).safeParse(parseJson(readFileSync(MANIFEST, "utf8"))).data?.name : undefined;
  if (manifest === MARKETPLACE && known.length === 1 && known[0] === MARKETPLACE) return;
  enableMods();
}

async function enableModsAndForget(): Promise<string[]> {
  const log = [enableMods()];
  const forgot = await forgetMarketplaces((name) => name !== MARKETPLACE);
  if (forgot.length) log.push(`${tr("เอา marketplace เก่าของ twin ออกจาก Claude", "removed old twin marketplaces from Claude")}: ${forgot.join(", ")}`);
  return log;
}

function enableMods(): string {
  writeManifest();
  const { current, known, enabled, off } = withoutMods();
  const next = {
    ...current,
    extraKnownMarketplaces: { ...known, [MARKETPLACE]: { source: { source: "directory", path: MODS } } },
    enabledPlugins: { ...enabled, [`twin@${MARKETPLACE}`]: !off },
  };
  writeAtomic(localSettings(), `${JSON.stringify(next, null, 2)}\n`);
  return tr(`แถบสถานะงาน (mods/twin) เปิดใน .claude/settings.local.json · marketplace ${MARKETPLACE} ของ repo นี้`, `status band (mods/twin) on in .claude/settings.local.json · marketplace ${MARKETPLACE} of this repo`);
}

function disableMods(): boolean {
  if (!existsSync(localSettings())) return false;
  const { current, known, enabled, had } = withoutMods();
  if (!had) return false;
  writeFileSync(localSettings(), `${JSON.stringify({ ...current, extraKnownMarketplaces: known, enabledPlugins: enabled }, null, 2)}\n`);
  return true;
}

export async function uninstall(): Promise<string[]> {
  const name = readProfile()?.name;
  const log: string[] = [];
  for (const file of [globalSettings(), localSettings()]) if (placeHook(file, false)) log.push(tr(`เอา hook ของ mode ออกจาก ${file}`, `removed the mode hooks from ${file}`));
  if (placeImport(false)) log.push(tr("เอาบรรทัด import ตัวตนออกจาก ~/.claude/CLAUDE.md", "removed the identity import line from ~/.claude/CLAUDE.md"));
  if (existsSync(MODE_FILE)) {
    rmSync(MODE_FILE);
    log.push(tr("ลบ state/mode.md", "deleted state/mode.md"));
  }
  if (disableMods()) log.push(tr("ปิดแถบสถานะงานใน .claude/settings.local.json", "turned the status band off in .claude/settings.local.json"));
  if (existsSync(MANIFEST)) rmSync(MANIFEST);
  const forgot = await forgetMarketplaces(() => true);
  if (forgot.length) log.push(`${tr("เอา marketplace ของ twin ออกจาก Claude", "removed twin marketplaces from Claude")}: ${forgot.join(", ")}`);
  if (removeGate()) log.push(tr("เอา eval gate ของ commit improve: ออก", "removed the eval gate for improve: commits"));
  if (name)
    for (const scope of SCOPES) {
      const link = skillLink(name, scope);
      if (pointsHere(link)) {
        rmSync(link);
        log.push(tr(`เอาลิงก์ skill ${link} ออก`, `removed the skill link ${link}`));
      }
    }
  for (const scope of SCOPES)
    for (const p of ownerSkillLinks(scope)) {
      rmSync(p);
      log.push(tr(`เอาลิงก์ skill ${p} ออก`, `removed the skill link ${p}`));
    }
  log.push(...(await removeSchedule(!isSandboxedHome())));
  return log;
}

export type SetupOptions = { name: string | null; devRoot: string | null; schedule: boolean; scope: Scope | null };

export async function setup(opts: SetupOptions): Promise<{ profile: Profile; log: string[] }> {
  const prev = readProfile();
  const name = AgentName.parse(opts.name ?? prev?.name);
  const devRoot = opts.devRoot ? resolve(opts.devRoot) : (prev?.devRoot ?? detectDevRoot());
  if (devRoot && !existsSync(devRoot)) throw new Error(tr(`ไม่พบ devRoot ${devRoot}`, `devRoot ${devRoot} not found`));
  const profile: Profile = {
    name,
    os: process.platform,
    devRoot,
    capabilities: { pstack: potetoDir() !== null, browser: detectBrowser(), claude: Bun.which("claude") !== null },
    collectors: prev?.collectors ?? {},
    radar: prev?.radar ?? null,
    onboarded: prev?.onboarded ?? null,
    autoClean: prev?.autoClean ?? false,
    sources: { ...(prev?.sources ?? defaultSources()), claudeCodeDir: defaultSources().claudeCodeDir },
    scope: opts.scope ?? prev?.scope ?? "global",
    bun: process.execPath,
    secretService: prev?.secretService ?? name,
    maxRuns: prev?.maxRuns ?? DEFAULT_MAX_RUNS,
    schedule: opts.schedule,
  };
  const scope = profile.scope;
  checkModeLink(name, scope);
  readSettings(globalSettings());
  try {
    readLocal();
  } catch {
    throw new Error(tr(`อ่าน ${localSettings()} ไม่ได้: แก้ให้เป็น JSON ที่ถูกต้องก่อน แล้วรัน setup ใหม่`, `cannot read ${localSettings()}: make it valid JSON, then run setup again`));
  }
  writeProfile(profile);
  if (!existsSync(FILES.coverage)) writeFileSync(FILES.coverage, starterCoverage());
  const on = await enabledCollectors(profile);
  const log = [
    `profile/twin.json · ${name} · ${profile.os} · devRoot ${devRoot ?? "-"} · pstack ${profile.capabilities.pstack ? tr("มี", "yes") : tr("ไม่มี (ใช้วิธีทำงานแบบ lean)", "no (lean way of working)")} · browser ${profile.capabilities.browser}${profile.capabilities.claude ? "" : tr(" · ⚠ ไม่พบคำสั่ง claude", " · ⚠ claude command not found")}`,
    `${tr("collector ที่เปิด", "collectors on")}: ${on.join(", ")}`,
    installMode(name, prev?.name ?? null, scope),
    ...installOwnerSkills(name, scope),
    installHook(scope),
    ...(await enableModsAndForget()),
    installGate(),
  ];
  const load = opts.schedule && !isSandboxedHome();
  if (opts.schedule && !load) log.push(tr(`HOME (${HOME}) ไม่ใช่ home จริงของ user: ไม่ลงตารางเวลากับระบบ`, `HOME (${HOME}) is not the real home of this user: the schedule is not registered with the system`));
  log.push(...(opts.schedule ? await installSchedule(load) : [tr("ข้ามตารางเวลา (--no-schedule): รัน bun twin.ts sync เอง", "no schedule (--no-schedule): run bun twin.ts sync yourself")]));
  return { profile, log };
}
