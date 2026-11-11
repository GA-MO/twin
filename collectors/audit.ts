import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import { FINDING_TAGS, RESOLUTIONS, REVIEW_ROUNDS } from "../lib/contract.ts";
import { ACTION_LABEL, ACTIONS, ASK_TAIL, ASKED, type Ask, CORRECTION, type Command, type Decision, type Exchange, GO_AHEAD, readHistory, REPLIES, type Reply, turnSender } from "../lib/decisions.ts";
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

const TRUST_DAYS = 30;
const TRUST_MIN_ASKS = 10;
const TRUST_SHARE = 0.9;
const CAUSE_LABEL = { notification: "งานแจ้งว่าเสร็จ", schedule: "งานตั้งเวลา" } as const;
const REPLY_LABEL: Record<Reply, string> = { agreed: "ตาม", objected: "ค้าน", other: "ตอบอย่างอื่น" };

const CHASE = /ถึงไหนแล้ว|ยังไม่เสร็จ|นานจัง|นานเกิน|ช้า/;

const RunJson = z.looseObject({ isolated: z.boolean().optional() });
const APPROVED = "อนุมัติแล้ว";
const SETTLE_HOURS = 12;

const Result = z.looseObject({
  structured_output: z
    .looseObject({
      outcome: z.string(),
      gates_requested: z.array(z.string()).optional(),
      review: z.looseObject({ rounds: z.number(), findings: z.array(z.looseObject({ tag: z.string(), resolution: z.string() })) }).optional(),
    })
    .optional(),
});

