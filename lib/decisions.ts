import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const ACTIONS = ["answer", "approve", "close", "dispatch"] as const;
export type Action = (typeof ACTIONS)[number];
export const ACTION_LABEL: Record<Action, string> = { answer: "ตอบ worker", approve: "อนุมัติ gate", close: "ปิดงาน", dispatch: "ส่งงานใหม่" };

type Cause = "owner" | "notification" | "schedule";
export type Command = { at: Date; action: Action; run: string | null; cause: Cause; said: string };
export type Decision = Omit<Command, "cause"> & { cause: Exclude<Cause, "owner">; corrected: { at: Date; said: string } | null };
export type Exchange = { at: Date; asked: string; said: string };
export const REPLIES = ["agreed", "objected", "other"] as const;
export type Reply = (typeof REPLIES)[number];
export type Ask = Exchange & { recommended: boolean; reply: Reply; action: Action | null };
export type Seen = { at: Date; model: string | null; version: string | null };
export type History = { commands: Command[]; decisions: Decision[]; exchanges: Exchange[]; asks: Ask[]; seen: Seen[] };

const GO_AHEAD = /^(ทำ|ทำเลย|ทำต่อ|เอา|เอาด้วย|ลุย|ลุยเลย|ได้|ได้เลย|ok|โอเค|okay|ตามแนะนำ|เอาตามที่แนะนำ|ตามนี้|ลุยตามนี้)[\s.!ครับค่ะ]*$/i;
const ASKED = /ไหม|มั้ย|\?|ตอบ "ทำ"|ได้เลย/;
const ASK_TAIL = 300;
const CORRECTION = /ไม่ใช่|ทำไม|บอกแล้ว|บอกผิด|ลองใช้เองหรือยัง|ไม่ควร|เดา|งง|สั่งหลายรอบ|ไม่เห็นจะ|ไม่สมกับ|ยังไม่ได้|ไม่ ok|ไม่โอเค/;
const CHASE = /ถึงไหนแล้ว|ยังไม่เสร็จ|นานจัง|นานเกิน|ช้า/;
export const isGoAhead = (e: Exchange) => GO_AHEAD.test(e.said) && ASKED.test(e.asked.slice(-ASK_TAIL));
export const isCorrection = (e: Exchange) => CORRECTION.test(e.said);
export const isChase = (e: Exchange) => CHASE.test(e.said);
const SENT_BACK = /ยัง(ไม่(ผ่าน|ชอบ|ถูก|ตรง|หาย|ลื่น|ดี)|กระตุก|เพี้ยน|ผิด|พัง)|กระตุก|เพี้ยน|พัง|บั๊ก|defect|ไม่ ok|ไม่โอเค|ไม่ชอบ|ไม่ควร|ดูไม่|ทำใหม่|แก้ใหม่|แก้(อีก)? ?\d+ ?(ข้อ|จุด)|แก้(จุด|ข้อ)เดียว|เกินไป|จืด|เด็กทำ|กดแล้วไม่|ผิด/i;
const SENT_BACK_HEAD = 160;
export const sendsBack = (message: string) => SENT_BACK.test(message.replace(/\s+/g, " ").slice(0, SENT_BACK_HEAD));
const REFUSED = /^(ไม่เอา|ไม่ต้อง|ไม่ทำ|ยังไม่|อย่า(?!ลืม)|ไม่ใช่(?!แค่)|ไม่ควร|ไม่ ok|ไม่โอเค)/;
const AGREED = /^((ทำ|เอา|ลุย|ok|โอเค|ได้)(เลย|สิ|ด้วย|ต่อ|ครับ|ค่ะ|ให้หมด|ทั้งหมด|\s)*)+($|และ|ตาม|[.!,])|ตามที่แนะนำ|ตามแนะนำ/i;
const ECHO_TRIM = /(เลย|ครับ|ค่ะ|สิ|[\s.!])+$/;
const ECHO_CHARS = 30;
const RECOMMENDED = /(?<!คำ)แนะนำ|ผมว่า|ผมเลือก|ผมเอา/;
const RECOMMEND_LINES = 6;
const ASK_LINES = 3;
const ASK_ACTIONS: [Action, RegExp][] = [
  ["close", /ปิดงาน|ปิด run/],
  ["dispatch", /(ส่ง|ให้)\s*worker|ส่งงาน|\bdispatch\b|เปิด run/i],
  ["approve", /\b(push|merge|deploy|ship)\b|เข้า (main|develop)|ลง (main|develop|uat|sit)|ขึ้น (uat|sit)/i],
  ["answer", /worker ถาม|ตอบ worker|ตอบแทน/],
];
const HEREDOC_BODY = /(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n\3(?=\n|$)/g;
const TWIN_COMMAND = /(?:^|[;&|(]|\b(?:do|then|else)\s)\s*bun\s+(?:run\s+)?\S*twin\.ts\s+(followup|dispatch|close)\b([^\n;&|]*)/gm;
const SENT = /ส่งแล้ว \d{4}-\d{4}-|เข้าคิวแล้ว|ส่ง turn \d+ แล้ว|ปิด \d{4}-\d{4}-/;
const RUN_ID = /\b\d{4}-\d{4}-[\w.-]+/;
const RUN_DATE = /^\d{4}-\d{4}-/;
const NAME = /^\w[\w.-]*$/;
const CORRECTION_DAYS = 7;
const CLOCK_SLACK_MS = 2_000;

const Part = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  tool_use_id: z.string().optional(),
  is_error: z.boolean().optional(),
  content: z.unknown().optional(),
  input: z.looseObject({ command: z.unknown().optional() }).optional(),
});
const Line = z.looseObject({
  type: z.string(),
  timestamp: z.string().optional(),
  version: z.string().optional(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  message: z.looseObject({ content: z.union([z.string(), z.array(Part)]), model: z.string().optional() }).optional(),
  attachment: z.looseObject({ type: z.string(), prompt: z.unknown().optional() }).optional(),
});

const rawText = (c: string | z.infer<typeof Part>[]) => (typeof c === "string" ? c : c.filter((x) => x.type === "text").map((x) => x.text ?? "").join("\n"));
const textOf = (c: string | z.infer<typeof Part>[]) => rawText(c).replace(/\s+/g, " ").trim();
const linesOf = (c: string | z.infer<typeof Part>[]) => rawText(c).split("\n").map((line) => line.trim()).filter(Boolean);

function causeOf(text: string): Cause | "same" | "owner-silent" {
  if (text.startsWith("<task-notification") || text.startsWith("Update on pull request")) return "notification";
  if (text.startsWith("<scheduled-task")) return "schedule";
  if (text.startsWith("This session is being continued") || text.startsWith("<system-reminder")) return "same";
  if (text.startsWith("<")) return "owner-silent";
  return "owner";
}

function commandsIn(shell: string): { action: Action; run: string | null }[] {
  return [...shell.replace(HEREDOC_BODY, "$1").matchAll(TWIN_COMMAND)].flatMap(([, verb, rest = ""]): { action: Action; run: string | null }[] => {
    if (verb === "dispatch") {
      const [project = "", slug = ""] = rest.trim().split(/\s+/);
      return NAME.test(project) && NAME.test(slug) ? [{ action: "dispatch", run: `${project}-${slug}` }] : [];
    }
    return [{ action: verb === "close" ? "close" : /--approve\b/.test(rest) ? "approve" : "answer", run: rest.match(RUN_ID)?.[0] ?? null }];
  });
}

function replyTo(said: string, question: string): Reply {
  if (REFUSED.test(said)) return "objected";
  if (said.includes("แต่")) return "other";
  if (GO_AHEAD.test(said) || AGREED.test(said)) return "agreed";
  const echo = said.replace(ECHO_TRIM, "").toLowerCase();
  return echo.length >= 3 && echo.length <= ECHO_CHARS && question.toLowerCase().includes(echo) ? "agreed" : "other";
}

const askedAbout = (question: string): Action | null => ASK_ACTIONS.find(([, re]) => re.test(question))?.[0] ?? null;

const questionIn = (lines: string[]): string | null => lines.slice(-ASK_LINES).findLast((line) => ASKED.test(line)) ?? null;

function readSession(path: string, { commands, exchanges, asks, seen }: Omit<History, "decisions">) {
  let cause: Cause = "owner";
  let said = "";
  let lastText = "";
  let lastLines: string[] = [];
  const sent = new Map<string, Command[]>();
  const failed = new Set<Command>();
  const found: Command[] = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    if (!raw) continue;
    const result = raw.includes('"tool_result"');
    if (result && ![...sent.keys()].some((id) => raw.includes(id))) continue;
    if (raw.includes('"type":"assistant"') && !raw.includes('"type":"text"') && !raw.includes("twin.ts")) continue;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const l = Line.safeParse(json);
    if (!l.success || l.data.isMeta || l.data.isSidechain || !l.data.timestamp) continue;
    const at = new Date(l.data.timestamp);
    if (Number.isNaN(at.getTime())) continue;
    const content = l.data.message?.content;
    if (result) {
      if (typeof content === "string" || content === undefined) continue;
      for (const p of content) {
        if (p.type !== "tool_result" || !p.tool_use_id) continue;
        if (p.is_error && !SENT.test(JSON.stringify(p.content ?? ""))) for (const c of sent.get(p.tool_use_id) ?? []) failed.add(c);
        sent.delete(p.tool_use_id);
      }
      continue;
    }
    if (l.data.type === "assistant" && content !== undefined) {
      const text = textOf(content);
      if (text) {
        lastText = text;
        lastLines = linesOf(content);
        const model = l.data.message?.model;
        seen.push({ at, model: model && !model.startsWith("<") ? model : null, version: l.data.version ?? null });
      }
      if (typeof content === "string") continue;
      for (const p of content) {
        if (p.type !== "tool_use" || p.name !== "Bash" || typeof p.input?.command !== "string") continue;
        const ran = commandsIn(p.input.command).map((c) => ({ at, ...c, cause, said: cause === "owner" ? said : "" }));
        found.push(...ran);
        if (p.id && ran.length) sent.set(p.id, ran);
      }
      continue;
    }
    const prompt = l.data.type === "attachment" && l.data.attachment?.type === "queued_command" ? l.data.attachment.prompt : undefined;
    const queued = typeof prompt === "string";
    const text = queued ? textOf(prompt) : l.data.type === "user" && content !== undefined ? textOf(content) : "";
    if (!text) continue;
    const next = causeOf(text);
    if (next === "same" || (queued && next !== "owner")) continue;
    cause = next === "owner-silent" ? "owner" : next;
    if (next !== "owner") {
      said = "";
      lastText = "";
      lastLines = [];
      continue;
    }
    said = text;
    if (queued) {
      exchanges.push({ at, asked: "", said: text });
      continue;
    }
    exchanges.push({ at, asked: lastText, said: text });
    const question = questionIn(lastLines);
    if (question) asks.push({ at, asked: lastText, said: text, recommended: RECOMMENDED.test(lastLines.slice(-RECOMMEND_LINES).join(" ")), reply: replyTo(text, question), action: askedAbout(question) });
    lastText = "";
    lastLines = [];
  }
  commands.push(...found.filter((c) => !failed.has(c)));
}

