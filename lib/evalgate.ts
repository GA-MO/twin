import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { currentMethod } from "./contract.ts";
import { ROOT, loadProfile } from "./profile.ts";

const DIR = join(ROOT, "state/evals");
const ROUND = join(DIR, "round.json");
const SAVED = join(DIR, "round-profile");
const ROUNDS = join(DIR, "rounds");
const SCISSORS = /^# -+ >8 -+$/m;
const TOLERANCE = 0.1;
const MARK = "# twin eval gate";

const Row = z.object({ id: z.string(), pass: z.boolean().nullable() });
const ArmsRow = z.object({ task: z.string(), outcome: z.string(), hiddenPass: z.number(), hiddenFail: z.number() });
const BROKEN_RUN = ["timeout", "crashed"];
const ARMS_TASKS = ["split-bill", "static-path"];
const ARMS_REPS = 3;
const REPLAY_REPS = 2;

type Scores = { items: Record<string, number[]>; complete: boolean };

const SUITES = {
  replay: {
    what: "สถานการณ์ของเจ้าของ",
    unit: "count",
    triggers: ["profile/mode/SKILL.md", "profile/rules.json", "profile/red-lines.json", "profile/autonomy.json", "profile/CLAUDE.md", "profile/skills/", "CLAUDE.md", ".claude/skills/", "lib/identity.ts"],
    inputs: ["evals/replay.ts", "evals/replay.example.json", "profile/evals/replay.json"],
    args: (out: string) => ["evals/replay.ts", "--isolated", "--reps", String(REPLAY_REPS), "--parallel", "4", "--json", out],
    read(file: string): Scores {
      const rows = z.array(Row).parse(JSON.parse(readFileSync(file, "utf8")));
      const items: Record<string, number[]> = {};
      for (const r of rows) items[r.id] = [...(items[r.id] ?? []), r.pass ? 1 : 0];
      return { items, complete: rows.length > 0 && rows.every((r) => r.pass !== null) };
    },
  },
  arms: {
    what: "งาน worker บน fixture",
    unit: "percent",
    triggers: ["lib/contract.ts", "lib/dispatch.ts", "lib/briefs.ts"],
    inputs: ["evals/arms.ts", ...ARMS_TASKS.map((t) => `evals/fixtures-hard/${t}/`)],
    args: (out: string) => ["evals/arms.ts", "--isolated", "--fixtures", "evals/fixtures-hard", "--tasks", ARMS_TASKS.join(","), "--arms", "now", "--reps", String(ARMS_REPS), "--out", out],
    read(file: string): Scores {
      const rows = z.array(ArmsRow).parse(JSON.parse(readFileSync(file, "utf8")));
      const items: Record<string, number[]> = {};
      for (const r of rows) items[r.task] = [...(items[r.task] ?? []), r.hiddenPass + r.hiddenFail ? r.hiddenPass / (r.hiddenPass + r.hiddenFail) : 0];
      const broken = rows.some((r) => BROKEN_RUN.includes(r.outcome) || r.hiddenPass + r.hiddenFail === 0);
      return { items, complete: !broken && ARMS_TASKS.every((t) => items[t]?.length === ARMS_REPS) };
    },
  },
} as const;

const SuiteName = z.enum(["replay", "arms"]);
type SuiteName = z.infer<typeof SuiteName>;
const NAMES = SuiteName.options;
const isSuite = (s: string): s is SuiteName => (NAMES as readonly string[]).includes(s);

type Files = Record<string, string>;
const Files = z.record(z.string(), z.string());
const Measurement = z.object({ suite: SuiteName, fingerprint: z.string(), at: z.string(), minutes: z.number(), items: z.record(z.string(), z.array(z.number())), complete: z.boolean() });
type Measurement = z.infer<typeof Measurement>;
const Round = z.object({ at: z.string(), base: Files, suites: z.array(SuiteName), fingerprints: z.record(z.string(), z.string()).default({}) });
const Closed = z.object({ committed: Files, trailer: z.array(z.string()) });
type Round = z.infer<typeof Round>;

const covers = (entry: string, path: string) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry);
const ENTRIES = [...new Set(NAMES.flatMap((n) => [...SUITES[n].triggers, ...SUITES[n].inputs]))];
const owned = (entry: string) => entry.startsWith("profile/");
const tracked = (files: Files): Files => Object.fromEntries(Object.entries(files).filter(([p]) => !owned(p)));

