import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

const USAGE = "bun evals/onboard.ts --repo <clone after setup> --home <HOME used for setup> --persona evals/personas/boss.md --out <dir> [--export <conversations.json>] [--turns 4] [--max 25]";

const argv = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? argv[i + 1] : fallback;
  if (v === undefined) throw new Error(`ขาด --${name}\n${USAGE}`);
  return v;
};

const repo = resolve(arg("repo"));
const home = resolve(arg("home"));
const persona = readFileSync(arg("persona"), "utf8").replaceAll("{{EXPORT}}", argv.includes("--export") ? resolve(arg("export")) : "(ไม่มี)");
const out = resolve(arg("out"));
const turnsPerRun = Number(arg("turns", "4"));
const maxQuestions = Number(arg("max", "25"));

const Turn = z.object({ role: z.enum(["agent", "owner"]), text: z.string() });
type Turn = z.infer<typeof Turn>;
const ClaudeOut = z.object({ is_error: z.boolean(), result: z.string().optional(), total_cost_usd: z.number().optional() });
const Settings = z.looseObject({ hooks: z.looseObject({ SessionStart: z.array(z.looseObject({ hooks: z.array(z.looseObject({ command: z.string() })) })) }) });

const TURNS = join(out, "turns.json");
const load = (): Turn[] => (existsSync(TURNS) ? z.array(Turn).parse(JSON.parse(readFileSync(TURNS, "utf8"))) : []);
const save = (turns: Turn[]) => {
  writeFileSync(TURNS, JSON.stringify(turns, null, 2));
  writeFileSync(join(out, "transcript.md"), turns.map((t) => `### ${t.role === "agent" ? "agent" : "เจ้าของ (persona)"}\n\n${t.text}\n`).join("\n"));
};
const onboarded = () => z.object({ onboarded: z.string().nullable() }).parse(JSON.parse(readFileSync(join(repo, "profile/twin.json"), "utf8"))).onboarded !== null;

function hookSettings(): string {
  const s = Settings.parse(JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8")));
  const SessionStart = s.hooks.SessionStart.map((g) => ({ ...g, hooks: g.hooks.map((h) => ({ ...h, command: `HOME="${home}" ${h.command}` })) }));
  return JSON.stringify({ hooks: { SessionStart } });
}

let cost = 0;

async function claude(args: string[], prompt: string, cwd: string): Promise<string> {
  const p = Bun.spawn(["claude", "-p", "--no-session-persistence", "--output-format", "json", ...args], { cwd, stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe" });
  const [text, err] = [await new Response(p.stdout).text(), await new Response(p.stderr).text()];
  await p.exited;
  const r = ClaudeOut.safeParse(JSON.parse(text || "{}"));
  if (!r.success || r.data.is_error || !r.data.result) throw new Error(`claude -p ล้ม: ${(err || text).slice(0, 300)}`);
  cost += r.data.total_cost_usd ?? 0;
  return r.data.result.trim();
}

const agentTurn = (prompt: string) =>
  claude(
    [
      "--model", "opus",
      "--setting-sources", "project,local",
      "--settings", hookSettings(),
      "--permission-mode", "acceptEdits",
      "--allowedTools", "Read", "Write", "Edit", "Glob", "Grep", "Bash(bun twin.ts profile *)", "Bash(bun twin.ts sync history)", "Bash(bun twin.ts identity)", "Bash(ls *)",
      "--disallowedTools", "AskUserQuestion",
    ],
    prompt,
    repo,
  );

const ownerTurn = (turns: Turn[]) =>
  claude(
    ["--model", "sonnet", "--safe-mode", "--tools", ""],
    `คุณกำลังสวมบทเป็นคนในเอกสารด้านล่าง ตอบ agent ที่กำลังสัมภาษณ์คุณ เหมือนคนจริงพิมพ์ตอบในแชท สั้น เป็นภาษาไทย ตอบจากนิสัยและเหตุผลในเอกสารเท่านั้น เรื่องที่เอกสารไม่ได้บอกให้ตอบแบบที่คนนี้น่าจะตอบ ห้ามอธิบายว่าเป็นการสวมบท ตอบเฉพาะข้อความที่จะพิมพ์

${persona}

## บทสนทนาจนถึงตอนนี้

${turns.map((t) => `${t.role === "agent" ? "agent" : "คุณ"}: ${t.text}`).join("\n\n")}

ตอบข้อความล่าสุดของ agent:`,
    out,
  );

mkdirSync(out, { recursive: true });
const turns = load();
let agentTurns = 0;
while (!onboarded() && agentTurns < turnsPerRun && turns.filter((t) => t.role === "owner").length < maxQuestions) {
  const last = turns.at(-1);
  if (last?.role === "agent") {
    turns.push({ role: "owner", text: await ownerTurn(turns) });
  } else {
    turns.push({ role: "agent", text: await agentTurn(last?.text ?? "onboard") });
    agentTurns++;
  }
  save(turns);
  console.log(`${turns.at(-1)!.role}: ${turns.at(-1)!.text.replace(/\s+/g, " ").slice(0, 160)}`);
}
console.log(`\n${onboarded() ? "onboard เสร็จ" : "ยังไม่เสร็จ: รันคำสั่งเดิมซ้ำเพื่อต่อ"} · ${turns.filter((t) => t.role === "owner").length} คำตอบ · รอบนี้ $${cost.toFixed(2)} · ${join(out, "transcript.md")}`);
