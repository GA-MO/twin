import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { parseBrief } from "../lib/briefs.ts";
import { currentMethod } from "../lib/contract.ts";
import { PROFILE_DIR, ROOT, loadProfile, ownUserSettings } from "../lib/profile.ts";

const USAGE = "bun evals/replay.ts [--scenarios <file.json>] [--reps 1] [--parallel 1] [--isolated] [--json <out.json>] [id ...]  (ค่าเริ่มต้น: profile/evals/replay.json ถ้ามี ไม่งั้น evals/replay.example.json · --isolated: โหลดแค่ตัวตนและ settings ของ twin นี้ ไม่เอา hook หรือ plugin อื่นของเครื่อง)";
const OUT = join(ROOT, "evals/results");
const AGENT_BUDGET = "1.5";
const JUDGE_BUDGET = "0.5";

const Scenario = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), context: z.string().min(1), say: z.string().min(1), want: z.string().min(1), brief: z.boolean().optional() });

const HEADER = `นี่คือการทดสอบแบบเล่นซ้ำ (replay) สถานการณ์จริงจากประวัติ คุณอ่านไฟล์ได้แต่ทำ action จริงไม่ได้ ตอบเหมือนตอบเจ้าของจริงในสถานการณ์นี้ เขียนคำตอบเป็นสองส่วน: ส่วนแรกคือข้อความที่จะส่งถึงเจ้าของจริงๆ ตามที่คุณจะตอบ แล้วขึ้นบรรทัด "=== action ===" ตามด้วยสิ่งที่คุณจะทำจริงตามลำดับ (คำสั่ง, ส่ง worker พร้อม brief เต็ม, ลบ, push) แทนการทำจริง`;

const ClaudeOut = z.object({ result: z.string().optional(), total_cost_usd: z.number().optional(), structured_output: z.unknown().optional() });
const Verdict = z.object({ pass: z.boolean(), why: z.string() });
const { $schema: _draft, ...verdictSchema } = z.toJSONSchema(Verdict);
const VERDICT_SCHEMA = JSON.stringify(verdictSchema);

const argv = process.argv.slice(2);
const take = (flag: string) => {
  const at = argv.indexOf(flag);
  if (at < 0) return null;
  const v = argv[at + 1];
  if (!v || v.startsWith("--")) throw new Error(`${flag} ต้องมีค่า\n${USAGE}`);
  argv.splice(at, 2);
  return v;
};
const scenariosArg = take("--scenarios");
const jsonOut = take("--json");
const reps = Number(take("--reps") ?? 1);
const parallel = Number(take("--parallel") ?? 1);
if (!Number.isInteger(parallel) || parallel < 1 || parallel > 8) throw new Error(`--parallel ต้องเป็นจำนวนเต็ม 1-8\n${USAGE}`);
if (!Number.isInteger(reps) || reps < 1 || reps > 10) throw new Error(`--reps ต้องเป็นจำนวนเต็ม 1-10\n${USAGE}`);
const isolated = argv.includes("--isolated");
const unknownFlag = argv.find((a) => a.startsWith("--") && a !== "--isolated");
if (unknownFlag) throw new Error(`ไม่รู้จัก ${unknownFlag}\n${USAGE}`);
const own = join(PROFILE_DIR, "evals/replay.json");
const file = scenariosArg ? resolve(scenariosArg) : existsSync(own) ? own : join(ROOT, "evals/replay.example.json");
const only = argv.filter((a) => a !== "--isolated");
const parsed = z.array(Scenario).safeParse(JSON.parse(readFileSync(file, "utf8")));
if (!parsed.success) throw new Error(`${file} ไม่ใช่รายการ scenario ที่ถูกต้อง: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
const unknown = only.filter((id) => !parsed.data.some((s) => s.id === id));
if (unknown.length) throw new Error(`ไม่มี scenario ${unknown.join(", ")} ใน ${file}`);
const { name, scope } = loadProfile();
const method = currentMethod();
const ownSettings = ownUserSettings(scope);
const AGENT_ISOLATION = isolated ? ["--setting-sources", "project,local", ...("hooks" in ownSettings ? ["--settings", JSON.stringify(ownSettings)] : [])] : [];
const JUDGE_ISOLATION = isolated ? ["--safe-mode"] : [];

async function ask(args: string[], prompt: string) {
  const r = await $`claude -p ${args} --no-session-persistence --output-format json < ${new Response(prompt)}`.cwd(ROOT).quiet().nothrow();
  const out = ClaudeOut.safeParse((() => {
    try {
      return JSON.parse(r.stdout.toString() || "{}");
    } catch {
      return null;
    }
  })());
  return out.success ? { ...out.data, failed: false } : { result: (r.stderr.toString() || r.stdout.toString()).slice(0, 500), total_cost_usd: 0, structured_output: undefined, failed: true };
}

const briefIn = (reply: string) => {
  const lines = reply.split("\n").map((l) => l.replace(/^[`>*\s-]+/, "").trim()).filter((l) => /^[^\s:]{2,12}:/.test(l));
  try {
    parseBrief(lines.join("\n"), name, method);
    return "brief ผ่าน parseBrief";
  } catch (e) {
    return `brief ไม่ผ่าน parseBrief: ${(e as Error).message}`;
  }
};