function git(...args: string[]): string {
  const r = Bun.spawnSync(["git", "-C", ROOT, ...args]);
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} ล้มใน ${ROOT}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

const blob = (data: Buffer) => createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");

function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const stat = lstatSync(abs);
  if (stat.isFile()) return [rel];
  if (!stat.isDirectory()) return [];
  return readdirSync(abs).flatMap((f) => walk(join(rel, f)));
}

type Source = "worktree" | "index" | "head";

function snapshot(source: Source): Files {
  const files: Files = {};
  for (const rel of ENTRIES.filter(owned).flatMap((e) => walk(e.replace(/\/$/, "")))) files[rel] = blob(readFileSync(join(ROOT, rel)));
  const paths = ENTRIES.filter((e) => !owned(e));
  if (source === "worktree") {
    for (const rel of git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...paths).split("\0").filter(Boolean)) {
      const abs = join(ROOT, rel);
      if (existsSync(abs) && lstatSync(abs).isFile()) files[rel] = blob(readFileSync(abs));
    }
    return files;
  }
  const out = source === "index" ? git("ls-files", "-s", "-z", "--", ...paths) : git("ls-tree", "-r", "-z", "HEAD", "--", ...paths);
  for (const line of out.split("\0").filter(Boolean)) {
    const tab = line.indexOf("\t");
    const meta = line.slice(0, tab);
    const rel = line.slice(tab + 1);
    const oid = source === "index" ? meta.split(" ")[1] : meta.split(" ")[2];
    if (oid) files[rel] = oid;
  }
  return files;
}

function fingerprint(suite: SuiteName, files: Files): string {
  const s = SUITES[suite];
  const own = Object.entries(files).filter(([p]) => [...s.triggers, ...s.inputs].some((e) => covers(e, p))).sort(([a], [b]) => a.localeCompare(b));
  const config = { suite, args: s.args(""), method: currentMethod(), name: loadProfile().name, files: own };
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
}

const changed = (a: Files, b: Files) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();
const touches = (suite: SuiteName, paths: string[], key: "triggers" | "all") =>
  paths.some((p) => (key === "triggers" ? SUITES[suite].triggers : [...SUITES[suite].triggers, ...SUITES[suite].inputs]).some((e) => covers(e, p)));
const required = (paths: string[]) => NAMES.filter((n) => touches(n, paths, "triggers"));

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
  if (!parsed.success) throw new Error(`${relative(ROOT, file)} เสีย อ่านไม่ได้: ลบไฟล์นั้นแล้ววัดใหม่`);
  return parsed.data;
}

const measurementFile = (suite: SuiteName, fp: string) => join(DIR, "measured", `${suite}-${fp}.json`);
const readMeasurement = (suite: SuiteName, fp: string) => readJson(measurementFile(suite, fp), Measurement);
const readRound = () => readJson(ROUND, Round);

