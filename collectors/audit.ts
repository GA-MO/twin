import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import { HOME, ROOT } from "../lib/profile.ts";

const WINDOW_DAYS = 7;
const TRANSCRIPTS = join(HOME, ".claude/projects", ROOT.replace(/[^A-Za-z0-9]/g, "-"));
const RUNS = join(ROOT, "runs");
const QUOTES = 6;
const QUOTE_CHARS = 120;
const FLAG_GO_AHEADS = 5;
const FLAG_CORRECTIONS = 5;
const ROUND_GAP_HOURS = 6;
const ROUND_MIN_HOURS = 24;
const ROUND_SHOW_DAYS = 14;
const HOUR = 3_600_000;

const GO_AHEAD = /^(ทำ|ทำเลย|ทำต่อ|เอา|เอาด้วย|ลุย|ลุยเลย|ได้|ได้เลย|ok|โอเค|okay|ตามแนะนำ|เอาตามที่แนะนำ|ตามนี้|ลุยตามนี้)[\s.!ครับค่ะ]*$/i;
const ASKED = /ไหม|มั้ย|\?|ตอบ "ทำ"|ได้เลย/;
const ASK_TAIL = 300;
const CORRECTION = /ไม่ใช่|ทำไม|บอกแล้ว|บอกผิด|ลองใช้เองหรือยัง|ไม่ควร|เดา|งง|สั่งหลายรอบ|ไม่เห็นจะ|ไม่สมกับ|ยังไม่ได้|ไม่ ok|ไม่โอเค/;
const CHASE = /ถึงไหนแล้ว|ยังไม่เสร็จ|นานจัง|นานเกิน|ช้า/;
const SKIP_PREFIX = /^<|^This session is being continued|^Update on pull request/;

