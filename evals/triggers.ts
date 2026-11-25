import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { PROFILE_DIR, ROOT, readProfile } from "../lib/profile.ts";
import { checkSkills } from "../lib/skills.ts";

const DIR = join(ROOT, "state/evals/triggers");
const OWN = join(PROFILE_DIR, "evals/triggers.json");
const EXAMPLE = join(ROOT, "evals/examples/triggers.json");
const MODEL = "opus";
const PARALLEL = 3;
const TIMEOUT_MS = 120_000;
const NONE = "(none)";

const Case = z.object({ prompt: z.string().trim().min(1), expect: z.string().trim().min(1).nullable(), from: z.enum(["history", "example"]) });
export type Case = z.infer<typeof Case>;
const Cases = z
  .array(Case)
  .min(1)
  .refine((cs) => new Set(cs.map((c) => c.prompt)).size === cs.length, { message: "มี prompt ซ้ำกัน: แต่ละประโยคใส่ครั้งเดียว" });
const Stored = z.object({ prompt: z.string(), model: z.string(), fired: z.array(z.string().nullable()), errors: z.array(z.string()).default([]) });
type Stored = z.infer<typeof Stored>;
const Last = z.record(z.string(), z.object({ pass: z.number(), total: z.number() }));

export type Fired = { skill: string | null } | { error: string };

const StreamLine = z.looseObject({
  type: z.string(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  message: z.looseObject({ content: z.array(z.looseObject({ type: z.string(), name: z.string().optional(), input: z.unknown().optional() })).optional() }).optional(),
});
const SkillInput = z.looseObject({ skill: z.string() });

export function firstSkill(line: string): Fired | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const e = StreamLine.safeParse(json);
  if (!e.success) return null;
  if (e.data.type === "result") {
    const failed = e.data.is_error === true || (e.data.subtype !== undefined && e.data.subtype !== "success");
    return failed ? { error: `claude -p จบด้วย error: ${typeof e.data.result === "string" ? e.data.result.slice(0, 200) : (e.data.subtype ?? "unknown")}` } : { skill: null };
  }
  if (e.data.type !== "assistant") return null;
  for (const c of e.data.message?.content ?? []) {
    if (c.type !== "tool_use" || c.name !== "Skill") continue;
    const input = SkillInput.safeParse(c.input);
    return input.success ? { skill: input.data.skill } : { error: "Skill tool_use with no skill name" };
  }
  return null;
}

export function grade(c: Case, fired: string | null, ours: Set<string>): boolean {
  return c.expect === null ? fired === null || !ours.has(fired) : fired === c.expect;
}

