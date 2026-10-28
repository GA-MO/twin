import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { parseBrief } from "./briefs.ts";
import { contract, currentMethod, type Method } from "./contract.ts";
import { listRuns, readsAsReport } from "./dispatch.ts";
import { readIdentity } from "./identity.ts";
import { PROFILE_DIR, ROOT, loadProfile } from "./profile.ts";

const DIR = join(ROOT, "state/evals");
const ITEMS = join(DIR, "items");
const RECEIPTS = join(DIR, "receipts");
const NIGHTLY = join(DIR, "nightly");
const RAW = join(DIR, "raw");
const MARK = "# twin eval gate";
const SCISSORS = /^# -+ >8 -+$/m;

const IDENTITY = ["profile/mode/SKILL.md", "profile/rules.json", "profile/red-lines.json", "profile/autonomy.json", "profile/CLAUDE.md", "profile/skills/", "CLAUDE.md", ".claude/skills/", "lib/identity.ts"];
const ENGINE = ["lib/contract.ts", "lib/dispatch.ts", "lib/briefs.ts"];
const YARDSTICK = ["evals/", "lib/evalgate.ts"];
const ENTRIES = [...IDENTITY, ...ENGINE, ...YARDSTICK, "profile/evals/replay.json"];
const FAST_ARMS = ["evals/fixtures-hard/split-bill", "evals/fixtures-hard/static-path"];
const NIGHTLY_RUNS = 3;
const TOLERANCE = 0.1;
const JUDGE_OLD_WINS = 2 / 3;
const RECENT_RUNS = 20;
const GATE_CAP_MINUTES = 3;
const REPLAY_TIMEOUT_MS = 150_000;
const HARNESS = { arms: ["evals/arms.ts", "evals/ui-check.ts"], replay: ["evals/replay.ts"] };

const KEY_RULES: { name: string; test: RegExp }[] = [
  { name: "ถามไม่ได้ให้รายงาน needs-input", test: /needs-input/ },
  { name: "dev server ใช้ $TWIN_PORT", test: /\$TWIN_PORT/ },
  { name: "push แค่ branch ตัวเอง", test: /git push -u origin HEAD/ },
  { name: "gate push, shared-write, delete", test: /Gated actions/ },
  { name: "ห้ามรันงานยาวเบื้องหลัง", test: /in the background/ },
  { name: "reviewer ตามขนาดงาน", test: /กลาง:.*reviewer/ },
  { name: "กด UI ตามที่การแก้ไปถึง", test: /clicked/ },
  { name: "ลอง input ที่ brief ไม่ได้บอก", test: /Code that takes input[\s\S]*inputs_tried/ },
  { name: "บอกสิ่งที่หายไปใน removed", test: /\bremoved\b/ },
  { name: "จบทุก turn ด้วย structured report", test: /structured report/ },
];

type Files = Record<string, string>;
type Item = { suite: "arms" | "replay"; id: string; yard: string; fp: string };
const Run = z.object({ score: z.number(), finished: z.boolean(), at: z.string(), via: z.enum(["gate", "before", "nightly"]), diff: z.string().nullable().default(null) });
type Run = z.infer<typeof Run>;
const ItemRecord = z.object({ suite: z.enum(["arms", "replay"]), id: z.string(), yard: z.string(), runs: z.array(Run) });
type ItemRecord = z.infer<typeof ItemRecord>;
const Receipt = z.object({ ok: z.boolean(), seconds: z.number(), at: z.string(), blocks: z.array(z.string()), lines: z.array(z.string()), trailer: z.array(z.string()) });
type Receipt = z.infer<typeof Receipt>;
const Verdict = z.object({ suite: z.string(), before: z.string(), after: z.string(), worse: z.boolean(), why: z.array(z.string()), compared: z.number() });
type Verdict = z.infer<typeof Verdict>;
const Nightly = z.object({ at: z.string(), seconds: z.number(), items: z.record(z.string(), z.object({ fp: z.string(), yard: z.string() })), verdicts: z.array(Verdict), worse: z.boolean(), incomplete: z.array(z.string()), lines: z.array(z.string()), open: z.array(z.string()).default([]) });
export type NightlyResult = z.infer<typeof Nightly>;