const runKey = (run: string) => run.replace(RUN_DATE, "");

export function readHistory(dir: string): History {
  const commands: Command[] = [];
  const exchanges: Exchange[] = [];
  const asks: Ask[] = [];
  const seen: Seen[] = [];
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) readSession(join(dir, f), { commands, exchanges, asks, seen });
  const byTime = (a: { at: Date }, b: { at: Date }) => +a.at - +b.at;
  commands.sort(byTime);
  exchanges.sort(byTime);
  asks.sort(byTime);
  const correctedBy = (run: string | null, at: Date) => {
    const by = run === null ? undefined : commands.find((c) => c.cause === "owner" && c.at > at && +c.at - +at <= CORRECTION_DAYS * 86_400_000 && c.run !== null && runKey(c.run) === runKey(run) && (CORRECTION.test(c.said) || REFUSED.test(c.said)));
    return by ? { at: by.at, said: by.said } : null;
  };
  const decisions: Decision[] = commands.flatMap(({ cause, ...d }) => (cause === "owner" ? [] : [{ ...d, cause, corrected: correctedBy(d.run, d.at) }]));
  return { commands, decisions, exchanges, asks, seen };
}

export function turnSender(commands: Command[], run: string, afterMs: number, startedMs: number): "owner" | "twin" | null {
  const sent = commands.filter((c) => (c.action === "answer" || c.action === "approve") && c.run === run && +c.at > afterMs && +c.at <= startedMs + CLOCK_SLACK_MS);
  if (!sent.length) return null;
  return sent.some((c) => c.cause === "owner") ? "owner" : "twin";
}
