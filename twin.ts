import { $ } from "bun";
import { z } from "zod";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { snapshot } from "./lib/backup.ts";
import { renderBrief, renderTodo, type Viewer } from "./lib/brief.ts";
import { clean } from "./lib/clean.ts";
import { loadOwnerCommand, runOwnerCommand } from "./lib/command.ts";
import { clearCollector, collectorNames, enabledCollectors, type Fragment, isDue, isEnabled, loadCollector, ownerCollectors, readFragments, runCollector, unmetRequirement } from "./lib/collector.ts";
import { GATES, type Gate } from "./lib/contract.ts";
import { claim, close, describe, drain, followup, handle, listRuns, notifyDone, queueChecks, readRun, start, summarize, thisSession, waitFor } from "./lib/dispatch.ts";
import { before as evalBefore, evalNow, full as evalFull, gate as evalGate } from "./lib/evalgate.ts";
import { ownerFiles } from "./lib/extensions.ts";
import { readIdentity, renderIdentity } from "./lib/identity.ts";
import { notify } from "./lib/os.ts";
import { firstSegment, inside } from "./lib/paths.ts";
import { draftDuePlans } from "./lib/plans.ts";
import { MAX_RUNS_CEILING, MODE_DIR, PROFILE_FILE, ROOT, loadProfile, potetoDir, readProfile, writeProfile, Profile } from "./lib/profile.ts";
import { scaffold, templates } from "./lib/scaffold.ts";
import { SECRET_NAME, setSecret } from "./lib/secrets.ts";
import { exportFile } from "./lib/transcript.ts";
import { liveSessions, ownerIsGone } from "./lib/sessions.ts";
import { isScope, setup, skillNotices, uninstall } from "./lib/setup.ts";

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const value = args[i + 1] ?? "";
  args.splice(i, 2);
  return value;
}

function parseGates(csv: string | null): Gate[] {
  if (!csv) return [];
  const gates = csv.split(",").map((g) => g.trim());
  const bad = gates.filter((g) => !(GATES as readonly string[]).includes(g));
  if (bad.length) throw new Error(`gate ไม่รู้จัก: ${bad.join(",")} (มี: ${GATES.join(",")})`);
  return gates as Gate[];
}

async function dispatch(args: string[]) {
  const [project, slug] = args;
  if (!project || !slug) throw new Error("ใช้: dispatch <project> <slug> < brief");
  const task = (await Bun.stdin.text()).trim();
  if (!task) throw new Error("ต้องส่ง brief ทาง stdin");
  const v = await start(project, slug, task);
  console.log(`ส่งแล้ว ${v.id} · ${v.worktree} · ${v.branch} จาก ${v.base} · port ${v.port}\nรอผล: bun twin.ts wait ${v.id}`);
}

async function runs(args: string[]) {
  if (args[0] === "--json") {
    const live = liveSessions();
    console.log(JSON.stringify({ runs: listRuns().filter((v) => v.status !== "closed").map((v) => summarize(v, live)) }));
    return;
  }
  if (args[0]) return console.log(describe(readRun(args[0])));
  const open = listRuns().filter((v) => v.status !== "closed");
  const session = thisSession();
  const live = open.some((v) => v.owner) ? liveSessions() : null;
  const others = open.filter((v) => v.owner && v.owner !== session && !ownerIsGone(v.owner, live));
  const mine = open.filter((v) => !others.includes(v));
  if (!open.length) return console.log("ไม่มีงานที่เปิดอยู่");
  console.log([...mine.map(describe), ...(others.length ? [`จาก session อื่น (ดูได้ ทำต่อด้วย --take):\n${others.map((v) => `- ${v.id} · ${v.status}`).join("\n")}`] : [])].join("\n\n"));
}

const HookInput = z.object({ session_id: z.string() });
const BRIEF_SESSIONS_TIMEOUT_MS = 3_000;

async function hookSession(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const text = await Promise.race([Bun.stdin.text(), Bun.sleep(300).then(() => "")]);
  process.stdin.destroy();
  try {
    return HookInput.parse(JSON.parse(text)).session_id;
  } catch {
    return null;
  }
}