const covers = (entry: string, path: string) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry);
const owned = (path: string) => path.startsWith("profile/");
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
const blob = (data: Buffer) => createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
const pick = (files: Files, entries: string[]) => Object.entries(files).filter(([p]) => entries.some((e) => covers(e, p))).sort(([a], [b]) => a.localeCompare(b));
const childEnv = (extra: Record<string, string> = {}) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))), ...extra });
const tail = (id: string) => id.split("/").at(-1) ?? id;

function git(...args: string[]): string {
  const r = Bun.spawnSync(["git", "-C", ROOT, ...args]);
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} ล้มใน ${ROOT}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const stat = lstatSync(abs);
  if (stat.isFile()) return [rel];
  return stat.isDirectory() ? readdirSync(abs).flatMap((f) => walk(join(rel, f))) : [];
}

function ownedFiles(entries: string[]): Files {
  return Object.fromEntries(entries.filter(owned).flatMap((e) => walk(e.replace(/\/$/, ""))).map((rel) => [rel, blob(readFileSync(join(ROOT, rel)))]));
}

function snapshot(at: "disk" | "head" = "disk"): Files {
  const files = ownedFiles(ENTRIES);
  const paths = ENTRIES.filter((e) => !owned(e));
  if (at === "head") {
    for (const line of git("ls-tree", "-r", "-z", "HEAD", "--", ...paths).split("\0").filter(Boolean)) {
      const tab = line.indexOf("\t");
      files[line.slice(tab + 1)] = line.slice(0, tab).split(" ")[2] ?? "";
    }
    return files;
  }
  for (const rel of git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...paths).split("\0").filter(Boolean)) {
    const abs = join(ROOT, rel);
    if (existsSync(abs) && lstatSync(abs).isFile()) files[rel] = blob(readFileSync(abs));
  }
  return files;
}

function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}

function readJson<T>(file: string, schema: z.ZodType<T>): T | null {
  if (!existsSync(file)) return null;
  const parsed = schema.safeParse((() => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  })());
  if (!parsed.success) throw new Error(`${relative(ROOT, file)} เสีย อ่านไม่ได้: ลบไฟล์นั้นแล้วรันใหม่`);
  return parsed.data;
}

type Context = { name: string; scope: "global" | "project"; method: Method };
const context = (): Context => {
  const p = loadProfile();
  return { name: p.name, scope: p.scope, method: currentMethod() };
};

const Scenario = z.looseObject({ id: z.string() });
function scenarios(): { id: string; raw: unknown }[] {
  const own = join(PROFILE_DIR, "evals/replay.json");
  const file = existsSync(own) ? own : join(ROOT, "evals/replay.example.json");
  const list = z.array(Scenario).safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!list.success) throw new Error(`${relative(ROOT, file)} ไม่ใช่รายการ scenario ที่ถูกต้อง`);
  return list.data.map((s) => ({ id: s.id, raw: s }));
}

function armsItems(files: Files, ctx: Context): Item[] {
  const reads = pick(files, [...ENGINE, ...(ctx.scope === "global" ? IDENTITY : [])]);
  return Object.keys(files)
    .map((p) => /^(evals\/fixtures[^/]*\/[^/]+)\/brief\.md$/.exec(p)?.[1])
    .filter((id): id is string => !!id)
    .sort()
    .map((id) => {
      const yard = hash(pick(files, [`${id}/`, ...HARNESS.arms]));
      return { suite: "arms" as const, id, yard, fp: hash({ suite: "arms", id, yard, reads, ctx }) };
    });
}

function replayItems(files: Files, ctx: Context): Item[] {
  const reads = pick(files, [...IDENTITY, "lib/briefs.ts"]);
  const harness = pick(files, HARNESS.replay);
  return scenarios().map((s) => {
    const yard = hash({ scenario: s.raw, harness });
    return { suite: "replay" as const, id: s.id, yard, fp: hash({ suite: "replay", id: s.id, yard, reads, ctx }) };
  });
}

const recordFile = (item: Item) => join(ITEMS, item.suite, `${item.fp}.json`);
const readRecord = (item: Item): ItemRecord => readJson(recordFile(item), ItemRecord) ?? { suite: item.suite, id: item.id, yard: item.yard, runs: [] };
const addRuns = (item: Item, runs: Run[]) => writeJson(recordFile(item), { ...readRecord(item), runs: [...readRecord(item).runs, ...runs] });

