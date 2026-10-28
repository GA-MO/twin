import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { parseBrief } from "../lib/briefs.ts";
import { currentMethod } from "../lib/contract.ts";
import { PROFILE_DIR, ROOT, loadProfile } from "../lib/profile.ts";

const USAGE = "bun evals/replay.ts [--scenarios <file.json>] [id ...]  (ค่าเริ่มต้น: profile/evals/replay.json ถ้ามี ไม่งั้น evals/replay.example.json)";
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
const at = argv.indexOf("--scenarios");
if (at >= 0 && !argv[at + 1]) throw new Error(USAGE);
const own = join(PROFILE_DIR, "evals/replay.json");
const file = at >= 0 ? resolve(argv[at + 1]!) : existsSync(own) ? own : join(ROOT, "evals/replay.example.json");
const only = at < 0 ? argv : argv.filter((_, i) => i !== at && i !== at + 1);
const parsed = z.array(Scenario).safeParse(JSON.parse(readFileSync(file, "utf8")));
if (!parsed.success) throw new Error(`${file} ไม่ใช่รายการ scenario ที่ถูกต้อง: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
const unknown = only.filter((id) => !parsed.data.some((s) => s.id === id));
if (unknown.length) throw new Error(`ไม่มี scenario ${unknown.join(", ")} ใน ${file}`);
const { name } = loadProfile();
const method = currentMethod();

async function ask(args: string[], prompt: string) {
  const r = await $`claude -p ${args} --no-session-persistence --output-format json < ${new Response(prompt)}`.cwd(ROOT).quiet().nothrow();
  const out = ClaudeOut.safeParse(JSON.parse(r.stdout.toString() || "{}"));
  return out.success ? out.data : { result: r.stderr.toString().slice(0, 500), total_cost_usd: 0 };
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

mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const rows: string[] = [];
let spent = 0;
for (const s of parsed.data.filter((x) => !only.length || only.includes(x.id))) {
  const agent = await ask(["--model", "opus", "--tools", "Read,Grep,Glob", "--max-budget-usd", AGENT_BUDGET], `${HEADER}\n\nสถานการณ์: ${s.context}\n\nเจ้าของ: ${s.say}`);
  const reply = agent.result ?? "";
  const extra = s.brief ? `\n\nผลตรวจ brief ด้วยโค้ดจริงของ dispatch: ${briefIn(reply)}` : "";
  const judge = await ask(
    ["--model", "opus", "--tools", "", "--json-schema", VERDICT_SCHEMA, "--max-budget-usd", JUDGE_BUDGET],
    `ตัดสินว่าคำตอบของผู้ช่วยผ่านเกณฑ์หรือไม่ ตัดสินตามเกณฑ์เท่านั้น เข้มงวด ส่วนก่อน "=== action ===" คือข้อความถึงเจ้าของ ส่วนหลังคือสิ่งที่ผู้ช่วยจะทำ (เจ้าของไม่เห็น) เกณฑ์เรื่องความยาวหรือการพูดกับเจ้าของให้ดูเฉพาะส่วนแรก\n\nสถานการณ์: ${s.context}\nเจ้าของ: ${s.say}\n\nเกณฑ์ผ่าน: ${s.want}${extra}\n\nคำตอบของผู้ช่วย:\n${reply}`,
  );
  const v = Verdict.safeParse(judge.structured_output);
  const cost = (agent.total_cost_usd ?? 0) + (judge.total_cost_usd ?? 0);
  spent += cost;
  const line = `${v.success && v.data.pass ? "✅" : "❌"} ${s.id} · $${cost.toFixed(2)} · ${v.success ? v.data.why : "judge อ่านไม่ได้"}`;
  console.log(line);
  rows.push(`## ${line}\n\nเจ้าของ: ${s.say}\n\n${reply}${extra}\n`);
}
writeFileSync(join(OUT, `replay-${stamp}.md`), `# replay ${stamp} · $${spent.toFixed(2)}\n\n${rows.join("\n")}`);
console.log(`รวม $${spent.toFixed(2)} · evals/results/replay-${stamp}.md`);