function viewer(session: string | null, fragments: Fragment[]): Viewer {
  const owners = fragments.some((f) => f.owned?.length || f.items.some((i) => i.owner));
  const live = owners ? liveSessions(BRIEF_SESSIONS_TIMEOUT_MS) : null;
  return { session, isOther: (owner) => owner !== session && !ownerIsGone(owner, live) };
}

async function followupCmd(args: string[]) {
  const approve = parseGates(flag(args, "--approve"));
  const take = args.includes("--take");
  const [id, ...message] = args.filter((a) => a !== "--take");
  if (!id) throw new Error("ใช้: followup <id> [--approve push,shared-write,delete] [--take] <ข้อความ | < stdin>");
  const text = message.join(" ").trim() || (process.stdin.isTTY ? "" : (await Bun.stdin.text()).trim());
  if (!text) throw new Error("ต้องมีข้อความ ทาง argument หรือ stdin");
  const { queued, view } = await followup(id, approve, text, take);
  console.log(queued ? `เข้าคิวแล้ว จะส่งต่อทันทีที่ turn ${view.turn} จบ · รอผล: bun twin.ts wait ${id}` : `ส่ง turn ${view.turn} แล้ว · รอผล: bun twin.ts wait ${id}`);
}

async function closeCmd(args: string[]) {
  const discard = args.includes("--discard");
  const stop = args.includes("--stop");
  const take = args.includes("--take");
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) throw new Error("ใช้: close <id> [--discard] [--stop] [--take]");
  console.log(await close(id, { discard, stop, take }));
}

const DEFAULT_TIMEOUT_SECONDS = 120;
const GUARDED_DIRS = ["state", "runs", "journal"].map((d) => join(ROOT, d));

async function syncIsolated(names: string[]) {
  await Promise.all(
    names.map(async (name) => {
      const timeout = (await loadCollector(name)).timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      const child = Bun.spawn([process.execPath, join(ROOT, "twin.ts"), "sync", name], { stdout: "pipe", stderr: "pipe", timeout: timeout * 1000, killSignal: "SIGKILL" });
      const out = (await new Response(child.stdout).text()).trim();
      await child.exited;
      console.log(child.signalCode ? `${name}: timeout ${timeout}s` : out || `${name}: exit ${child.exitCode}`);
    }),
  );
}

async function sync(names: string[]) {
  const profile = loadProfile();
  if (names.length) {
    for (const n of names) console.log(`${n}: ${await runCollector(n, profile)}`);
    return;
  }
  const now = new Date();
  const due: string[] = [];
  const enabled = await enabledCollectors(profile);
  for (const name of collectorNames()) if (!enabled.includes(name)) await clearCollector(name);
  for (const name of enabled) if (isDue(await loadCollector(name), name, now)) due.push(name);
  if (due.length) await syncIsolated(due);
  else console.log("ไม่มี collector ที่ถึงรอบ");
  if (!existsSync(BACKUP_LOG) || Date.now() - statSync(BACKUP_LOG).mtimeMs >= BACKUP_EVERY_MS) console.log(`backup: ${await backup()}`);
}

const BACKUP_LOG = join(ROOT, "state", "backup.log");
const BACKUP_EVERY_MS = 60 * 60 * 1000;
async function backup(): Promise<string> {
  const result = await snapshot();
  mkdirSync(dirname(BACKUP_LOG), { recursive: true });
  appendFileSync(BACKUP_LOG, `${new Date().toLocaleString("sv-SE")} ${result}\n`);
  return result;
}