const ArmsRow = z.object({ task: z.string(), outcome: z.string(), hiddenPass: z.number(), hiddenFail: z.number(), diff: z.string().nullable().optional() });
const ReplayRow = z.object({ id: z.string(), pass: z.boolean().nullable() });
const missingRuns = (n: number, at: string, via: Run["via"]) => Array.from({ length: Math.max(0, n) }, (): Run => ({ score: 0, finished: false, at, via, diff: null }));

async function spawnEval(args: string[], cwd = ROOT, timeout?: number): Promise<void> {
  await Bun.spawn([process.execPath, ...args], { cwd, stdout: "inherit", stderr: "inherit", env: childEnv(), ...(timeout ? { timeout, killSignal: "SIGKILL" as const } : {}) }).exited;
}

type ArmsOptions = { reps: number; via: Run["via"]; root?: string; slots?: number; capMinutes?: number };

async function runArms(items: Item[], o: ArmsOptions): Promise<void> {
  const byDir = new Map<string, Item[]>();
  for (const i of items) byDir.set(dirname(i.id), [...(byDir.get(dirname(i.id)) ?? []), i]);
  for (const [dir, group] of byDir) {
    mkdirSync(RAW, { recursive: true });
    const out = join(RAW, `arms-${Date.now()}-${process.pid}-${o.via}.json`);
    const flags = [...(o.slots ? ["--slots", String(o.slots)] : []), ...(o.capMinutes ? ["--cap-minutes", String(o.capMinutes)] : [])];
    await spawnEval(["evals/arms.ts", "--isolated", "--fixtures", dir, "--tasks", group.map((i) => tail(i.id)).join(","), "--arms", "now", "--reps", String(o.reps), "--out", out, ...flags], o.root ?? ROOT);
    const rows = existsSync(out) ? z.array(ArmsRow).parse(JSON.parse(readFileSync(out, "utf8"))) : [];
    const at = new Date().toISOString();
    for (const i of group) {
      const runs = rows
        .filter((r) => `${dir}/${r.task}` === i.id)
        .map((r): Run => {
          const total = r.hiddenPass + r.hiddenFail;
          return { score: total ? r.hiddenPass / total : 0, finished: r.outcome === "done" && total > 0, at, via: o.via, diff: o.root ? null : (r.diff ?? null) };
        });
      addRuns(i, [...runs, ...missingRuns(o.reps - runs.length, at, o.via)]);
    }
  }
}

async function atHead(run: (root: string) => Promise<void>): Promise<void> {
  const dir = join(ROOT, ".twin-scratch", `eval-head-${process.pid}`);
  const gitAt = (...args: string[]) => Bun.spawnSync(["git", "-C", ROOT, ...args], { env: childEnv() });
  if (gitAt("worktree", "add", "-q", "--detach", dir, "HEAD").exitCode !== 0) return;
  try {
    for (const rel of ["profile/twin.json", ...Object.keys(ownedFiles(ENTRIES))]) {
      if (!existsSync(join(ROOT, rel))) continue;
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      copyFileSync(join(ROOT, rel), join(dir, rel));
    }
    if (existsSync(join(ROOT, "node_modules"))) symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
    await run(dir);
  } finally {
    gitAt("worktree", "remove", "--force", dir);
  }
}

async function runReplay(items: Item[], reps: number, parallel: number, via: Run["via"]): Promise<void> {
  if (!items.length) return;
  mkdirSync(RAW, { recursive: true });
  const out = join(RAW, `replay-${Date.now()}-${process.pid}.json`);
  await spawnEval(["evals/replay.ts", "--isolated", "--reps", String(reps), "--parallel", String(Math.min(8, parallel)), "--json", out, ...items.map((i) => i.id)], ROOT, via === "gate" ? REPLAY_TIMEOUT_MS : undefined);
  const rows = existsSync(out) ? z.array(ReplayRow).parse(JSON.parse(readFileSync(out, "utf8"))) : [];
  const at = new Date().toISOString();
  for (const i of items) {
    const runs = rows.filter((r) => r.id === i.id).map((r): Run => ({ score: r.pass ? 1 : 0, finished: r.pass !== null, at, via, diff: null }));
    addRuns(i, [...runs, ...missingRuns(reps - runs.length, at, via)]);
  }
}

const SAMPLE_REPORT = { outcome: "done", did: "-", pending: "", discovered: "", verified: "-", clicked: [], inputs_tried: [], removed: [], ideas: [], gates_requested: [] };
const StoredResult = z.object({ structured_output: z.looseObject({ outcome: z.string(), did: z.string() }) });