const hhmm = (d: Date) => d.toLocaleString("sv-SE", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function turns(since: Date, until: Date, commands: Command[]) {
  const gates = new Map<string, number>();
  let approvals = 0;
  let clickChecks = 0;
  let unparsed = 0;
  let count = 0;
  const handed = { runs: 0, untouched: 0, waiting: 0 };
  const review = { turns: 0, rounds: 0, over: 0, stuck: 0, findings: 0, wrong: 0, tags: new Map<string, number>(), important: new Map<string, number>() };
  if (!existsSync(RUNS)) return { gates, approvals, clickChecks, unparsed, count, handed, review };
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
      const startedAt = (d: string | undefined) => (d && existsSync(join(dir, d, "pid")) ? statSync(join(dir, d, "pid")).mtimeMs : 0);
      const touched = turnDirs.slice(1).some((d, i) => {
        const td = join(dir, d);
        if (turnSender(commands, id, startedAt(turnDirs[i]), startedAt(d)) === "twin") return false;
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
      const rv = r.data.structured_output.review;
      if (isolated !== false || !rv?.rounds) continue;
      review.turns++;
      review.rounds += rv.rounds;
      if (rv.rounds > REVIEW_ROUNDS) review.over++;
      if (rv.findings.some((f) => f.tag === "important" && f.resolution === "open")) review.stuck++;
      review.findings += rv.findings.length;
      review.wrong += rv.findings.filter((f) => f.resolution === "wrong").length;
      for (const f of rv.findings) {
        review.tags.set(f.tag, (review.tags.get(f.tag) ?? 0) + 1);
        if (f.tag === "important") review.important.set(f.resolution, (review.important.get(f.resolution) ?? 0) + 1);
      }
    }
  }
  return { gates, approvals, clickChecks, unparsed, count, handed, review };
}

const untouched = (h: { runs: number; untouched: number; waiting: number }) => `${h.runs ? `${h.untouched}/${h.runs} (${Math.round((100 * h.untouched) / h.runs)}%)` : "-"}${h.waiting ? ` + ยังไม่นับ ${h.waiting}` : ""}`;

const RESOLUTION_LABEL: Record<(typeof RESOLUTIONS)[number], string> = { fixed: "แก้แล้ว", wrong: "reviewer ผิด", intentional: "ตั้งใจ", "not-worth": "ไม่คุ้มแก้", open: "ค้าง" };

function reviewLines(rv: ReturnType<typeof turns>["review"], prev: ReturnType<typeof turns>["review"]): string[] {
  if (!rv.turns) return ["- ยังไม่มี turn ที่ worker รายงานรอบรีวิว"];
  const rate = (r: typeof rv) => (r.findings ? Math.round((100 * r.wrong) / r.findings) : 0);
  return [
    `- turn ที่มีรีวิว ${rv.turns} · เฉลี่ย ${(rv.rounds / rv.turns).toFixed(1)} รอบต่อ turn · เกิน ${REVIEW_ROUNDS} รอบ ${rv.over} · จบโดยยังค้าง important ${rv.stuck}`,
    `- finding ${rv.findings}: ${FINDING_TAGS.map((t) => `${t} ${rv.tags.get(t) ?? 0}`).join(" · ")}`,
    `- important: ${RESOLUTIONS.map((r) => `${RESOLUTION_LABEL[r]} ${rv.important.get(r) ?? 0}`).join(" · ")}`,
    `- noise (reviewer ผิด): ${rv.wrong}/${rv.findings} (${rate(rv)}%)${prev.findings ? ` (สัปดาห์ก่อน ${rate(prev)}%)` : ""}`,
  ];
}

const quote = (e: Exchange, s: string) => `  - ${hhmm(e.at)} "${s.slice(0, QUOTE_CHARS)}"`;

function week(ex: Exchange[], commands: Command[], since: Date, until: Date) {
  const inWeek = ex.filter((e) => e.at >= since && e.at < until);
  return {
    prompts: inWeek.length,
    goAheads: inWeek.filter((e) => GO_AHEAD.test(e.said) && ASKED.test(e.asked.slice(-ASK_TAIL))),
    corrections: inWeek.filter((e) => CORRECTION.test(e.said)),
    chases: inWeek.filter((e) => CHASE.test(e.said)),
    turns: turns(since, until, commands),
  };
}

const byAction = (ds: Decision[]) => ACTIONS.map((a) => `${ACTION_LABEL[a]} ${ds.filter((d) => d.action === a).length}`).join(" · ");
const replies = (as: Ask[]) => REPLIES.map((r) => `${REPLY_LABEL[r]} ${as.filter((a) => a.reply === r).length}`).join(" · ");
const share = (as: Ask[]) => {
  const judged = as.filter((a) => a.reply !== "other");
  return judged.length ? `${judged.filter((a) => a.reply === "agreed").length}/${judged.length} (${Math.round((100 * judged.filter((a) => a.reply === "agreed").length) / judged.length)}%)` : "-";
};
const ddmm = (d: Date) => d.toLocaleDateString("sv-SE", { day: "2-digit", month: "2-digit" });

function decisionLines(decisions: Decision[], asks: Ask[], since: Date, before: Date): string[] {
  const inWeek = decisions.filter((d) => d.at >= since);
  const prev = decisions.filter((d) => d.at >= before && d.at < since);
  const corrected = new Set(decisions.filter((d) => d.corrected).map((d) => `${d.run}\n${d.corrected}`));
  const recommended = asks.filter((a) => a.recommended);
  const weekAsks = asks.filter((a) => a.at >= since);
  const weekRecommended = weekAsks.filter((a) => a.recommended);
  return [
    "## ตัดสินแทน (สั่ง worker เองโดยไม่ได้ถาม)",
    `- 7 วัน: ${inWeek.length} ครั้ง · ${byAction(inWeek)}${prev.length ? ` (สัปดาห์ก่อน ${prev.length})` : ""}`,
    decisions.length ? `- ทั้งหมดตั้งแต่ ${ddmm(decisions[0]!.at)}: ${decisions.length} ครั้ง · เจ้าของสั่งแก้ run เดียวกันทีหลัง ${corrected.size} ครั้ง (รายการ: state/audit/decisions.md)` : "- ยังไม่มี",
    "",
    "## ถามพร้อมคำแนะนำ แล้วเจ้าของตามไหม",
    `- 7 วัน: ถาม ${weekAsks.length} · มีคำแนะนำ ${weekRecommended.length} (${replies(weekRecommended)}) · ตามที่แนะนำ ${share(weekRecommended)}`,
    `- ทั้งหมด: ถาม ${asks.length} · มีคำแนะนำ ${recommended.length} · ตามที่แนะนำ ${share(recommended)} · ${[...ACTIONS, null].map((a) => `${a ? ACTION_LABEL[a] : "อื่นๆ"} ${share(recommended.filter((x) => x.action === a))}`).join(" · ")}`,
    ...weekRecommended.filter((a) => a.reply === "objected").slice(-QUOTES).map((a) => `  - ${hhmm(a.at)} ค้าน "${a.said.slice(0, QUOTE_CHARS)}"`),
  ];
}

function decisionLog(decisions: Decision[], asks: Ask[]): string {
  const recommended = asks.filter((a) => a.recommended);
  return [
    `# ตัดสินแทน · ${decisions.length} ครั้ง`,
    "",
    "สั่ง worker เองหลังงานแจ้งว่าเสร็จหรืองานตั้งเวลา โดยไม่มีข้อความเจ้าของมาก่อน · ใหม่สุดก่อน",
    "",
    ...decisions
      .toReversed()
      .map((d) => `- ${hhmm(d.at)} · ${ACTION_LABEL[d.action]} · ${d.run ?? "-"} · ${CAUSE_LABEL[d.cause]}${d.corrected ? ` · เจ้าของสั่งแก้ทีหลัง: "${d.corrected.slice(0, QUOTE_CHARS)}"` : ""}`),
    "",
    `## ถามพร้อมคำแนะนำ · ${recommended.length} ครั้ง`,
    "",
    ...recommended.toReversed().map((a) => `- ${hhmm(a.at)} · ${REPLY_LABEL[a.reply]} · ${a.action ? ACTION_LABEL[a.action] : "อื่นๆ"} · "…${a.asked.slice(-80)}" → "${a.said.slice(0, 80)}"`),
    "",
  ].join("\n");
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
    const h = readHistory(TRANSCRIPTS);
    const ex = h.exchanges;
    const w = week(ex, h.commands, since, now);
    const b = week(ex, h.commands, before, since);
    const trustSince = new Date(now.getTime() - TRUST_DAYS * day);
    const trusted = ACTIONS.flatMap((a) => {
      const asked = h.asks.filter((x) => x.at >= trustSince && x.recommended && x.action === a && x.reply !== "other");
      const agreed = asked.filter((x) => x.reply === "agreed").length;
      return asked.length >= TRUST_MIN_ASKS && agreed >= TRUST_SHARE * asked.length ? [{ action: a, asked: asked.length, agreed }] : [];
    });
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
            const pre = week(ex, h.commands, roundBefore, round);
            const post = week(ex, h.commands, round, now);
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
      ...decisionLines(h.decisions, h.asks, since, before),
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
      "## รีวิวของ worker",
      ...reviewLines(t.review, b.turns.review),
      "",
    ].join("\n");
    const flagged = w.goAheads.length >= FLAG_GO_AHEADS || w.corrections.length >= FLAG_CORRECTIONS;
    const showRound = !!round && roundSpan >= ROUND_MIN_HOURS * HOUR && roundSpan <= ROUND_SHOW_DAYS * 24 * HOUR;
    return {
      kind: "ok",
      files: { "index.md": index, "decisions.md": decisionLog(h.decisions, h.asks) },
      brief: "",
      items: [
        ...(flagged
          ? [{ key: "audit:week", project: profile.name, title: `audit 7 วัน: ถามแล้วได้ "ทำ" ${w.goAheads.length}${arrow(w.goAheads.length, b.goAheads.length)} · ถูกแก้ ${w.corrections.length}${arrow(w.corrections.length, b.corrections.length)} · ตามงาน ${w.chases.length}${arrow(w.chases.length, b.chases.length)} (state/audit/) → พิมพ์ "improve"`, score: 30 }]
          : []),
        ...(showRound && roundLine ? [{ key: "audit:round", project: profile.name, title: roundLine, score: 25 }] : []),
        ...trusted.map((t) => ({ key: `audit:trust:${t.action}`, project: profile.name, title: `ถามก่อน${ACTION_LABEL[t.action]} ${t.asked} ครั้งใน ${TRUST_DAYS} วัน ตามที่แนะนำ ${t.agreed} → พิมพ์ "improve" เพื่อเลื่อนเป็นทำแล้วบอก`, score: 28 })),
      ],
    };
  },
});