async function daily() {
  const profile = loadProfile();
  const enabled = await enabledCollectors(profile);
  await syncIsolated(enabled);
  console.log(await clean(false, profile.devRoot, profile.autoClean ? "all" : "runs"));
  console.log(await backup());
  const plans = await draftDuePlans(new Date());
  for (const id of plans.started) console.log(`ร่าง plan: ${id}`);
  for (const f of plans.failed) console.log(`ร่าง plan ไม่ได้: ${f}`);
  const fragments = readFragments(enabled);
  const items = fragments.flatMap((f) => f.items);
  const waiting = items.filter((i) => i.key.startsWith("runs:") && i.score >= 70).length;
  const disk = fragments.find((f) => f.name === "disk")?.body.match(/ว่าง (\S+)/)?.[1];
  const headline = `ต้องดู ${items.length} · รออนุมัติ ${waiting}${plans.started.length ? ` · ร่าง plan ${plans.started.length}` : ""}${disk ? ` · disk ว่าง ${disk}` : ""}`;
  await notify(`${profile.name} เช้านี้`, headline);
  console.log(headline);
}

function canonical(p: string): string {
  const abs = resolve(p);
  if (existsSync(abs)) return realpathSync(abs);
  const parent = dirname(abs);
  return parent === abs ? abs : join(canonical(parent), basename(abs));
}

async function guard() {
  const input = JSON.parse(await Bun.stdin.text()) as { tool_input?: { file_path?: string; notebook_path?: string } };
  const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!raw) return;
  const path = canonical(raw);
  const configured = readProfile()?.devRoot;
  const devRoot = configured ? canonical(configured) : null;
  const reason =
    relative(PROFILE_FILE, path) === ""
      ? "profile/twin.json แก้ผ่าน CLI เท่านั้น: bun twin.ts profile <key>=<value>"
      : GUARDED_DIRS.some((d) => inside(d, path))
        ? `${firstSegment(ROOT, path)}/ เขียนได้เฉพาะ bun twin.ts: ใช้ \`bun twin.ts sync <name>\` แทนการแก้ไฟล์ตรง`
        : devRoot && inside(devRoot, path) && !inside(ROOT, path)
          ? "แก้ไฟล์ใน project อื่นจากที่นี่ไม่ได้: ส่งงานผ่าน dispatch skill ให้ worker ทำใน worktree ของ project นั้น"
          : null;
  if (reason) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

function mode() {
  const profile = readProfile();
  const file = join(MODE_DIR, "SKILL.md");
  if (!profile || !existsSync(file)) return;
  const body = readFileSync(file, "utf8").replace(/^---[\s\S]*?---\n/, "");
  const method = potetoDir()
    ? ` For code work that touches more than one file, involves a design choice, or is a bug with an unknown cause, invoke pstack:poteto-mode as the method; ${profile.name}-mode wins where the two differ.`
    : "";
  console.log(`<EXTREMELY_IMPORTANT>
You work for your owner as ${profile.name}. The ${profile.name}-mode skill below is already loaded in full; follow it on every task, small or large.${method} Reply in the language the owner writes.
Base directory for this skill: ${MODE_DIR}

${[body.trim(), renderIdentity(readIdentity())].filter(Boolean).join("\n\n")}
</EXTREMELY_IMPORTANT>`);
}

const PROFILE_KEYS = `devRoot=<path|none> · radar=<ใครและสนใจอะไร|none> · onboarded=<today|YYYY-MM-DD|none> · autoClean=on|off · maxRuns=<1-${MAX_RUNS_CEILING}> · collector.<name>=on|off · source.claudeCode=on|off · source.git=on|off · source.claudeAi=<conversations.json|none>`;