function storedReports(): { where: string; value: unknown }[] {
  const runs = join(ROOT, "runs");
  const turns = existsSync(runs)
    ? readdirSync(runs)
        .sort()
        .slice(-RECENT_RUNS)
        .flatMap((id) => (existsSync(join(runs, id)) && lstatSync(join(runs, id)).isDirectory() ? readdirSync(join(runs, id)).filter((t) => t.startsWith("turn-")).map((t) => `${id}/${t}`) : []))
    : [];
  const real = turns.flatMap((t) => {
    const file = join(runs, t, "result.json");
    if (!existsSync(file)) return [];
    try {
      const r = StoredResult.safeParse(JSON.parse(readFileSync(file, "utf8")));
      return r.success ? [{ where: `runs/${t}`, value: r.data.structured_output }] : [];
    } catch {
      return [];
    }
  });
  return [{ where: "ตัวอย่าง report", value: SAMPLE_REPORT }, ...real];
}

function staticChecks(ctx: Context): { blocks: string[]; lines: string[] } {
  const blocks: string[] = [];
  const lines: string[] = [];
  const methods: Method[] = ctx.method.kind === "poteto" ? [ctx.method, { kind: "lean" }] : [ctx.method];
  const missing = [...new Set(methods.flatMap((m) => KEY_RULES.filter((r) => !r.test.test(contract(ctx.name, m))).map((r) => r.name)))];
  if (missing.length) blocks.push(`contract ขาดกฎสำคัญ: ${missing.join(", ")}`);
  else lines.push(`contract ครบ ${KEY_RULES.length} กฎ`);
  const briefs = git("ls-files", "-z", "--", "evals/").split("\0").filter((p) => /^evals\/fixtures[^/]*\/[^/]+\/brief\.md$/.test(p));
  const badBriefs = briefs.flatMap((p) => {
    try {
      parseBrief(readFileSync(join(ROOT, p), "utf8"), ctx.name, ctx.method);
      return [];
    } catch (e) {
      return [`${p}: ${(e as Error).message.split("\n")[0]}`];
    }
  });
  if (badBriefs.length) blocks.push(`brief parse ไม่ได้: ${badBriefs.join(" · ")}`);
  else lines.push(`brief ${briefs.length} ไฟล์ parse ได้`);
  const reports = storedReports();
  const badReports = reports.filter((r) => !readsAsReport(r.value)).map((r) => r.where);
  if (badReports.length) blocks.push(`report อ่านไม่ได้: ${badReports.join(", ")}`);
  else lines.push(`report ${reports.length} อัน parse ได้`);
  if (existsSync(join(PROFILE_DIR, "mode/SKILL.md"))) {
    const problems = (() => {
      try {
        return readIdentity().problems;
      } catch (e) {
        return [(e as Error).message.split("\n")[0] ?? "อ่านไม่ได้"];
      }
    })();
    if (problems.length) blocks.push(`ไฟล์ตัวตนอ่านไม่ได้: ${problems.join(" · ")}`);
    else lines.push("ไฟล์ตัวตนอ่านได้");
  }
  return { blocks, lines };
}

async function bunTest(): Promise<string | null> {
  if (process.env["TWIN_IN_GATE"]) return null;
  const child = Bun.spawn([process.execPath, "test"], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: childEnv({ TWIN_IN_GATE: "1" }) });
  const [out, err] = [await new Response(child.stdout).text(), await new Response(child.stderr).text()];
  await child.exited;
  if (child.exitCode === 0) return "";
  const fails = `${out}\n${err}`.split("\n").filter((l) => l.startsWith("(fail)")).slice(0, 3);
  return fails.length ? fails.join(" · ") : `exit ${child.exitCode}`;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const fullRuns = (runs: Run[]) => `${runs.filter((r) => r.finished && r.score === 1).length}/${runs.length}`;
const trackedChanges = (...args: string[]) => git("diff", "--name-only", "-z", ...args, "--", ...ENTRIES.filter((e) => !owned(e))).split("\0").filter(Boolean);
const finished = (item: Item) => readRecord(item).runs.filter((r) => r.finished);

