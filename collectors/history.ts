import { $ } from "bun";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import type { Profile } from "../lib/profile.ts";
import { SKIP_PREFIX, exportFile, redact } from "../lib/transcript.ts";

const DAYS = 180;
const KEEP_PER_SOURCE = 1500;
const CHARS = 400;
const RICH_MESSAGES = 150;
const RICH_DAYS = 14;
const DAY = 86_400_000;
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const HOURS: [string, number, number][] = [["00-06", 0, 6], ["06-09", 6, 9], ["09-12", 9, 12], ["12-18", 12, 18], ["18-22", 18, 22], ["22-24", 22, 24]];

type Source = "claude-code" | "claude-ai" | "git";
type Message = { at: string; source: Source; where: string; text: string };

const Content = z.union([z.string(), z.array(z.looseObject({ type: z.string(), text: z.string().optional() }))]);
const TranscriptLine = z.looseObject({
  type: z.literal("user"),
  timestamp: z.string(),
  cwd: z.string(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  isCompactSummary: z.boolean().optional(),
  isVisibleInTranscriptOnly: z.boolean().optional(),
  entrypoint: z.string().optional(),
  message: z.looseObject({ content: Content }),
});
const Conversation = z.looseObject({ name: z.string().nullable().optional(), chat_messages: z.array(z.unknown()) });
const ChatMessage = z.looseObject({
  sender: z.string(),
  created_at: z.string(),
  text: z.string().nullable().optional(),
  content: z.array(z.looseObject({ type: z.string(), text: z.string().nullable().optional() })).nullable().optional(),
});
const MACHINE_TEXT = /^\[Request interrupted|^This session is being continued/;
const valid = (at: string) => !Number.isNaN(Date.parse(at));

const clean = (s: string) => redact(s.replace(/\s+/g, " ").trim()).slice(0, CHARS);

function fromClaudeCode(dir: string, since: number): Message[] {
  if (!existsSync(dir)) return [];
  const out: Message[] = [];
  for (const project of readdirSync(dir)) {
    const full = join(dir, project);
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full).filter((f) => f.endsWith(".jsonl"))) {
      const file = join(full, f);
      if (statSync(file).mtimeMs < since) continue;
      for (const raw of readFileSync(file, "utf8").split("\n")) {
        if (!raw.includes('"type":"user"')) continue;
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          continue;
        }
        const l = TranscriptLine.safeParse(json);
        if (!l.success || l.data.isMeta || l.data.isSidechain || l.data.isCompactSummary || l.data.isVisibleInTranscriptOnly || l.data.entrypoint?.startsWith("sdk")) continue;
        const c = l.data.message.content;
        const text = (typeof c === "string" ? c : c.filter((x) => x.type === "text").map((x) => x.text ?? "").join(" ")).trim();
        if (!text || SKIP_PREFIX.test(text) || MACHINE_TEXT.test(text) || !valid(l.data.timestamp) || Date.parse(l.data.timestamp) < since) continue;
        out.push({ at: l.data.timestamp, source: "claude-code", where: basename(l.data.cwd.split(/[\\/]\.claude[\\/]worktrees[\\/]/)[0]!), text: clean(text) });
      }
    }
  }
  return out;
}