async function profileCmd(args: string[]) {
  const p = loadProfile();
  if (!args.length) return console.log(readFileSync(PROFILE_FILE, "utf8").trim());
  const next: Profile = { ...p, collectors: { ...p.collectors }, sources: { ...p.sources } };
  for (const arg of args) {
    const eq = arg.indexOf("=");
    const [key, value] = eq < 0 ? [arg, ""] : [arg.slice(0, eq), arg.slice(eq + 1)];
    const none = value === "none" || value === "";
    if (key === "devRoot") {
      next.devRoot = none ? null : resolve(value);
      if (next.devRoot && !existsSync(next.devRoot)) throw new Error(`ไม่พบ ${next.devRoot}`);
    } else if (key === "radar") next.radar = none ? null : value;
    else if (key === "onboarded") next.onboarded = none ? null : value === "today" ? new Date().toLocaleDateString("sv-SE") : value;
    else if (key === "source.claudeCode" || key === "source.git") {
      if (value !== "on" && value !== "off") throw new Error(`${key} ต้องเป็น on หรือ off`);
      next.sources = { ...next.sources, [key.slice("source.".length)]: value === "on" };
    } else if (key === "source.claudeAi") {
      const file = none ? null : exportFile(resolve(value));
      if (file && !existsSync(file)) throw new Error(`ไม่พบไฟล์ ${file}`);
      const isExport = (() => {
        try {
          return file === null || Array.isArray(JSON.parse(readFileSync(file, "utf8")));
        } catch {
          return false;
        }
      })();
      if (!isExport) throw new Error(`${file} ไม่ใช่ conversations.json ที่ export จาก claude.ai (ถ้าเป็น .zip ให้แตกไฟล์ก่อน)`);
      next.sources = { ...next.sources, claudeAi: file };
    } else if (key === "maxRuns") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > MAX_RUNS_CEILING) throw new Error(`maxRuns ต้องเป็นจำนวนเต็ม 1-${MAX_RUNS_CEILING} (ได้ "${value}")`);
      next.maxRuns = n;
    } else if (key === "autoClean") {
      if (value !== "on" && value !== "off") throw new Error("autoClean ต้องเป็น on หรือ off");
      next.autoClean = value === "on";
    } else if (key.startsWith("collector.")) {
      const name = key.slice("collector.".length);
      if (!collectorNames().includes(name)) throw new Error(`ไม่มี collector ${name} (มี: ${collectorNames().join(", ")})`);
      if (value !== "on" && value !== "off") throw new Error(`${key} ต้องเป็น on หรือ off`);
      next.collectors[name] = value === "on";
    } else throw new Error(`ไม่รู้จัก ${key} · ใช้ได้: ${PROFILE_KEYS}`);
  }
  const saved = Profile.parse(next);
  writeProfile(saved);
  if (args.some((a) => a.startsWith("source."))) {
    const history = await loadCollector("history");
    if (unmetRequirement(history, saved)) await clearCollector("history");
    else if (isEnabled(history, "history", saved)) await runCollector("history", saved);
  }
  console.log(`บันทึกแล้ว: ${args.join(" ")}`);
}

async function readHidden(label: string): Promise<string> {
  if (!process.stdin.isTTY) return (await Bun.stdin.text()).trim();
  const posix = process.platform !== "win32";
  if (posix) Bun.spawnSync(["stty", "-echo"], { stdin: "inherit" });
  try {
    return (prompt(label) ?? "").trim();
  } finally {
    if (posix) Bun.spawnSync(["stty", "echo"], { stdin: "inherit" });
    console.log();
  }
}