export async function check(again = false): Promise<Receipt & { cached: boolean }> {
  const begun = Date.now();
  const fail = (blocks: string[]) => ({ ok: false, seconds: Math.round((Date.now() - begun) / 1000), at: new Date().toISOString(), blocks, lines: [], trailer: [], cached: false });
  const loose = [...git("diff", "--name-only", "-z").split("\0"), ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0")].filter(Boolean);
  if (loose.length) return fail([`gate ตรวจสิ่งที่จะ commit จากไฟล์บนดิสก์ จึงต้องไม่มีไฟล์ที่ยังไม่ได้ git add: ${loose.slice(0, 8).join(", ")}${loose.length > 8 ? ` และอีก ${loose.length - 8}` : ""} (git add หรือย้ายออกก่อน)`]);
  const staged = trackedChanges("--cached", "HEAD");
  const yard = staged.filter((p) => YARDSTICK.some((e) => covers(e, p)));
  const triggers = staged.filter((p) => [...ENGINE, ...IDENTITY].some((e) => covers(e, p)));
  const ctx = context();
  const files = snapshot();
  const key = hash({ tree: git("write-tree").trim(), owned: ownedFiles([...ENTRIES, "profile/coverage.md", "profile/twin.json"]), ctx });
  const cached = readJson(join(RECEIPTS, `${key}.json`), Receipt);
  if (cached && !again) return { ...cached, cached: true };
  const { blocks, lines } = staticChecks(ctx);
  if (yard.length && triggers.length) blocks.push(`แก้เกณฑ์วัด (${yard.join(", ")}) พร้อมกับสิ่งที่มันวัด (${triggers.join(", ")}): แยก commit`);
  if (blocks.length) return fail(blocks);
  const head = new Map(armsItems(snapshot("head"), ctx).map((i) => [i.id, i]));
  const fast = armsItems(files, ctx).filter((i) => FAST_ARMS.includes(i.id) && head.get(i.id)?.fp !== i.fp);
  const replay = replayItems(files, ctx);
  const needNow = fast.filter((i) => again || !finished(i).length);
  const needHead = fast.map((i) => head.get(i.id)).filter((i): i is Item => !!i && !finished(i).length);
  const busy = listRuns().filter((r) => r.status === "running").length;
  if (busy + needNow.length > loadProfile().maxRuns) return fail([`ช่อง run เต็ม (${busy}/${loadProfile().maxRuns}) ตรวจ fixture ไม่ได้: รอ run ที่ทำอยู่จบแล้วรัน bun twin.ts eval อีกครั้ง`]);
  const needReplay = replay.filter((i) => again || !readRecord(i).runs.length);
  const gateArms = { via: "gate" as const, capMinutes: GATE_CAP_MINUTES };
  const [test] = await Promise.all([
    bunTest(),
    runArms(needNow, { ...gateArms, reps: 1 }),
    needHead.length ? atHead((root) => runArms(needHead, { ...gateArms, reps: 1, root })) : null,
    runReplay(needReplay, 1, needReplay.length, "gate"),
  ]);
  if (test === null) lines.push("bun test ข้าม (รันอยู่ใน bun test ของ gate ชั้นนอก)");
  else if (test) blocks.push(`bun test ล้ม: ${test}`);
  else lines.push("bun test ผ่าน");
  const retry = fast.filter((i) => !finished(i).length || (finished(head.get(i.id)!).every((r) => r.score === 1) && finished(head.get(i.id)!).length > 0 && finished(i).at(-1)!.score < 1));
  if (retry.length) await runArms(retry, { ...gateArms, reps: 1 });
  for (const i of fast) {
    const now = finished(i);
    const base = finished(head.get(i.id)!);
    const baseFull = base.length > 0 && base.every((r) => r.score === 1);
    const recent = now.slice(retry.includes(i) ? -2 : -1);
    if (!now.length) blocks.push(`fixture ${tail(i.id)}: worker ไม่จบงาน 2 ครั้ง`);
    else if (baseFull && recent.every((r) => r.score < 1)) blocks.push(`fixture ${tail(i.id)}: hidden test ผ่าน ${Math.round(recent.at(-1)!.score * 100)}% ตกจากที่ HEAD ผ่านครบ (${fullRuns(base)} รอบ) ซ้ำ ${recent.length} ครั้ง`);
    else lines.push(`fixture ${tail(i.id)} ${now.at(-1)!.score === 1 ? "ผ่านครบ" : `ผ่าน ${Math.round(now.at(-1)!.score * 100)}%${baseFull ? " (รอบยืนยันผ่านครบ)" : base.length ? " (HEAD ก็ไม่ครบ)" : " (HEAD วัดไม่ได้)"}`}`);
  }
  if (!fast.length) lines.push("fixture ไม่ต้องรัน (ไฟล์ที่อ่านเหมือน HEAD)");
  const latest = replay.map((i) => readRecord(i).runs.at(-1)).filter((r): r is Run => !!r);
  const info = latest.length ? [`replay รอบเดียว ${latest.filter((r) => r.score === 1).length}/${latest.length} (ข้อมูลเท่านั้น ไม่ใช้ตัดสิน)`] : [];
  const seconds = Math.round((Date.now() - begun) / 1000);
  if (blocks.length) return fail(blocks);
  const receipt: Receipt = {
    ok: true,
    seconds,
    at: new Date().toISOString(),
    blocks: [],
    lines: [...lines, ...info],
    trailer: [`Eval-gate: ผ่าน ${seconds} วินาที · ${lines.join(" · ")}`, ...info.map((l) => `Eval-info: ${l}`), "Eval-quality: ดีขึ้นหรือแย่ลงดูจากรอบกลางคืน"],
  };
  writeJson(join(RECEIPTS, `${key}.json`), receipt);
  return { ...receipt, cached: false };
}

export async function evalNow(args: string[]): Promise<string> {
  const bad = args.filter((a) => a !== "--again");
  if (bad.length) throw new Error(`ไม่รู้จัก ${bad.join(" ")} · ใช้: eval [--again] · eval before · eval nightly`);
  const notice = gateNotice();
  const r = await check(args.includes("--again"));
  return [
    ...(notice ? [notice] : []),
    `${r.ok ? "✅ gate ชั้นเร็วผ่าน" : "❌ gate ชั้นเร็วไม่ผ่าน"} · ${r.seconds} วินาที${r.cached ? " (ผลเดิม เนื้อหาไม่เปลี่ยน)" : ""}`,
    ...r.blocks.map((b) => `- ${b}`),
    ...r.lines.map((l) => `· ${l}`),
    r.ok ? "commit improve: ได้ · ดีขึ้นหรือแย่ลงดูจากรอบกลางคืน" : "commit improve: ไม่ได้",
  ].join("\n");
}

export async function before(): Promise<string> {
  const notice = gateNotice();
  const fast = armsItems(snapshot(), context()).filter((i) => FAST_ARMS.includes(i.id));
  const need = fast.filter((i) => finished(i).length < 2);
  await runArms(need, { reps: 2, via: "before" });
  return [...(notice ? [notice] : []), ...fast.map((i) => `baseline ${tail(i.id)}: ผ่านครบ ${fullRuns(readRecord(i).runs)}${need.includes(i) ? "" : " (ผลเดิม ไฟล์ที่อ่านไม่เปลี่ยน)"}`)].join("\n");
}

export async function gate(messageFile: string): Promise<string> {
  const message = readFileSync(messageFile, "utf8");
  if (!/^improve:/.test(message.split("\n")[0] ?? "")) return "";
  const r = await check();
  if (!r.ok) throw new Error(`commit improve: ไม่ได้ (${r.seconds} วินาที)\n${r.blocks.map((b) => `- ${b}`).join("\n")}`);
  writeFileSync(messageFile, withTrailer(message, r.trailer));
  return r.trailer.join("\n");
}

function withTrailer(message: string, trailer: string[]): string {
  const cut = message.search(SCISSORS);
  const body = cut < 0 ? message : message.slice(0, cut);
  const rest = cut < 0 ? "" : `\n${message.slice(cut)}`;
  const kept = body.split("\n").filter((l) => !/^Eval-[a-z]+: /.test(l)).join("\n");
  return `${kept.trimEnd()}\n\n${trailer.join("\n")}\n${rest}`;
}

export function compare(suite: string, before: Record<string, number[]>, after: Record<string, number[]>): Verdict {
  const ids = Object.keys(before).filter((id) => before[id]?.length && after[id]?.length);
  const b = (id: string) => mean(before[id]!);
  const a = (id: string) => mean(after[id]!);
  const pct = (x: number) => `${Math.round(100 * x)}%`;
  const totalB = ids.reduce((s, id) => s + b(id), 0);
  const totalA = ids.reduce((s, id) => s + a(id), 0);
  const lost = ids.filter((id) => b(id) === 1 && a(id) === 0);
  const worse = lost.length > 0 || totalA < totalB - TOLERANCE * ids.length;
  return {
    suite,
    before: pct(ids.length ? totalB / ids.length : 0),
    after: pct(ids.length ? totalA / ids.length : 0),
    worse,
    why: worse ? ids.filter((id) => a(id) < b(id)).map((id) => `${tail(id)} ${pct(b(id))} → ${pct(a(id))}${lost.includes(id) ? " (ไม่ผ่านเลย)" : ""}`) : [],
    compared: ids.length,
  };
}

const JudgeLine = /^(before|after): (\d+) points, ranked first (\d+) times$/;
type Pair = { item: Item; before: Run[]; after: Run[] };

async function judgeArms(pairs: Pair[]): Promise<{ before: number; after: number } | null> {
  const firsts = { before: 0, after: 0 };
  const byDir = new Map<string, Pair[]>();
  for (const p of pairs) byDir.set(dirname(p.item.id), [...(byDir.get(dirname(p.item.id)) ?? []), p]);
  for (const [dir, group] of byDir) {
    const stamp = `nightly-${Date.now()}`;
    const diffs = join(ROOT, "evals/results", `diffs-${stamp}`);
    mkdirSync(diffs, { recursive: true });
    const rows: { task: string; arm: string; rep: number; fixtures: string }[] = [];
    for (const { item, before, after } of group) {
      const task = tail(item.id);
      for (let rep = 1; rep <= Math.min(before.length, after.length); rep++) {
        const sides = [["before", before[rep - 1]!.diff], ["after", after[rep - 1]!.diff]] as const;
        if (sides.some(([, d]) => !d || !existsSync(join(ROOT, d)))) continue;
        for (const [arm, d] of sides) copyFileSync(join(ROOT, d!), join(diffs, `${task}-${arm}${rep}.diff`));
        rows.push({ task, arm: "before", rep, fixtures: dir }, { task, arm: "after", rep, fixtures: dir });
      }
    }
    if (!rows.length) continue;
    const file = join(ROOT, "evals/results", `arms-${stamp}.json`);
    writeFileSync(file, JSON.stringify(rows, null, 2));
    const child = Bun.spawn([process.execPath, "evals/judge.ts", file], { cwd: ROOT, stdout: "pipe", stderr: "inherit", env: childEnv() });
    const out = await new Response(child.stdout).text();
    await child.exited;
    for (const line of out.split("\n")) {
      const m = JudgeLine.exec(line.trim());
      if (m) firsts[m[1] === "before" ? "before" : "after"] += Number(m[3]);
    }
  }
  return firsts.before + firsts.after ? firsts : null;
}

export async function nightly(): Promise<string> {
  const begun = Date.now();
  const ctx = context();
  const files = snapshot();
  const items = [...armsItems(files, ctx), ...replayItems(files, ctx)];
  const nightlyRuns = (i: Item) => readRecord(i).runs.filter((r) => r.via === "nightly" && r.finished);
  const need = items.filter((i) => nightlyRuns(i).length < NIGHTLY_RUNS);
  await runArms(need.filter((i) => i.suite === "arms"), { reps: NIGHTLY_RUNS, via: "nightly", slots: Math.max(1, loadProfile().maxRuns - 1) });
  await runReplay(need.filter((i) => i.suite === "replay"), NIGHTLY_RUNS, 4, "nightly");
  const prev = readJson(join(NIGHTLY, "latest.json"), Nightly);
  const key = (i: Item) => `${i.suite}:${i.id}`;
  const incomplete = items.filter((i) => nightlyRuns(i).length < NIGHTLY_RUNS).map(key);
  const verdicts: Verdict[] = [];
  const pairs: Pair[] = [];
  for (const suite of ["arms", "replay"] as const) {
    const before: Record<string, number[]> = {};
    const after: Record<string, number[]> = {};
    for (const i of items.filter((x) => x.suite === suite && !incomplete.includes(key(x)))) {
      const old = prev?.items[key(i)];
      if (!old || old.fp === i.fp || old.yard !== i.yard) continue;
      const oldRuns = readRecord({ ...i, fp: old.fp }).runs.filter((r) => r.via === "nightly" && r.finished);
      if (!oldRuns.length) continue;
      before[i.id] = oldRuns.map((r) => r.score);
      after[i.id] = nightlyRuns(i).map((r) => r.score);
      if (suite === "arms") pairs.push({ item: i, before: oldRuns, after: nightlyRuns(i) });
    }
    const v = compare(suite, before, after);
    if (v.compared) verdicts.push(v);
  }
  const judged = pairs.length ? await judgeArms(pairs) : null;
  if (judged) {
    const total = judged.before + judged.after;
    const oldWins = judged.before / total >= JUDGE_OLD_WINS;
    verdicts.push({ suite: "judge", before: `${judged.before}/${total}`, after: `${judged.after}/${total}`, worse: oldWins, why: oldWins ? [`judge เลือกโค้ดของเดิมเป็นอันดับหนึ่ง ${judged.before} จาก ${total} ครั้ง`] : [], compared: total });
  }
  const worse = verdicts.some((v) => v.worse);
  const seconds = Math.round((Date.now() - begun) / 1000);
  const lines = [
    ...verdicts.flatMap((v) => [`${v.suite} ${v.before} → ${v.after} (${v.compared} ${v.suite === "judge" ? "ครั้ง" : "ข้อ"}) ${v.worse ? "แย่ลง" : "ไม่แย่ลง"}`, ...v.why.map((w) => `  ${w}`)]),
    ...(verdicts.length ? [] : [prev ? "ไม่มีข้อที่เปลี่ยนตั้งแต่รอบก่อน" : "รอบแรก: เก็บเป็นฐานให้รอบหน้าเทียบ"]),
    ...(incomplete.length ? [`วัดไม่ครบ: ${incomplete.join(", ")} (รอบหน้าวัดต่อ)`] : []),
  ];
  const stamp = new Date().toISOString();
  const open = worse ? [`${stamp.slice(0, 10)}: ${lines.filter((l) => !l.startsWith("  ")).join(" · ")}`] : verdicts.length ? [] : (prev?.open ?? []);
  const kept = (i: Item) => (incomplete.includes(key(i)) && prev?.items[key(i)] ? prev.items[key(i)]! : { fp: i.fp, yard: i.yard });
  const result: NightlyResult = { at: stamp, seconds, items: Object.fromEntries(items.map((i) => [key(i), kept(i)])), verdicts, worse, incomplete, lines, open };
  writeJson(join(NIGHTLY, `${stamp.replace(/[:.]/g, "-")}.json`), result);
  writeJson(join(NIGHTLY, "latest.json"), result);
  return [`eval กลางคืน · ${Math.round(seconds / 60)} นาที · วัดใหม่ ${need.length} ข้อ${worse ? " · แย่ลง ❌" : ""}`, ...lines].join("\n");
}

export const readNightly = () => readJson(join(NIGHTLY, "latest.json"), Nightly);

const hookScript = (bun: string) => `#!/bin/sh
${MARK}
head -n 1 "$1" | grep -q '^improve:' || exit 0
exec "${bun}" "$(git rev-parse --show-toplevel)/twin.ts" eval gate "$1"
`;

function hookFile(): string | null {
  const r = Bun.spawnSync(["git", "-C", ROOT, "rev-parse", "--git-common-dir"]);
  return r.exitCode === 0 ? resolve(ROOT, r.stdout.toString().trim(), "hooks/commit-msg") : null;
}

const customHooksPath = () => Bun.spawnSync(["git", "-C", ROOT, "config", "--get", "core.hooksPath"]).stdout.toString().trim();

export function installGate(): string {
  const file = hookFile();
  if (!file) return `${ROOT} ไม่ใช่ git repo: ไม่ได้ติดตั้ง eval gate ของ improve:`;
  const custom = customHooksPath();
  if (custom) return `git ใช้ hook จาก ${custom} (core.hooksPath): ไม่ได้ติดตั้ง eval gate ของ improve: ให้ commit-msg ที่นั่นเรียก "${process.execPath}" "${join(ROOT, "twin.ts")}" eval gate "$1" เมื่อบรรทัดแรกขึ้นต้นด้วย improve:`;
  if (existsSync(file) && !readFileSync(file, "utf8").includes(MARK)) return `มี commit-msg hook อื่นอยู่ที่ ${file}: ไม่ได้ติดตั้ง eval gate ของ improve:`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, hookScript(process.execPath));
  chmodSync(file, 0o755);
  return `eval gate ของ commit improve: ใน ${file}`;
}

export function removeGate(): boolean {
  const file = hookFile();
  if (!file || !existsSync(file) || !readFileSync(file, "utf8").includes(MARK)) return false;
  rmSync(file);
  return true;
}

function gateNotice(): string | null {
  const line = installGate();
  return line.startsWith("eval gate") ? null : `⚠ ${line}`;
}