const Line = z.looseObject({
  type: z.string(),
  timestamp: z.string().optional(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  message: z.looseObject({ content: z.union([z.string(), z.array(z.looseObject({ type: z.string(), text: z.string().optional() }))]) }).optional(),
});

const RunJson = z.looseObject({ isolated: z.boolean().optional() });
const APPROVED = "อนุมัติแล้ว";
const SETTLE_HOURS = 12;

const Result = z.looseObject({
  structured_output: z.looseObject({ outcome: z.string(), gates_requested: z.array(z.string()).optional() }).optional(),
});

type Exchange = { at: Date; asked: string; said: string };

const textOf = (c: NonNullable<z.infer<typeof Line>["message"]>["content"]) =>
  (typeof c === "string" ? c : c.filter((x) => x.type === "text").map((x) => x.text ?? "").join(" ")).replace(/\s+/g, " ").trim();

const hhmm = (d: Date) => d.toLocaleString("sv-SE", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function exchanges(since: Date): Exchange[] {
  if (!existsSync(TRANSCRIPTS)) return [];
  const out: Exchange[] = [];
  for (const f of readdirSync(TRANSCRIPTS).filter((f) => f.endsWith(".jsonl"))) {
    const path = join(TRANSCRIPTS, f);
    if (statSync(path).mtimeMs < since.getTime()) continue;
    let asked = "";
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      if (!raw) continue;
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      const l = Line.safeParse(json);
      if (!l.success || l.data.isMeta || l.data.isSidechain || !l.data.message) continue;
      const text = textOf(l.data.message.content);
      if (l.data.type === "assistant" && text) asked = text;
      if (l.data.type !== "user" || !text || SKIP_PREFIX.test(text) || text.includes("tool_use_id")) continue;
      const at = new Date(l.data.timestamp ?? 0);
      if (at >= since) out.push({ at, asked, said: text });
      asked = "";
    }
  }
  return out.sort((a, b) => +a.at - +b.at);
}

function turns(since: Date, until: Date) {
  const gates = new Map<string, number>();
  let approvals = 0;
  let clickChecks = 0;
  let unparsed = 0;
  let count = 0;
  const handed = { runs: 0, untouched: 0, waiting: 0 };
  if (!existsSync(RUNS)) return { gates, approvals, clickChecks, unparsed, count, handed };
  for (const id of readdirSync(RUNS)) {
    const dir = join(RUNS, id);
    if (!existsSync(join(dir, "run.json"))) continue;
    const isolated = (() => {
      try {
        return RunJson.parse(JSON.parse(readFileSync(join(dir, "run.json"), "utf8"))).isolated === true;
      } catch {
        return null;
      }
    })();
    const first = join(dir, "turn-1", "pid");
    const firstAt = existsSync(first) ? statSync(first).mtimeMs : 0;
    if (isolated === false && firstAt >= since.getTime() && firstAt < until.getTime()) {
      const turnDirs = readdirSync(dir).filter((d) => /^turn-\d+$/.test(d)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
      const last = join(dir, turnDirs.at(-1) ?? "turn-1", "exit");
      const settled = existsSync(join(dir, "closed.md")) || (existsSync(last) && Date.now() - statSync(last).mtimeMs >= SETTLE_HOURS * HOUR);
      const touched = turnDirs.slice(1).some((d) => {
        const td = join(dir, d);
        if (existsSync(join(td, "touch"))) return true;
        if (existsSync(join(td, "check")) || existsSync(join(td, "click-check")) || !existsSync(join(td, "prompt.md"))) return false;
        return !readFileSync(join(td, "prompt.md"), "utf8").startsWith(APPROVED);
      });
      if (touched || settled) handed.runs++;
      if (settled && !touched) handed.untouched++;
      if (!touched && !settled) handed.waiting++;
    }
    for (const t of readdirSync(dir).filter((d) => d.startsWith("turn-"))) {
      const td = join(dir, t);
      const started = existsSync(join(td, "pid")) ? statSync(join(td, "pid")).mtimeMs : 0;
      if (started < since.getTime() || started >= until.getTime()) continue;
      count++;
      if (existsSync(join(td, "click-check")) || existsSync(join(td, "check"))) clickChecks++;
      if (existsSync(join(td, "prompt.md")) && readFileSync(join(td, "prompt.md"), "utf8").startsWith(APPROVED)) approvals++;
      if (!existsSync(join(td, "exit"))) continue;
      const r = (() => {
        try {
          return Result.safeParse(JSON.parse(readFileSync(join(td, "result.json"), "utf8")));
        } catch {
          return null;
        }
      })();
      if (!r?.success || !r.data.structured_output) {
        unparsed++;
        continue;
      }
      for (const g of r.data.structured_output.gates_requested ?? []) gates.set(g, (gates.get(g) ?? 0) + 1);
    }
  }
  return { gates, approvals, clickChecks, unparsed, count, handed };
}

const untouched = (h: { runs: number; untouched: number; waiting: number }) => `${h.runs ? `${h.untouched}/${h.runs} (${Math.round((100 * h.untouched) / h.runs)}%)` : "-"}${h.waiting ? ` + ยังไม่นับ ${h.waiting}` : ""}`;

const quote = (e: Exchange, s: string) => `  - ${hhmm(e.at)} "${s.slice(0, QUOTE_CHARS)}"`;

function week(ex: Exchange[], since: Date, until: Date) {
  const inWeek = ex.filter((e) => e.at >= since && e.at < until);
  return {
    prompts: inWeek.length,
    goAheads: inWeek.filter((e) => GO_AHEAD.test(e.said) && ASKED.test(e.asked.slice(-ASK_TAIL))),
    corrections: inWeek.filter((e) => CORRECTION.test(e.said)),
    chases: inWeek.filter((e) => CHASE.test(e.said)),
    turns: turns(since, until),
  };
}

function lastImproveRound(): Date | null {
  const log = Bun.spawnSync(["git", "-C", ROOT, "log", "--grep=^improve:", "--format=%cI", "-100"]).stdout.toString().split("\n").filter(Boolean);
  const times = log.map((t) => new Date(t).getTime());
  if (!times.length) return null;
  let start = times[0]!;
  for (const t of times.slice(1)) {
    if (start - t > ROUND_GAP_HOURS * HOUR) break;
    start = t;
  }
  return new Date(start);
}

const trend = (hasPrev: boolean) => ({
  vs: (now: number, prev: number) => (!hasPrev ? "" : now === prev ? ` (สัปดาห์ก่อน ${prev} =)` : ` (สัปดาห์ก่อน ${prev} ${now < prev ? "↓" : "↑"})`),
  arrow: (now: number, prev: number) => (!hasPrev || now === prev ? "" : now < prev ? "↓" : "↑"),
});

export default defineCollector({
  title: "audit (7 วัน)",
  order: 90,
  everyMinutes: 360,
  timeoutSeconds: 120,
  inBrief: false,
  keep: "snapshot",
  defaultOn: true,
  async run({ now, profile }) {
    const day = 86_400_000;
    const since = new Date(now.getTime() - WINDOW_DAYS * day);
    const before = new Date(now.getTime() - 2 * WINDOW_DAYS * day);
    const round = lastImproveRound();
    const roundSpan = round ? now.getTime() - round.getTime() : 0;
    const roundBefore = round ? new Date(round.getTime() - roundSpan) : before;
    const ex = exchanges(roundBefore < before ? roundBefore : before);
    const w = week(ex, since, now);
    const b = week(ex, before, since);
    const t = w.turns;
    const hasPrev = b.prompts > 0 || b.turns.count > 0;
    const { vs, arrow } = trend(hasPrev);
    const gates = (m: Map<string, number>) => [...m.values()].reduce((a, n) => a + n, 0);
    const gateLine = [...t.gates.entries()].map(([g, n]) => `${g} ${n}`).join(" · ") || "-";
    const roundDate = round ? round.toLocaleString("sv-SE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const roundLine = !round
      ? null
      : roundSpan < ROUND_MIN_HOURS * HOUR
        ? `หลัง improve ${roundDate}: ยังเร็วไป (${Math.round(roundSpan / HOUR)} ชม.) จะเทียบได้เมื่อครบ ${ROUND_MIN_HOURS} ชม.`
        : (() => {
            const pre = week(ex, roundBefore, round);
            const post = week(ex, round, now);
            const pair = (a: number, b: number) => `${a}→${b}`;
            return `หลัง improve ${roundDate} (${Math.round(roundSpan / HOUR)} ชม. ก่อน/หลังเท่ากัน · prompt ${pair(pre.prompts, post.prompts)}): งานที่ส่งแล้วไม่ต้องแตะอีก ${untouched(pre.turns.handed)}→${untouched(post.turns.handed)} · ถามแล้วได้ "ทำ" ${pair(pre.goAheads.length, post.goAheads.length)} · ถูกแก้ ${pair(pre.corrections.length, post.corrections.length)} · ตามงาน ${pair(pre.chases.length, post.chases.length)} · turn เพื่ออนุมัติ ${pair(pre.turns.approvals, post.turns.approvals)}`;
          })();
    const index = [
      `# ${profile.name} audit · ${WINDOW_DAYS} วันถึง ${now.toLocaleDateString("sv-SE")}`,
      "",
      `prompt ใน ${profile.name} ${w.prompts}${hasPrev ? ` (สัปดาห์ก่อน ${b.prompts})` : ""} · worker ${t.count} turn${hasPrev ? ` (สัปดาห์ก่อน ${b.turns.count})` : ""}`,
      `ตัวชี้วัดหลัก: งานที่ส่งแล้วไม่ต้องแตะอีก ${untouched(t.handed)}${hasPrev ? ` (สัปดาห์ก่อน ${untouched(b.turns.handed)})` : ""} · งานนับเมื่อจบมาแล้ว ${SETTLE_HOURS} ชม. หรือปิดแล้ว · ไม่นับ turn อนุมัติและ turn ตรวจที่ระบบสั่ง`,
      "",
      hasPrev ? "↓ = น้อยลงกว่าสัปดาห์ก่อน (ดีขึ้น) · ↑ = มากขึ้น" : "สัปดาห์ก่อนยังไม่มีข้อมูล ลูกศรจะขึ้นเมื่อมีครบ 2 สัปดาห์",
      ...(roundLine ? ["", `## ${roundLine}`] : []),
      "",
      "## เข้มไป",
      `- ${profile.name} ถามแล้วได้แค่ "ทำ/เอา/ลุย": ${w.goAheads.length} ครั้ง${vs(w.goAheads.length, b.goAheads.length)}`,
      ...w.goAheads.slice(-QUOTES).map((e) => quote(e, `…${e.asked.slice(-80)}`)),
      `- worker ติด gate: ${gateLine}${vs(gates(t.gates), gates(b.turns.gates))}`,
      `- turn ที่ส่งไปเพื่ออนุมัติ: ${t.approvals}${vs(t.approvals, b.turns.approvals)}`,
      "",
      "## อ่อนไป",
      `- เจ้าของแก้หรือตำหนิ: ${w.corrections.length} ครั้ง${vs(w.corrections.length, b.corrections.length)}`,
      ...w.corrections.slice(-QUOTES).map((e) => quote(e, e.said)),
      `- ตามงาน (ถึงไหนแล้ว/นาน): ${w.chases.length} ครั้ง${vs(w.chases.length, b.chases.length)}`,
      `- worker ส่งงานโดยไม่กด UI หรือไม่ลอง input จนระบบสั่งตรวจเพิ่ม: ${t.clickChecks} turn${vs(t.clickChecks, b.turns.clickChecks)}`,
      `- report อ่านไม่ได้: ${t.unparsed} turn${vs(t.unparsed, b.turns.unparsed)}`,
      "",
    ].join("\n");
    const flagged = w.goAheads.length >= FLAG_GO_AHEADS || w.corrections.length >= FLAG_CORRECTIONS;
    const showRound = !!round && roundSpan >= ROUND_MIN_HOURS * HOUR && roundSpan <= ROUND_SHOW_DAYS * 24 * HOUR;
    return {
      kind: "ok",
      files: { "index.md": index },
      brief: "",
      items: [
        ...(flagged
          ? [{ key: "audit:week", project: profile.name, title: `audit 7 วัน: ถามแล้วได้ "ทำ" ${w.goAheads.length}${arrow(w.goAheads.length, b.goAheads.length)} · ถูกแก้ ${w.corrections.length}${arrow(w.corrections.length, b.corrections.length)} · ตามงาน ${w.chases.length}${arrow(w.chases.length, b.chases.length)} (state/audit/) → พิมพ์ "improve"`, score: 30 }]
          : []),
        ...(showRound && roundLine ? [{ key: "audit:round", project: profile.name, title: roundLine, score: 25 }] : []),
      ],
    };
  },
});