const COMMANDS: Record<string, { help: string; run(args: string[]): Promise<void> }> = {
  setup: {
    help: "setup [<ชื่อ agent>] [--dev <path>] [--scope global|project] [--no-schedule]  ตั้งชื่อ agent, ตรวจเครื่อง, เขียน profile/, ติดตั้ง <ชื่อ>-mode + SessionStart hook (global: ~/.claude ทุก session · project: เฉพาะ repo นี้) + ตารางเวลา sync (รันซ้ำได้)",
    run: async (args) => {
      const devRoot = flag(args, "--dev");
      const scopeArg = flag(args, "--scope");
      if (scopeArg !== null && !isScope(scopeArg)) throw new Error("--scope ต้องเป็น global หรือ project");
      const scope = scopeArg !== null && isScope(scopeArg) ? scopeArg : null;
      const schedule = !args.includes("--no-schedule");
      const positional = args.find((a) => !a.startsWith("--")) ?? null;
      const name = positional ?? readProfile()?.name ?? (process.stdin.isTTY ? prompt("ตั้งชื่อ agent ของคุณ (a-z, 0-9, -):")?.trim() || null : (await Bun.stdin.text()).trim() || null);
      if (!name) throw new Error("ต้องมีชื่อ agent: bun twin.ts setup <ชื่อ>");
      const { profile, log } = await setup({ name, devRoot, schedule, scope });
      for (const l of log) console.log(`- ${l}`);
      await syncIsolated(await enabledCollectors(profile));
      console.log(`\nพร้อมแล้ว: เปิด Claude Desktop แท็บ Code แล้วเลือกโฟลเดอร์ ${ROOT} (หรือพิมพ์ claude ในโฟลเดอร์นี้) แล้วพิมพ์ onboard ให้ ${profile.name} รู้จักคุณ`);
    },
  },
  uninstall: {
    help: "uninstall  เอาสิ่งที่ setup ติดตั้งออกทั้งหมด (hook, skill, แถบสถานะ, ตารางเวลา) แต่เก็บ profile/ notes/ journal/ ไว้",
    run: async () => {
      const log = await uninstall();
      for (const l of log.length ? log : ["ไม่มีอะไรต้องเอาออก"]) console.log(`- ${l}`);
      console.log(`\nข้อมูลของคุณ (profile/, notes/, journal/) ยังอยู่ใน ${ROOT} ถ้าไม่ใช้แล้วลบทั้งโฟลเดอร์นี้ได้เลย`);
    },
  },
  mode: { help: "mode  (hook) พิมพ์ <ชื่อ>-mode พร้อมกฎ เส้นห้าม และระดับการทำแทน ให้ทุก session โหลดตัวตน", run: async () => mode() },
  identity: {
    help: "identity  ตรวจไฟล์ตัวตน (rules.json, red-lines.json, autonomy.json, coverage.md) แล้วพิมพ์สิ่งที่ session จะเห็น",
    run: async () => {
      const id = readIdentity();
      console.log(renderIdentity(id) || "ยังไม่มีกฎ เส้นห้าม หรือระดับการทำแทน");
      console.log(`\ncoverage: ${id.coverage.length} หัวข้อ · มั่นใจเฉลี่ย ${(id.coverage.reduce((s, r) => s + r.confidence, 0) / Math.max(id.coverage.length, 1)).toFixed(1)}/3`);
      if (id.problems.length) process.exit(1);
    },
  },
  profile: { help: `profile [key=value ...]  ดูหรือแก้ profile/twin.json · ${PROFILE_KEYS}`, run: profileCmd },
  secret: {
    help: "secret <name>  เก็บ secret (API key, token) ใน secret store ของเครื่อง: Keychain / Credential Manager / libsecret",
    run: async ([name]) => {
      if (!name || !SECRET_NAME.test(name)) throw new Error("ใช้: secret <name> (a-z0-9-) แล้ววางค่า หรือส่งทาง stdin");
      const value = await readHidden(`วางค่า ${name} แล้วกด Enter (ไม่แสดงบนจอ):`);
      if (!value) throw new Error("ไม่ได้ใส่ค่า");
      await setSecret(name, value);
      console.log(`เก็บ ${name} แล้ว`);
    },
  },
  new: {
    help: "new <template> <name> [--idea notes/<file>] [--github]  สร้าง project ใหม่จาก template ใน devRoot (+ GitHub private)",
    run: async (args) => {
      const idea = flag(args, "--idea");
      const github = args.includes("--github");
      const [template, name] = args.filter((a) => !a.startsWith("--"));
      const devRoot = loadProfile().devRoot;
      if (!devRoot) throw new Error("ยังไม่ได้ตั้ง devRoot: bun twin.ts profile devRoot=<path>");
      if (!template || !name) throw new Error(`ใช้: new <template> <name> [--idea notes/<file>] [--github] · template: ${templates(devRoot).join(", ")}`);
      console.log(await scaffold(devRoot, template, name, { idea, github }));
    },
  },
  daily: { help: "daily  sync ทุกตัว + ปิด run ที่ merge แล้ว (+ clean cache เมื่อ autoClean=on) + backup journal, notes, profile + ร่าง plan ให้ todo ที่ถึง due + แจ้งเตือนสรุปเช้า", run: daily },
  clean: {
    help: "clean [--dry]  ลบของที่สร้างใหม่ได้ (node_modules ฯลฯ ใน repo ที่ไม่แตะ 14 วัน, cache, run เก่า)",
    run: async (args) => console.log(await clean(args.includes("--dry"), loadProfile().devRoot, "all")),
  },
  sync: { help: "sync [collector...]  รัน collector ที่เปิดและถึงรอบ (หรือที่ระบุชื่อ)", run: sync },
  brief: {
    help: "brief  สรุปสถานะสั้นสำหรับเริ่ม session",
    run: async () => {
      const profile = readProfile();
      if (!profile) return console.log("# twin · ยังไม่ได้ setup\nรัน `bun twin.ts setup` ในเทอร์มินัลก่อน แล้วเปิด claude ใหม่");
      const enabled = await enabledCollectors(profile);
      for (const name of enabled) if ((await loadCollector(name)).refreshOnBrief) await runCollector(name, profile);
      const fragments = readFragments(enabled);
      const notices = [...mine().problems, ...ownerCollectors().problems, ...skillNotices(profile.name, profile.scope)];
      console.log(renderBrief(profile.name, fragments, new Date(), viewer((await hookSession()) ?? thisSession(), fragments), notices));
      process.exit(0);
    },
  },
  audit: {
    help: "audit  นับสัญญาณ 7 วันว่าเข้มไปหรืออ่อนไปตรงไหน",
    run: async () => {
      await runCollector("audit", loadProfile());
      console.log(readFileSync(join(ROOT, "state/audit/index.md"), "utf8"));
    },
  },
  dispatch: { help: "dispatch <project> <slug> < brief  ส่งงานให้ worker ทำใน worktree ของ project นั้น", run: dispatch },
  runs: { help: "runs [id]  งานที่ส่งไปและสถานะ", run: runs },
  wait: {
    help: "wait <id>  รอจนงานจบ turn แล้วพิมพ์ report (รันแบบ background)",
    run: async ([id]) => {
      if (!id) throw new Error("ใช้: wait <id>");
      console.log(describe(await waitFor(id)));
    },
  },
  followup: { help: "followup <id> [--approve gates] [--take] <ข้อความ>  ส่ง turn ถัดไป (อนุมัติ gate เฉพาะ turn นั้น; --take รับงานของ session อื่น)", run: followupCmd },
  close: { help: "close <id> [--discard] [--stop] [--take]  ลบ worktree + branch local ของงาน", run: closeCmd },
  take: {
    help: "take <id>  ย้ายงานของ session อื่นมาเป็นของ session นี้",
    run: async ([id]) => {
      if (!id) throw new Error("ใช้: take <id>");
      if (!thisSession()) throw new Error("ใช้ take ได้จากใน session ของ Claude Code เท่านั้น (ไม่พบ CLAUDE_CODE_SESSION_ID)");
      claim(id, true);
      console.log(`${id} เป็นของ session นี้แล้ว`);
    },
  },
  handle: {
    help: "handle <id> <ทำอะไรอยู่>  บอก band ว่า session นี้รับงานที่รอคำตอบไปจัดการเอง (หายเองเมื่อมี turn ใหม่หรือเกิน 2 ชม.)",
    run: async ([id, ...note]) => {
      if (!id || !note.length) throw new Error("ใช้: handle <id> <ทำอะไรอยู่>");
      handle(id, note.join(" "));
      console.log(`${id} · band ย้ายไปช่องกำลังทำ จนกว่าจะมี turn ใหม่หรือครบ 2 ชม.`);
    },
  },
  _drain: {
    help: "_drain <id>  (ภายใน) ส่ง followup ที่เข้าคิวไว้เป็น turn ถัดไป",
    run: async ([id]) => {
      if (id) await drain(id);
    },
  },
  _clickcheck: {
    help: "_clickcheck <id>  (ภายใน) แก้ UI แต่ไม่ได้กด หรือแก้ code แต่ไม่ได้ลอง input → เข้าคิว turn ให้ตรวจ",
    run: async ([id]) => {
      if (id) queueChecks(id);
    },
  },
  _done: {
    help: "_done <id>  (ภายใน) แจ้งเตือนเมื่อ worker จบ turn",
    run: async ([id]) => {
      if (id) await notifyDone(id);
      await runCollector("runs", loadProfile());
    },
  },
  todo: {
    help: "todo  ทุกอย่างที่ค้าง เรียงตามความสำคัญ (ลำดับเดียวกับ brief)",
    run: async () => {
      const fragments = readFragments(await enabledCollectors(loadProfile()));
      console.log(renderTodo(fragments, new Date(), viewer(thisSession(), fragments)));
    },
  },
  eval: {
    help: "eval [--again] · eval before · eval full  ราวกั้นชั้นเร็ว (~1 นาที) ก่อน commit improve: · before เก็บผล fixture ก่อนแก้ · full ชุดเต็มหลายรอบ เทียบกับครั้งก่อน (นานหลายสิบนาที รันเมื่ออยากรู้)",
    run: async ([sub, ...rest]) => {
      if (sub === "before") return console.log(await evalBefore());
      if (sub === "full") return console.log(await evalFull());
      if (sub === "gate") {
        if (!rest[0]) throw new Error("ใช้: eval gate <ไฟล์ข้อความ commit> (commit-msg hook)");
        const trailer = await evalGate(rest[0]);
        if (trailer) console.log(trailer);
        return;
      }
      console.log(await evalNow(sub ? [sub, ...rest] : []));
    },
  },
  guard: { help: "guard  PreToolUse hook: กันการเขียน state/ runs/ journal/ profile/twin.json และ project อื่น", run: guard },
};

