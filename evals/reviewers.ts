import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { tasteSection } from "../lib/contract.ts";
import { ROOT } from "../lib/profile.ts";

const USAGE = "bun evals/reviewers.ts [--cases profile/evals/reviewers/cases.json] [--arms none,taste,taste-polish,taste-unslop] [--reps 2] [--parallel 4] [--resume <results.json>] [id ...]";
const MODEL = "opus";
const TOP = 3;

const Case = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  context: z.string().min(1),
  images: z.array(z.string()).min(1),
  complaints: z.array(z.string().min(1)).min(1),
  holdout: z.array(z.string().min(1)),
});
type Case = z.infer<typeof Case>;

const ARMS = {
  none: { taste: false, skill: null },
  taste: { taste: true, skill: null },
  "taste-polish": { taste: true, skill: "charles-polish" },
  "taste-unslop": { taste: true, skill: "charles-unslop" },
} as const;
type Arm = keyof typeof ARMS;

const Findings = z.object({ findings: z.array(z.object({ where: z.string(), problem: z.string() })) });
const Matches = z.object({ complaints: z.array(z.object({ complaint: z.number().int(), findings: z.array(z.number().int()) })) });
const ClaudeOut = z.object({ structured_output: z.unknown().optional(), result: z.string().optional() });
const schema = (t: z.ZodType) => {
  const { $schema: _draft, ...rest } = z.toJSONSchema(t);
  return JSON.stringify(rest);
};

const argv = process.argv.slice(2);
const take = (flag: string) => {
  const at = argv.indexOf(flag);
  if (at < 0) return undefined;
  const v = argv[at + 1];
  if (!v || v.startsWith("--")) throw new Error(`${flag} ต้องมีค่า · ${USAGE}`);
  argv.splice(at, 2);
  return v;
};
const casesFile = resolve(ROOT, take("--cases") ?? "profile/evals/reviewers/cases.json");
const reps = Number(take("--reps") ?? 2);
const parallel = Number(take("--parallel") ?? 4);
const armsArg = take("--arms");
const resume = take("--resume");
const arms = (armsArg ? armsArg.split(",") : Object.keys(ARMS)).map((a) => {
  if (!Object.hasOwn(ARMS, a)) throw new Error(`ไม่รู้จัก arm ${a}: ${Object.keys(ARMS).join(", ")}`);
  return a as Arm;
});
const unknownFlag = argv.find((a) => a.startsWith("--"));
if (unknownFlag) throw new Error(`ไม่รู้จัก ${unknownFlag} · ${USAGE}`);
if (!existsSync(casesFile)) throw new Error(`ไม่พบ ${casesFile} · ${USAGE}`);
const all = z.array(Case).parse(JSON.parse(readFileSync(casesFile, "utf8")));
const cases = argv.length ? all.filter((c) => argv.includes(c.id)) : all;
const base = dirname(casesFile);
const imagePath = (p: string) => resolve(base, p);
for (const c of cases) for (const p of c.images) if (!existsSync(imagePath(p))) throw new Error(`${c.id}: ไม่พบภาพ ${p}`);

const tasteFile = join(ROOT, "profile", "taste.md");
const tasteFor = (c: Case) => {
  if (!existsSync(tasteFile)) throw new Error("ไม่พบ profile/taste.md: arm ที่ใช้ taste รันไม่ได้");
  const lines = readFileSync(tasteFile, "utf8").split("\n").filter((l) => !(l.startsWith("- ") && c.holdout.some((h) => l.includes(h))));
  return tasteSection(lines.join("\n"));
};
const skillDir = (name: string) => realpathSync(join(homedir(), ".claude", "skills", name));

async function claude(args: string[], prompt: string): Promise<unknown> {
  const r = await $`claude -p --safe-mode --model ${MODEL} --no-session-persistence --output-format json ${args} < ${new Response(prompt)}`.cwd(base).quiet().nothrow();
  const out = ClaudeOut.safeParse((() => {
    try {
      return JSON.parse(r.stdout.toString());
    } catch {
      return null;
    }
  })());
  return out.success ? out.data.structured_output : undefined;
}

async function review(c: Case, arm: Arm) {
  const spec = ARMS[arm];
  const dirs = [base, ...(spec.skill ? [skillDir(spec.skill)] : [])];
  const rubric = [
    spec.taste ? tasteFor(c) : "",
    spec.skill ? `## Review method\n\nApply this skill as your review method. Its own files are under ${skillDir(spec.skill)}; read any reference it points to.\n\n${readFileSync(join(skillDir(spec.skill), "SKILL.md"), "utf8")}` : "",
  ].filter(Boolean);
  const prompt = [
    "You review screenshots of a screen before it goes to the product owner, who sends back anything that is not good enough.",
    `What the screen is: ${c.context}`,
    `Read every image first: ${c.images.map(imagePath).join(", ")}`,
    "List every problem you would fix before showing it to the owner, most important first. Each finding names the part of the screen (where) and what is wrong with it, concretely (problem). Only what you can see in the images.",
    ...rubric,
  ].join("\n\n");
  const out = Findings.safeParse(await claude(["--tools", "Read", ...dirs.flatMap((d) => ["--add-dir", d]), "--json-schema", schema(Findings)], prompt));
  return out.success ? out.data.findings : null;
}