function fromClaudeAi(path: string, since: number): Message[] {
  const json: unknown = JSON.parse(readFileSync(exportFile(path), "utf8"));
  if (!Array.isArray(json)) throw new Error("ไม่ใช่ไฟล์ conversations.json ของ claude.ai");
  return json.flatMap((raw) => {
    const conv = Conversation.safeParse(raw);
    if (!conv.success) return [];
    return conv.data.chat_messages.flatMap((rawMessage) => {
      const parsed = ChatMessage.safeParse(rawMessage);
      if (!parsed.success) return [];
      const m = parsed.data;
      if (m.sender !== "human" || !valid(m.created_at) || Date.parse(m.created_at) < since) return [];
      const text = (m.text || (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(" ")).trim();
      return text ? [{ at: m.created_at, source: "claude-ai" as const, where: conv.data.name || "(ไม่มีชื่อ)", text: clean(text) }] : [];
    });
  });
}

async function fromGit(devRoot: string, since: number): Promise<Message[]> {
  const out: Message[] = [];
  for (const name of readdirSync(devRoot)) {
    const repo = join(devRoot, name);
    if (!existsSync(join(repo, ".git"))) continue;
    const email = (await $`git -C ${repo} config user.email`.quiet().nothrow()).text().trim();
    if (!email) continue;
    const r = await $`git -C ${repo} log --all --since=${new Date(since).toISOString()} --author=${email} --format=%cI%x09%s`.quiet().nothrow();
    for (const l of r.text().split("\n").filter(Boolean)) {
      const [at, subject] = l.split("\t") as [string, string];
      out.push({ at, source: "git", where: name, text: clean(`commit: ${subject}`) });
    }
  }
  return out;
}

function summary(messages: Message[], kept: number, failed: string[], p: Profile, now: Date): string {
  const days = new Set(messages.map((m) => new Date(m.at).toLocaleDateString("sv-SE")));
  const first = messages[0]?.at.slice(0, 10) ?? "-";
  const last = messages.at(-1)?.at.slice(0, 10) ?? "-";
  const spanDays = messages.length ? Math.round((Date.parse(messages.at(-1)!.at) - Date.parse(messages[0]!.at)) / DAY) : 0;
  const rich = messages.length >= RICH_MESSAGES && spanDays >= RICH_DAYS;
  const count = <K extends string>(key: (m: Message) => K) => {
    const m = new Map<K, number>();
    for (const x of messages) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const weekday = count((m) => WEEKDAYS[new Date(m.at).getDay()]!);
  const hour = count((m) => HOURS.find(([, from, to]) => new Date(m.at).getHours() >= from && new Date(m.at).getHours() < to)?.[0] ?? "?");
  const weekend = messages.filter((m) => [0, 6].includes(new Date(m.at).getDay())).length;
  return [
    `# ประวัติของเจ้าของ · ${now.toLocaleDateString("sv-SE")}`,
    "",
    `แหล่งที่ยินยอม: ${[p.sources.claudeCode && "Claude Code", p.sources.claudeAi && "claude.ai export", p.sources.git && p.devRoot && "git"].filter(Boolean).join(", ") || "-"}`,
    `ข้อความของเจ้าของ ${messages.length} ชิ้น · ${first} ถึง ${last} (${spanDays} วัน, มีกิจกรรม ${days.size} วัน)`,
    ...failed.map((f) => `⚠ อ่านไม่ได้: ${f}`),
    `ระดับ: ${rich ? `มาก (≥${RICH_MESSAGES} ชิ้นใน ≥${RICH_DAYS} วัน): ขุดกฎจากประวัติก่อน แล้วให้เจ้าของยืนยัน` : "น้อย: สัมภาษณ์เป็นหลัก ใช้ประวัติเป็นหลักฐานประกอบ"}`,
    "",
    "## แหล่ง",
    ...count((m) => m.source).map(([k, n]) => `- ${k}: ${n}`),
    "",
    "## ที่ที่คุยบ่อย (project หรือชื่อบทสนทนา)",
    ...count((m) => `${m.source}: ${m.where}`).slice(0, 20).map(([k, n]) => `- ${k}: ${n}`),
    "",
    "## เวลาที่คุย",
    `- วัน: ${weekday.map(([k, n]) => `${k} ${n}`).join(" · ")} · เสาร์-อาทิตย์ ${messages.length ? Math.round((weekend / messages.length) * 100) : 0}%`,
    `- ช่วงเวลา: ${hour.map(([k, n]) => `${k} ${n}`).join(" · ")}`,
    "",
    `ข้อความเต็ม ${kept} ชิ้นล่าสุด (ไม่เกิน ${KEEP_PER_SOURCE} ต่อแหล่ง ตัดที่ ${CHARS} ตัวอักษร ซ่อน secret แล้ว): state/history/messages.jsonl หนึ่งบรรทัดต่อข้อความ {at, source, where, text}`,
    "",
  ].join("\n");
}

export default defineCollector({
  title: "ประวัติของเจ้าของ",
  order: 85,
  everyMinutes: 24 * 60,
  timeoutSeconds: 180,
  inBrief: false,
  keep: "snapshot",
  defaultOn: true,
  requires: ["consent"],
  async run({ now, profile }) {
    const since = now.getTime() - DAYS * DAY;
    const s = profile.sources;
    const sources: [string, boolean, () => Promise<Message[]>][] = [
      ["Claude Code", s.claudeCode, async () => fromClaudeCode(s.claudeCodeDir, since)],
      ["claude.ai export", s.claudeAi !== null, async () => fromClaudeAi(s.claudeAi!, since)],
      ["git", s.git && profile.devRoot !== null, () => fromGit(profile.devRoot!, since)],
    ];
    const failed: string[] = [];
    const bySource: Message[][] = [];
    for (const [label, on, read] of sources) {
      if (!on) continue;
      try {
        bySource.push(await read());
      } catch (e) {
        failed.push(`${label}: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
      }
    }
    const byTime = (a: Message, b: Message) => Date.parse(a.at) - Date.parse(b.at);
    const all = bySource.flat().sort(byTime);
    const kept = bySource.flatMap((list) => [...list].sort(byTime).slice(-KEEP_PER_SOURCE)).sort(byTime);
    return {
      kind: "ok",
      files: { "index.md": summary(all, kept.length, failed, profile, now), "messages.jsonl": kept.map((m) => JSON.stringify(m)).join("\n") + "\n" },
      brief: "",
      items: [],
    };
  },
});