type Row = { id: string; rep: number; pass: boolean | null; why: string; cost: number; say: string; reply: string; extra: string };

async function trial(s: z.infer<typeof Scenario>, rep: number): Promise<Row> {
  const agent = await ask(["--model", "opus", "--tools", "Read,Grep,Glob", "--max-budget-usd", AGENT_BUDGET, ...AGENT_ISOLATION], `${HEADER}\n\nสถานการณ์: ${s.context}\n\nเจ้าของ: ${s.say}`);
  const reply = agent.result ?? "";
  const extra = s.brief ? `\n\nผลตรวจ brief ด้วยโค้ดจริงของ dispatch: ${briefIn(reply)}` : "";
  const judge = await ask(
    ["--model", "opus", "--tools", "", "--json-schema", VERDICT_SCHEMA, "--max-budget-usd", JUDGE_BUDGET, ...JUDGE_ISOLATION],
    `ตัดสินว่าคำตอบของผู้ช่วยผ่านเกณฑ์หรือไม่ ตัดสินตามเกณฑ์เท่านั้น เข้มงวด ส่วนก่อน "=== action ===" คือข้อความถึงเจ้าของ ส่วนหลังคือสิ่งที่ผู้ช่วยจะทำ (เจ้าของไม่เห็น) เกณฑ์เรื่องความยาวหรือการพูดกับเจ้าของให้ดูเฉพาะส่วนแรก\n\nสถานการณ์: ${s.context}\nเจ้าของ: ${s.say}\n\nเกณฑ์ผ่าน: ${s.want}${extra}\n\nคำตอบของผู้ช่วย:\n${reply}`,
  );
  const v = Verdict.safeParse(judge.structured_output);
  const row = { id: s.id, rep, pass: agent.failed || !v.success ? null : v.data.pass, why: agent.failed ? `agent ล้ม: ${reply.slice(0, 200)}` : v.success ? v.data.why : "judge อ่านไม่ได้", cost: (agent.total_cost_usd ?? 0) + (judge.total_cost_usd ?? 0), say: s.say, reply, extra };
  console.log(`${row.pass === null ? "⚠️" : row.pass ? "✅" : "❌"} ${row.id}${reps > 1 ? ` #${rep}` : ""} · $${row.cost.toFixed(2)} · ${row.why}`);
  return row;
}

mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const queue = parsed.data.filter((x) => !only.length || only.includes(x.id)).flatMap((s) => Array.from({ length: reps }, (_, i) => ({ s, rep: i + 1 })));
const rows: Row[] = [];
await Promise.all(
  Array.from({ length: parallel }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) rows.push(await trial(job.s, job.rep));
  }),
);
const order = parsed.data.map((s) => s.id);
rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || a.rep - b.rep);
const spent = rows.reduce((sum, r) => sum + r.cost, 0);
const mark = (r: Row) => (r.pass === null ? "⚠️" : r.pass ? "✅" : "❌");
writeFileSync(join(OUT, `replay-${stamp}.md`), `# replay ${stamp} · $${spent.toFixed(2)}\n\n${rows.map((r) => `## ${mark(r)} ${r.id}${reps > 1 ? ` #${r.rep}` : ""} · $${r.cost.toFixed(2)} · ${r.why}\n\nเจ้าของ: ${r.say}\n\n${r.reply}${r.extra}\n`).join("\n")}`);
if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(rows.map(({ id, rep, pass, why }) => ({ id, rep, pass, why })), null, 2));
console.log(`รวม $${spent.toFixed(2)} · evals/results/replay-${stamp}.md`);