const mine = () => ownerFiles("commands", Object.keys(COMMANDS));

async function help(): Promise<string> {
  const engine = Object.entries(COMMANDS).filter(([k]) => !k.startsWith("_")).map(([, c]) => `bun twin.ts ${c.help}`);
  const owner = mine();
  const loaded = await Promise.all([...owner.files].map(([name, file]) => loadOwnerCommand(name, file)));
  const lines = [
    ...loaded.map((l) => (l.ok ? `bun twin.ts ${l.name}${l.command.usage ? ` ${l.command.usage}` : ""}  ${l.command.help}` : `⚠ bun twin.ts ${l.name}  ${l.why}`)),
    ...owner.problems.map((p) => `⚠ ${p}`),
  ];
  return [...engine, ...(lines.length ? ["", "คำสั่งของคุณเอง (profile/commands/):", ...lines] : [])].join("\n");
}

async function main(cmd: string | undefined, args: string[]) {
  const engine = cmd ? COMMANDS[cmd] : undefined;
  if (engine) {
    if (mine().problems.some((p) => p.startsWith(`profile/commands/${cmd}.ts `))) console.error(`⚠ profile/commands/${cmd}.ts ชื่อซ้ำกับคำสั่งของ engine จึงใช้ของ engine: เปลี่ยนชื่อไฟล์`);
    return engine.run(args);
  }
  const file = cmd ? mine().files.get(cmd) : undefined;
  if (!cmd) return console.log(await help());
  if (!file) {
    console.log(`ไม่รู้จักคำสั่ง ${cmd}\n\n${await help()}`);
    process.exit(1);
  }
  const loaded = await loadOwnerCommand(cmd, file);
  if (!loaded.ok) throw new Error(`คำสั่ง ${cmd} ใช้ไม่ได้: ${loaded.why}`);
  try {
    await runOwnerCommand(loaded.command, args);
  } catch (e) {
    throw new Error(`คำสั่ง ${cmd} (${relative(ROOT, file)}) ล้ม: ${e instanceof Error ? e.message : String(e)}`);
  }
}

try {
  const [cmd, ...args] = process.argv.slice(2);
  await main(cmd, args);
} catch (e) {
  console.error(e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : e instanceof Error ? e.message : String(e));
  process.exit(1);
}