async function measure(suite: SuiteName, files: Files): Promise<Measurement> {
  const fp = fingerprint(suite, files);
  const cached = readMeasurement(suite, fp);
  if (cached?.complete) return cached;
  const out = join(DIR, "raw", `${suite}-${fp}.json`);
  rmSync(out, { force: true });
  mkdirSync(dirname(out), { recursive: true });
  console.log(`วัด ${suite} (${SUITES[suite].what}) ...`);
  const begun = Date.now();
  const child = Bun.spawn([process.execPath, ...SUITES[suite].args(out)], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
  await child.exited;
  if (!existsSync(out)) throw new Error(`${suite} ไม่ได้ผลออกมา (exit ${child.exitCode}): ดู error ด้านบน`);
  const after = snapshot("worktree");
  if (changed(files, after).some((p) => touches(suite, [p], "all"))) throw new Error(`ไฟล์ของ ${suite} เปลี่ยนระหว่างวัด: วัดใหม่เมื่อแก้เสร็จแล้ว`);
  const m: Measurement = { suite, fingerprint: fp, at: new Date().toISOString(), minutes: Math.round((Date.now() - begun) / 6000) / 10, ...SUITES[suite].read(out) };
  writeJson(measurementFile(suite, fp), m);
  return m;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export type Verdict = { suite: SuiteName; before: string; after: string; worse: boolean; why: string[]; incomplete: boolean };

export function compare(suite: SuiteName, before: Pick<Measurement, "items" | "complete">, after: Pick<Measurement, "items" | "complete">): Verdict {
  const ids = Object.keys(before.items).filter((id) => after.items[id]?.length && before.items[id]?.length);
  const b = (id: string) => before.items[id]!;
  const a = (id: string) => after.items[id]!;
  const percent = SUITES[suite].unit === "percent";
  const score = (runs: number[][]) => {
    const all = runs.flat();
    return percent ? `${Math.round(100 * mean(runs.map(mean)))}%` : `${all.filter((x) => x === 1).length}/${all.length}`;
  };
  const totalB = ids.reduce((s, id) => s + mean(b(id)), 0);
  const totalA = ids.reduce((s, id) => s + mean(a(id)), 0);
  const lost = ids.filter((id) => mean(b(id)) === 1 && mean(a(id)) === 0);
  const dropped = totalA < totalB - TOLERANCE * ids.length;
  const down = ids.filter((id) => mean(a(id)) < mean(b(id))).map((id) => `${id} ${score([b(id)])} → ${score([a(id)])}${lost.includes(id) ? " (ไม่ผ่านเลย)" : ""}`);
  return {
    suite,
    before: score(ids.map(b)),
    after: score(ids.map(a)),
    worse: lost.length > 0 || dropped,
    why: lost.length > 0 || dropped ? down : [],
    incomplete: !before.complete || !after.complete || ids.length === 0,
  };
}

const verdictLine = (v: Verdict) => `${v.suite} ${v.before} → ${v.after} · ${v.incomplete ? "วัดไม่ครบ" : v.worse ? "แย่ลง ❌" : "ไม่แย่ลง ✅"}`;

function targetSuites(targets: string[]): { suites: SuiteName[]; unmeasured: string[] } {
  const suites = new Set<SuiteName>();
  const unmeasured: string[] = [];
  for (const t of targets) {
    if (isSuite(t)) {
      suites.add(t);
      continue;
    }
    const rel = relative(ROOT, isAbsolute(t) ? t : resolve(ROOT, t));
    if (!rel || rel.startsWith("..")) throw new Error(`${t} ไม่ได้อยู่ใน ${ROOT}`);
    const hit = NAMES.filter((n) => touches(n, [rel], "triggers"));
    if (hit.length) hit.forEach((n) => suites.add(n));
    else unmeasured.push(rel);
  }
  return { suites: [...suites], unmeasured };
}

function saveProfile(files: Files) {
  rmSync(SAVED, { recursive: true, force: true });
  for (const rel of Object.keys(files).filter(owned)) {
    mkdirSync(dirname(join(SAVED, rel)), { recursive: true });
    copyFileSync(join(ROOT, rel), join(SAVED, rel));
  }
}

const baseFingerprint = (round: Round, s: SuiteName) => round.fingerprints[s] ?? fingerprint(s, round.base);

function blockers(round: Round, current: Files): string[] {
  const stale = changed(tracked(round.base), tracked(snapshot("head")));
  const moved = changed(round.base, current);
  return [
    ...(stale.length ? [`baseline ไม่ได้วัดจาก HEAD (${stale.join(", ")} ต่างกัน): เริ่มรอบใหม่ด้วย bun twin.ts eval drop`] : []),
    ...required(moved).flatMap((s) => {
      const rules = moved.filter((p) => SUITES[s].inputs.some((e) => covers(e, p)));
      return rules.length ? [`${s}: เกณฑ์วัดเปลี่ยนในรอบเดียวกับการแก้ (${rules.join(", ")}): แยกการแก้เกณฑ์ไปทำนอกรอบ`] : [];
    }),
  ];
}

export async function before(targets: string[]): Promise<string> {
  if (!targets.length) throw new Error(`ใช้: eval before <ไฟล์ที่จะแก้ หรือ ${NAMES.join("|")}> ...`);
  const { suites, unmeasured } = targetSuites(targets);
  const now = snapshot("worktree");
  const round: Round = readRound() ?? { at: new Date().toISOString(), base: now, suites: [], fingerprints: {} };
  const moved = changed(round.base, now);
  const late = suites.filter((s) => touches(s, moved, "all"));
  if (late.length) throw new Error(`${late.join(", ")}: ไฟล์ ${moved.join(", ")} แก้ไปแล้วตั้งแต่เริ่มรอบนี้ วัด baseline ไม่ได้แล้ว\nย้อนการแก้แล้ววัดใหม่ หรือเริ่มรอบใหม่: bun twin.ts eval drop`);
  const dirty = changed(tracked(snapshot("head")), tracked(now));
  if (dirty.length) throw new Error(`มีการแก้ที่ยังไม่ได้ commit: ${dirty.join(", ")}\ncommit หรือเก็บไว้ก่อน แล้ววัด baseline จากของที่ commit แล้ว`);
  if (!existsSync(ROUND)) saveProfile(now);
  const fingerprints = { ...round.fingerprints, ...Object.fromEntries(suites.map((s) => [s, fingerprint(s, now)])) };
  writeJson(ROUND, { ...round, suites: [...new Set([...round.suites, ...suites])], fingerprints });
  const lines = [gateNotice()].filter((l): l is string => l !== null);
  for (const s of suites) {
    const m = await measure(s, now);
    lines.push(`baseline ${s}: ${compare(s, m, m).before}${m.complete ? "" : " (วัดไม่ครบ: รันซ้ำ)"}`);
  }
  if (unmeasured.length) lines.push(`ไม่มี eval วัด: ${unmeasured.join(", ")}`);
  if (!suites.length) lines.push("ไม่มีไฟล์ที่ eval วัด: แก้ได้เลย");
  return lines.join("\n");
}

function previous(suite: SuiteName, fp: string): Measurement | null {
  const dir = join(DIR, "measured");
  if (!existsSync(dir)) return null;
  const all = readdirSync(dir)
    .filter((f) => f.startsWith(`${suite}-`) && f.endsWith(".json") && f !== `${suite}-${fp}.json`)
    .map((f) => readJson(join(dir, f), Measurement))
    .filter((m): m is Measurement => !!m?.complete);
  return all.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

export async function after(names: string[]): Promise<string> {
  const bad = names.filter((n) => !isSuite(n));
  if (bad.length) throw new Error(`ไม่รู้จัก ${bad.join(", ")} · ใช้: eval [${NAMES.join("|")}] หรือ eval before <ไฟล์>`);
  const picked = names.filter(isSuite);
  const round = readRound();
  const now = snapshot("worktree");
  const lines = [gateNotice()].filter((l): l is string => l !== null);
  if (!round) {
    for (const s of picked.length ? picked : (["replay"] as const)) {
      const m = await measure(s, now);
      const prev = previous(s, m.fingerprint);
      lines.push(prev ? `${verdictLine(compare(s, prev, m))} (เทียบกับครั้งก่อน ${prev.at.slice(0, 10)})` : `${s}: ${compare(s, m, m).after} (ยังไม่มีครั้งก่อนให้เทียบ)`);
    }
    return lines.join("\n");
  }
  const moved = changed(round.base, now);
  const suites = [...new Set([...round.suites, ...required(moved), ...picked])];
  const blocked = blockers(round, now);
  const verdicts: Verdict[] = [];
  for (const s of suites) {
    const base = readMeasurement(s, baseFingerprint(round, s));
    const pre = base?.complete ? base : touches(s, moved, "all") ? null : await measure(s, round.base);
    if (!pre) {
      lines.push(`${s}: ไม่มี baseline (แก้ ${moved.filter((p) => touches(s, [p], "all")).join(", ")} ก่อนวัด) → ย้อนการแก้ วัด eval before แล้วแก้ใหม่`);
      continue;
    }
    const v = compare(s, pre, await measure(s, now));
    verdicts.push(v);
    lines.push(verdictLine(v), ...v.why.map((w) => `  ${w}`));
  }
  const ok = !blocked.length && verdicts.length === suites.length && verdicts.every((v) => !v.worse && !v.incomplete);
  lines.push(...blocked.map((b) => `⚠ ${b}`));
  lines.push(!suites.length && ok ? "ไม่มีไฟล์ที่ eval วัดเปลี่ยน: commit improve: ได้" : ok ? "commit improve: ได้" : "ยัง commit improve: ไม่ได้ · ย้อน: bun twin.ts eval drop (profile/) หรือ git (engine)");
  return lines.join("\n");
}

export function drop(): string {
  const round = (() => {
    try {
      return readRound();
    } catch {
      rmSync(ROUND);
      return null;
    }
  })();
  if (!round) return existsSync(SAVED) ? "round.json เสีย: ลบรอบทิ้งแล้ว ไฟล์ของเจ้าของตอนเริ่มรอบยังอยู่ใน state/evals/round-profile/" : "ไม่มีรอบที่เปิดอยู่";
  const moved = changed(round.base, snapshot("worktree")).filter(owned);
  const restored = moved.filter((rel) => existsSync(join(SAVED, rel)));
  for (const rel of restored) copyFileSync(join(SAVED, rel), join(ROOT, rel));
  const added = moved.filter((rel) => !restored.includes(rel) && existsSync(join(ROOT, rel)));
  rmSync(ROUND);
  rmSync(SAVED, { recursive: true, force: true });
  return [
    "ทิ้งรอบนี้แล้ว",
    ...(restored.length ? [`ย้อน ${restored.join(", ")} กลับเป็นตอนเริ่มรอบ`] : []),
    ...(added.length ? [`ไฟล์ที่เพิ่มในรอบนี้ยังอยู่: ${added.join(", ")}`] : []),
    "การแก้ใน engine ย้อนด้วย git · วัดใหม่: bun twin.ts eval before <ไฟล์>",
  ].join("\n");
}

function lastClosed(): z.infer<typeof Closed> | null {
  if (!existsSync(ROUNDS)) return null;
  const last = readdirSync(ROUNDS).filter((f) => f.endsWith(".json")).sort().at(-1);
  if (!last) return null;
  return readJson(join(ROUNDS, last), Closed);
}

function withTrailer(message: string, trailer: string[]): string {
  const cut = message.search(SCISSORS);
  const body = cut < 0 ? message : message.slice(0, cut);
  const rest = cut < 0 ? "" : `\n${message.slice(cut)}`;
  const kept = body.split("\n").filter((l) => !/^Eval(-[a-z]+)?: /.test(l)).join("\n");
  return `${kept.trimEnd()}\n\n${trailer.join("\n")}\n${rest}`;
}

export function gate(messageFile: string): string {
  const message = readFileSync(messageFile, "utf8");
  if (!/^improve:/.test(message.split("\n")[0] ?? "")) return "";
  const round = readRound();
  const fix = "วัดด้วย bun twin.ts eval before <ไฟล์> ก่อนแก้ แล้ว bun twin.ts eval หลังแก้";
  const current = snapshot("index");
  if (!round) {
    const closed = lastClosed();
    if (closed && !changed(closed.committed, current).length) {
      writeFileSync(messageFile, withTrailer(message, closed.trailer));
      return closed.trailer.join("\n");
    }
    throw new Error(`commit improve: ไม่ได้: ยังไม่ได้วัด eval ของรอบนี้\n${fix}`);
  }
  const moved = changed(round.base, current);
  const problems: string[] = [...blockers(round, current)];
  const verdicts: Verdict[] = [];
  for (const s of required(moved)) {
    const pre = readMeasurement(s, baseFingerprint(round, s));
    const post = readMeasurement(s, fingerprint(s, current));
    if (!pre?.complete) problems.push(`${s}: ไม่มี baseline ที่วัดครบก่อนแก้`);
    if (!post?.complete) problems.push(`${s}: ยังไม่ได้วัดหลังแก้ หรือสิ่งที่ commit ไม่ตรงกับที่วัด (รัน bun twin.ts eval แล้ว git add ให้ตรงกัน)`);
    if (!pre?.complete || !post?.complete) continue;
    const v = compare(s, pre, post);
    verdicts.push(v);
    if (v.incomplete) problems.push(`${s}: วัดไม่ครบ`);
    else if (v.worse) problems.push(`${s} แย่ลง ${v.before} → ${v.after}`, ...v.why.map((w) => `  ${w}`));
  }
  if (problems.length) throw new Error(`commit improve: ไม่ได้\n${problems.map((p) => (p.startsWith("  ") ? p : `- ${p}`)).join("\n")}\nแก้ใหม่หรือย้อนส่วนที่แย่ลง แล้ววัดอีกครั้ง: bun twin.ts eval`);
  const trailer = verdicts.length ? verdicts.map((v) => `Eval-${v.suite}: ${v.before} → ${v.after} ไม่แย่ลง`) : ["Eval: ไม่มีไฟล์ที่ eval วัด"];
  writeFileSync(messageFile, withTrailer(message, trailer));
  writeJson(join(ROUNDS, `${round.at.replace(/[:.]/g, "-")}.json`), { ...round, subject: message.split("\n")[0], changed: moved, verdicts, committed: current, trailer });
  rmSync(ROUND);
  rmSync(SAVED, { recursive: true, force: true });
  return trailer.join("\n");
}

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