async function judge(c: Case, findings: { where: string; problem: string }[]) {
  if (!findings.length) return c.complaints.map(() => [] as number[]);
  const prompt = [
    "Match a reviewer's findings to the complaints the product owner actually made about the same screen.",
    "A finding matches a complaint when a developer who fixed only that finding would have fixed the complaint: the same problem in the same part of the screen. A vaguer finding that points at the same part and the same kind of problem matches; a finding about something else does not.",
    `## Owner complaints\n${c.complaints.map((t, i) => `${i}. ${t}`).join("\n")}`,
    `## Reviewer findings\n${findings.map((f, i) => `${i}. [${f.where}] ${f.problem}`).join("\n")}`,
    "Return one entry per complaint with the indexes of the findings that match it (empty when none does).",
  ].join("\n\n");
  const out = Matches.safeParse(await claude(["--tools", "", "--json-schema", schema(Matches)], prompt));
  if (!out.success) return null;
  return c.complaints.map((_, i) => out.data.complaints.find((m) => m.complaint === i)?.findings.filter((f) => f >= 0 && f < findings.length) ?? []);
}

type Row = { case: string; arm: Arm; rep: number; findings: { where: string; problem: string }[] | null; matched: number[][] | null; caught: number; top: number; noise: number };

async function cell(c: Case, arm: Arm, rep: number): Promise<Row> {
  const findings = await review(c, arm);
  const matched = findings ? await judge(c, findings) : null;
  const used = new Set(matched?.flat() ?? []);
  return { case: c.id, arm, rep, findings, matched, caught: matched?.filter((m) => m.length).length ?? 0, top: matched?.filter((m) => m.some((f) => f < TOP)).length ?? 0, noise: findings && matched ? findings.length - used.size : 0 };
}

const out = join(base, "results");
mkdirSync(out, { recursive: true });
const file = resume ? resolve(resume) : join(out, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const rows: Row[] = resume && existsSync(file) ? z.object({ rows: z.array(z.custom<Row>()) }).parse(JSON.parse(readFileSync(file, "utf8"))).rows.filter((r) => r.matched) : [];
const save = () => writeFileSync(file, JSON.stringify({ model: MODEL, reps, cases: cases.map((c) => ({ id: c.id, complaints: c.complaints })), rows }, null, 2));
const done = (c: Case, a: Arm, rep: number) => rows.some((r) => r.case === c.id && r.arm === a && r.rep === rep);
const jobs = cases.flatMap((c) => arms.flatMap((a) => Array.from({ length: reps }, (_, rep) => rep).filter((rep) => !done(c, a, rep)).map((rep) => () => cell(c, a, rep))));
let next = 0;
await Promise.all(
  Array.from({ length: Math.max(1, parallel) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const row = await job();
      rows.push(row);
      save();
      console.error(`${row.case} ${row.arm}#${row.rep} · ${row.matched ? `จับได้ ${row.caught}/${cases.find((c) => c.id === row.case)!.complaints.length} · นอกเหนือ ${row.noise}` : "ล้ม"}`);
    }
  }),
);
save();

const total = (arm: Arm) => rows.filter((r) => r.arm === arm && r.matched);
console.log(`arm · จับได้ (ทุกรอบรวม) · อยู่ใน ${TOP} ข้อแรก · finding ต่อรอบ · ข้อที่เจ้าของไม่ได้ติ ต่อรอบ · ล้ม`);
for (const arm of arms) {
  const ok = total(arm);
  const want = ok.reduce((s, r) => s + cases.find((c) => c.id === r.case)!.complaints.length, 0);
  const caught = ok.reduce((s, r) => s + r.caught, 0);
  const top = ok.reduce((s, r) => s + r.top, 0);
  const pct = (n: number) => `${n}/${want} (${want ? Math.round((100 * n) / want) : 0}%)`;
  const per = (f: (r: Row) => number) => (ok.length ? (ok.reduce((s, r) => s + f(r), 0) / ok.length).toFixed(1) : "-");
  console.log(`${arm} · ${pct(caught)} · ${pct(top)} · ${per((r) => r.findings?.length ?? 0)} · ${per((r) => r.noise)} · ${rows.filter((r) => r.arm === arm && !r.matched).length}`);
}
console.log(`ทุกแถว: ${file}`);
