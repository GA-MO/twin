import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import { ROOT } from "../lib/profile.ts";

const [resultsFile, fixturesArg] = process.argv.slice(2);
if (!resultsFile) throw new Error("ใช้: bun evals/judge.ts <arms-*.json> [fixtures dir]");
const diffsDir = resultsFile.replace(/arms-(.+)\.json$/, "diffs-$1");
if (diffsDir === resultsFile || !existsSync(diffsDir)) throw new Error(`ไม่พบ diff ของ ${resultsFile}: ต้องเป็นไฟล์ arms-*.json ที่มีโฟลเดอร์ diffs-* อยู่ข้างกัน`);
const JUDGES = ["opus", "sonnet"];
const LABELS = ["X", "Y", "Z", "W"];

const Row = z.object({ task: z.string(), arm: z.string(), rep: z.number(), fixtures: z.string().optional() });
const rows = z.array(Row).parse(JSON.parse(readFileSync(resultsFile, "utf8")));
const FIXTURES = resolve(ROOT, fixturesArg ?? rows[0]?.fixtures ?? "evals/fixtures");
const Verdict = z.object({ ranking: z.array(z.string()), why: z.string() });
const { $schema: _draft, ...schema } = z.toJSONSchema(Verdict);
const ClaudeOut = z.object({ structured_output: z.unknown().optional() });

const shuffle = <T>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);

const points = new Map<string, number>();
const firsts = new Map<string, number>();
const notes: string[] = [];
const groups = new Map<string, string[]>();
for (const r of rows) {
  const key = `${r.task}#${r.rep}`;
  groups.set(key, [...(groups.get(key) ?? []), r.arm]);
}
for (const [key, arms] of groups) {
  const [task, rep] = key.split("#") as [string, string];
  const present = arms.filter((a) => existsSync(join(diffsDir, `${task}-${a}${rep}.diff`)));
  if (present.length < 2) continue;
  if (present.length > LABELS.length) throw new Error(`judge เทียบได้ทีละไม่เกิน ${LABELS.length} arm`);
  const order = shuffle(present);
  const label = new Map(order.map((a, i) => [LABELS[i]!, a]));
  const brief = readFileSync(join(FIXTURES, task, "brief.md"), "utf8");
  const blocks = order.map((a, i) => `### ${LABELS[i]}\n\`\`\`diff\n${readFileSync(join(diffsDir, `${task}-${a}${rep}.diff`), "utf8").slice(0, 30000)}\n\`\`\``).join("\n\n");
  const prompt = `You are a senior engineer reviewing ${order.length} independent fixes for the same task. You do not know who wrote which. Rank them best to worst by: correctness including edge cases the brief implies but does not list, security, keeping what must stay, readability, and keeping the change to what the task needs. Tests and the worker's own claims are not shown; judge the code.\n\n## Brief\n${brief}\n\n## Candidates\n${blocks}\n\nReturn ranking as the labels in order, best first, and one paragraph why.`;
  for (const model of JUDGES) {
    const r = await $`claude -p --model ${model} --tools ${""} --no-session-persistence --output-format json --json-schema ${JSON.stringify(schema)} < ${new Response(prompt)}`.cwd(ROOT).quiet().nothrow();
    const out = ClaudeOut.safeParse(JSON.parse(r.stdout.toString() || "{}"));
    const v = out.success ? Verdict.safeParse(out.data.structured_output) : null;
    if (!v?.success) { notes.push(`${key} ${model}: judge output unreadable`); continue; }
    const ranked = v.data.ranking.map((l) => label.get(l.trim())).filter((a): a is string => !!a);
    ranked.forEach((a, i) => points.set(a, (points.get(a) ?? 0) + (ranked.length - 1 - i)));
    if (ranked[0]) firsts.set(ranked[0], (firsts.get(ranked[0]) ?? 0) + 1);
    notes.push(`${key} ${model}: ${ranked.join(" > ")} · ${v.data.why.slice(0, 400)}`);
    console.log(`${key} ${model}: ${ranked.join(" > ")}`);
  }
}
const summary = [...points.entries()].sort((a, b) => b[1] - a[1]).map(([a, p]) => `${a}: ${p} points, ranked first ${firsts.get(a) ?? 0} times`);
console.log(summary.join("\n"));
writeFileSync(resultsFile.replace(/\.json$/, "-judged.md"), `# blind judging\n\n${summary.map((l) => `- ${l}`).join("\n")}\n\n## per comparison\n\n${notes.map((n) => `- ${n}`).join("\n")}\n`);