export function readCases(file: string): Case[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} อ่านเป็น JSON ไม่ได้: ${(e as Error).message}`);
  }
  const r = Cases.safeParse(raw);
  if (!r.success) throw new Error(`${file} ผิดรูป: ${r.error.issues.slice(0, 3).map((i) => `[${i.path.join(".")}] ${i.message}`).join(" · ")} (แต่ละข้อ: {"prompt", "expect": ชื่อ skill หรือ null, "from": "history" | "example"})`);
  return r.data;
}

async function fire(prompt: string, model: string): Promise<Fired> {
  const child = Bun.spawn(
    ["claude", "-p", "--model", model, "--tools", "Skill", "--strict-mcp-config", "--permission-mode", "dontAsk", "--no-session-persistence", "--output-format", "stream-json", "--verbose", "--max-turns", "2"],
    { cwd: ROOT, stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe", env: { ...process.env, TWIN_EVAL: "1" } },
  );
  const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
  let found: Fired | null = null;
  let rest = "";
  const decoder = new TextDecoder();
  for await (const chunk of child.stdout) {
    rest += decoder.decode(chunk, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) found ??= firstSkill(line);
    if (found) {
      child.kill();
      break;
    }
  }
  found ??= firstSkill(rest);
  await child.exited;
  clearTimeout(timer);
  if (found) return found;
  const err = (await new Response(child.stderr).text()).trim().split("\n")[0];
  return { error: child.signalCode === "SIGKILL" ? `timeout ${TIMEOUT_MS / 1000}s` : err || `exit ${child.exitCode} with no result` };
}

async function pool<T>(jobs: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]!();
      }
    }),
  );
  return out;
}

const readJson = <T>(file: string, schema: z.ZodType<T>): T | null => {
  try {
    const r = schema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
};

type Options = { reps: number; again: boolean; model: string };

export function parseOptions(args: string[]): Options {
  const o: Options = { reps: 1, again: false, model: MODEL };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--again") o.again = true;
    else if (a === "--reps" || a === "--model") {
      const v = args[++i];
      if (!v) throw new Error(`${a} ต้องมีค่าตามหลัง`);
      if (a === "--model") o.model = v;
      else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error(`--reps ต้องเป็นจำนวนเต็ม 1-10 (ได้ "${v}")`);
        o.reps = n;
      }
    } else throw new Error(`ไม่รู้จัก "${a}": ใช้ eval triggers [--reps 1-10] [--model <ชื่อ>] [--again]`);
  }
  return o;
}

const readOr = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");
const frontOf = (file: string) => readOr(file).match(/^\uFEFF?---[\s\S]*?\n---/)?.[0] ?? "";

function routing(): string {
  const home = join(homedir(), ".claude");
  const userSkills = existsSync(join(home, "skills")) ? readdirSync(join(home, "skills")).sort().map((d) => `${d}\n${frontOf(join(home, "skills", d, "SKILL.md"))}`) : [];
  const version = Bun.spawnSync(["claude", "--version"]).stdout.toString().trim();
  return [version, ...["CLAUDE.md", "profile/CLAUDE.md", "state/mode.md"].map((f) => readOr(join(ROOT, f))), readOr(join(home, "CLAUDE.md")), readOr(join(home, "plugins/installed_plugins.json")), ...userSkills].join("\n\0");
}

export async function evalTriggers(args: string[]): Promise<string> {
  const o = parseOptions(args);
  if (!Bun.which("claude")) throw new Error("ไม่เจอคำสั่ง claude ใน PATH: eval triggers ต้องใช้ Claude Code CLI");
  const file = existsSync(OWN) ? OWN : EXAMPLE;
  const cases = readCases(file);
  const { skills } = checkSkills(ROOT, readProfile()?.name ?? null);
  const live = skills.filter((s) => s.invocable);
  const ours = new Set(live.map((s) => s.name));
  const unknown = [...new Set(cases.flatMap((c) => (c.expect && !ours.has(c.expect) ? [c.expect] : [])))];
  if (unknown.length) throw new Error(`${file} คาดว่าจะเรียก skill ที่ไม่มีหรือ model เรียกเองไม่ได้: ${unknown.join(", ")}`);
  const catalog = `${live.map((s) => `${s.name}\n${s.description}`).sort().join("\n\n")}\n\0${routing()}`;
  mkdirSync(DIR, { recursive: true });
  const keyOf = (c: Case) => createHash("sha256").update(JSON.stringify({ prompt: c.prompt, model: o.model, catalog })).digest("hex").slice(0, 16);
  const stored = cases.map((c) => {
    const at = join(DIR, `${keyOf(c)}.json`);
    if (o.again) rmSync(at, { force: true });
    return { at, rec: readJson(at, Stored) ?? { prompt: c.prompt, model: o.model, fired: [], errors: [] } };
  });
  const reused = stored.reduce((n, s) => n + Math.min(s.rec.fired.length, o.reps), 0);
  const jobs = stored.flatMap((s, i) =>
    Array.from({ length: Math.max(0, o.reps - s.rec.fired.length) }, () => async () => {
      const r = await fire(cases[i]!.prompt, o.model);
      if ("error" in r) s.rec.errors = [...s.rec.errors, r.error].slice(-3);
      else s.rec.fired.push(r.skill);
      writeFileSync(s.at, JSON.stringify(s.rec, null, 2));
    }),
  );
  await pool(jobs, PARALLEL);
  return report(cases, stored.map((s) => s.rec), ours, o, file === OWN ? "profile/evals/triggers.json" : "evals/examples/triggers.json", reused);
}

function report(cases: Case[], recs: Stored[], ours: Set<string>, o: Options, source: string, reused: number): string {
  const lastFile = join(DIR, `last-${createHash("sha256").update(`${source}\n${o.model}\n${o.reps}`).digest("hex").slice(0, 12)}.json`);
  const last = readJson(lastFile, Last) ?? {};
  const bySkill = new Map<string, { pass: number; total: number; lines: string[] }>();
  let pass = 0;
  let wrong = 0;
  let silent = 0;
  let total = 0;
  const errors: string[] = [];
  cases.forEach((c, i) => {
    const fired = recs[i]!.fired.slice(0, o.reps);
    const key = c.expect ?? NONE;
    const row = bySkill.get(key) ?? { pass: 0, total: 0, lines: [] };
    const ok = fired.filter((f) => grade(c, f, ours)).length;
    const misses = fired.filter((f) => !grade(c, f, ours)).map((f) => f ?? "ไม่เรียก");
    row.pass += ok;
    row.total += fired.length;
    row.lines.push(`  ${ok === fired.length && fired.length ? "✓" : "✗"} ${ok}/${fired.length}${misses.length ? ` (${[...new Set(misses)].join(", ")})` : ""}${c.from === "example" ? " [ตัวอย่าง]" : ""} ${c.prompt.replace(/\s+/g, " ").slice(0, 70)}`);
    bySkill.set(key, row);
    pass += ok;
    total += fired.length;
    wrong += fired.filter((f) => f !== null && !grade(c, f, ours)).length;
    silent += fired.filter((f) => f === null && !grade(c, f, ours)).length;
    if (fired.length < o.reps) errors.push(...recs[i]!.errors.slice(-1).map((e) => `${c.prompt.slice(0, 40)}: ${e}`));
  });
  const summary = Object.fromEntries([...bySkill].map(([k, v]) => [k, { pass: v.pass, total: v.total }]));
  writeFileSync(lastFile, JSON.stringify(summary, null, 2));
  const delta = (k: string, v: { pass: number; total: number }) => {
    const before = last[k];
    return before && (before.pass !== v.pass || before.total !== v.total) ? ` (ครั้งก่อน ${before.pass}/${before.total})` : "";
  };
  return [
    `trigger eval · ${o.model} · ${cases.length} ประโยค × ${o.reps} รอบ · ${source}${reused ? ` · ใช้ผลเก่า ${reused} รอบ` : ""}`,
    `ถูก ${pass}/${total} · เรียกผิดตัว ${wrong} · ไม่เรียก ${silent}${errors.length ? ` · error ${errors.length}` : ""}`,
    ...[...bySkill].flatMap(([k, v]) => [`${k} ${v.pass}/${v.total}${delta(k, v)}`, ...v.lines]),
    ...(errors.length ? ["error (รันซ้ำจะลองใหม่เฉพาะรอบที่ขาด):", ...errors.map((e) => `  ${e}`)] : []),
  ].join("\n");
}
