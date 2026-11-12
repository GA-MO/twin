import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import { FINDING_TAGS, FIX_MARK, RESOLUTIONS, REVIEW_ROUNDS } from "../lib/contract.ts";
import { ACTION_LABEL, ACTIONS, type Ask, type Command, type Exchange, isChase, isCorrection, isGoAhead, readHistory, REPLIES, type Reply, sendsBack, turnSender } from "../lib/decisions.ts";
import { lastEvidence, readIdentity, STALE_RULE_DAYS } from "../lib/identity.ts";
import { buildDays, type Day, dateOf, type Handed, handed, LEDGER_FILE, type LedgerDecision, type LedgerRun, mergeDays, modelChanges, readLedger, serialize, shift, type Touch, VERDICT_DAYS, type Verdict, verdict, withoutQuotes } from "../lib/ledger.ts";
import { crowded, MODE_CROWDED_SHARE, MODE_MAX_CHARS, renderMode } from "../lib/mode.ts";
import { inside } from "../lib/paths.ts";
import { HOME, ROOT } from "../lib/profile.ts";

const WINDOW_DAYS = 7;
const TRANSCRIPTS = join(HOME, ".claude/projects", ROOT.replace(/[^A-Za-z0-9]/g, "-"));
const RUNS = join(ROOT, "runs");
const QUOTES = 6;
const QUOTE_CHARS = 120;
const FLAG_GO_AHEADS = 5;
const FLAG_CORRECTIONS = 5;
const ROUND_GAP_HOURS = 6;
const CHANGE_SHOW_DAYS = 30;
const CANARY_TURNS = 5;
const LOG_LINES = 400;
const HOUR = 3_600_000;
const LEDGER = join(ROOT, "state/audit", LEDGER_FILE);

const TRUST_DAYS = 30;
const TRUST_MIN_ASKS = 10;
const TRUST_SHARE = 0.9;
const DOUBT_MIN_CORRECTED = 3;
const DOUBT_SHARE = 0.1;
const PROJECT_MIN_RUNS = 3;
const PROJECT_LINES = 8;
const NO_PROJECT = "ไม่ระบุโปรเจกต์";
const RULE_IDS = 5;
const CAUSE_LABEL = { notification: "งานแจ้งว่าเสร็จ", schedule: "งานตั้งเวลา" } as const;
const REPLY_LABEL: Record<Reply, string> = { agreed: "ตาม", objected: "ค้าน", other: "ตอบอย่างอื่น" };

const WORD_LABEL: Record<Extract<Verdict, { kind: "judged" }>["word"], string> = { better: "ดีขึ้น", worse: "แย่ลง", unclear: "แยกไม่ออกจากความแกว่งปกติ", thin: "ข้อมูลน้อย" };

const RunJson = z.looseObject({ isolated: z.boolean().optional(), project: z.string().optional(), repo: z.string().optional(), startedAt: z.string().optional() });
const TEMP_ROOTS = [tmpdir(), "/tmp", "/var/folders"].flatMap((root) => [root, join("/private", root)]);
const ClaudeSettings = z.looseObject({ cleanupPeriodDays: z.number().min(0).optional() });
const DEFAULT_RETENTION_DAYS = 30;
const DAY = 24 * 3_600_000;
const BRIEF_VERDICT_DAYS = 14;

function transcriptsKeptSince(now: Date): Date {
  const days = (() => {
    try {
      return ClaudeSettings.parse(JSON.parse(readFileSync(join(HOME, ".claude/settings.json"), "utf8"))).cleanupPeriodDays;
    } catch {
      return undefined;
    }
  })();
  return new Date(now.getTime() - Math.max((days ?? DEFAULT_RETENTION_DAYS) - 1, 0) * DAY);
}

type RunFile = z.infer<typeof RunJson>;

function readRun(dir: string): RunFile | null {
  try {
    return RunJson.parse(JSON.parse(readFileSync(join(dir, "run.json"), "utf8")));
  } catch {
    return null;
  }
}

const isOwn = (run: RunFile) => run.repo !== undefined && relative(ROOT, run.repo) === "";

function isHarness(run: RunFile): boolean {
  const repo = run.repo;
  return run.isolated === true || (repo !== undefined && !isOwn(run) && TEMP_ROOTS.some((root) => inside(root, repo)));
}
const APPROVED = "อนุมัติแล้ว";
const APPROVED_LINE = /^อนุมัติแล้ว[^\n]*\n/;
const ACCEPTED = "เก็บงาน";
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

type Outcome = LedgerRun & { startedAt: number; own: boolean };

function outcomes(commands: Command[], known: Map<string, LedgerRun>, readableSince: Date): { runs: Outcome[]; excluded: Set<string> } {
  const excluded = new Set<string>();
  if (!existsSync(RUNS)) return { runs: [], excluded };
  const runs = readdirSync(RUNS).flatMap((id): Outcome[] => {
    const dir = join(RUNS, id);
    const first = join(dir, "turn-1", "pid");
    if (!existsSync(join(dir, "run.json")) || !existsSync(first)) return [];
    const run = readRun(dir);
    if (!run) return [];
    if (isHarness(run)) {
      excluded.add(id);
      return [];
    }
    const turnDirs = readdirSync(dir).filter((d) => /^turn-\d+$/.test(d)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
    const closed = join(dir, "closed.md");
    const last = join(dir, turnDirs.at(-1) ?? "turn-1", "exit");
    const settled = existsSync(closed) || (existsSync(last) && Date.now() - statSync(last).mtimeMs >= SETTLE_HOURS * HOUR);
    const startedAt = (d: string | undefined) => (d && existsSync(join(dir, d, "pid")) ? statSync(join(dir, d, "pid")).mtimeMs : 0);
    const stored = known.get(id)?.touch;
    const touches = turnDirs.slice(1).flatMap((d, i): Touch[] => {
      const td = join(dir, d);
      const sender = turnSender(commands, id, startedAt(turnDirs[i]), startedAt(d));
      if (sender === "twin") return [];
      if (sender === null && stored !== undefined && startedAt(d) < readableSince.getTime()) return stored === "none" ? [] : [stored];
      const prompt = existsSync(join(td, "prompt.md")) ? readFileSync(join(td, "prompt.md"), "utf8") : null;
      const said = prompt?.replace(APPROVED_LINE, "") ?? "";
      const mark = existsSync(join(td, "touch")) ? readFileSync(join(td, "touch"), "utf8") : null;
      const system = existsSync(join(td, "check")) || existsSync(join(td, "click-check")) || prompt === null || prompt.startsWith(APPROVED);
      if (system && mark === null) return [];
      return [mark === FIX_MARK || (!said.startsWith(ACCEPTED) && sendsBack(said)) ? "fix" : "more"];
    });
    const touch: Touch = touches.includes("fix") ? "fix" : touches.length ? "more" : "none";
    const started = run.startedAt ? new Date(run.startedAt).getTime() : Number.NaN;
    return [{ id, project: run.project ?? null, touch, settled, dropped: existsSync(closed) && readFileSync(closed, "utf8").includes("dropped true"), startedAt: Number.isNaN(started) ? statSync(first).mtimeMs : started, own: isOwn(run) }];
  });
  return { runs, excluded };
}

function turns(since: Date, until: Date) {
  const gates = new Map<string, number>();
  let approvals = 0;
  let clickChecks = 0;
  let unparsed = 0;
  let count = 0;
  let followups = 0;
  const review = { turns: 0, rounds: 0, over: 0, stuck: 0, findings: 0, wrong: 0, tags: new Map<string, number>(), important: new Map<string, number>() };
  if (!existsSync(RUNS)) return { gates, approvals, clickChecks, unparsed, count, followups, review };
  for (const id of readdirSync(RUNS)) {
    const dir = join(RUNS, id);
    if (!existsSync(join(dir, "run.json"))) continue;
    const run = readRun(dir);
    const isolated = run ? run.isolated === true : null;
    const owners = run !== null && !isHarness(run);
    for (const t of readdirSync(dir).filter((d) => d.startsWith("turn-"))) {
      const td = join(dir, t);
      const started = existsSync(join(td, "pid")) ? statSync(join(td, "pid")).mtimeMs : 0;
      if (started < since.getTime() || started >= until.getTime()) continue;
      count++;
      const checked = existsSync(join(td, "click-check")) || existsSync(join(td, "check"));
      if (owners && t !== "turn-1" && !checked) followups++;
      if (checked) clickChecks++;
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
  return { gates, approvals, clickChecks, unparsed, count, followups, review };
}

const untouched = (h: Handed) => `${h.runs ? `${h.untouched}/${h.runs} (${Math.round((100 * h.untouched) / h.runs)}%)` : "-"}${h.waiting ? ` + ยังไม่นับ ${h.waiting}` : ""}`;

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

function week(ex: Exchange[], runs: Outcome[], since: Date, until: Date, turnStats: ReturnType<typeof turns>) {
  const inWeek = ex.filter((e) => e.at >= since && e.at < until);
  const sent = runs.filter((r) => r.startedAt >= since.getTime() && r.startedAt < until.getTime());
  return {
    prompts: inWeek.length,
    goAheads: inWeek.filter(isGoAhead),
    corrections: inWeek.filter(isCorrection),
    chases: inWeek.filter(isChase),
    handed: handed(sent),
    sent: sent.length,
    own: sent.filter((r) => r.own).length,
    turns: turnStats,
  };
}

const byAction = (ds: LedgerDecision[]) => ACTIONS.map((a) => `${ACTION_LABEL[a]} ${ds.filter((d) => d.action === a).length}`).join(" · ");
const replies = (as: { reply: Reply }[]) => REPLIES.map((r) => `${REPLY_LABEL[r]} ${as.filter((a) => a.reply === r).length}`).join(" · ");
const share = (as: { reply: Reply }[]) => {
  const judged = as.filter((a) => a.reply !== "other");
  return judged.length ? `${judged.filter((a) => a.reply === "agreed").length}/${judged.length} (${Math.round((100 * judged.filter((a) => a.reply === "agreed").length) / judged.length)}%)` : "-";
};
const ddmm = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;

const correction = (d: LedgerDecision) => `${d.run}\n${d.correctedAt ?? d.corrected}`;
const corrections = (ds: LedgerDecision[]) => new Set(ds.filter((d) => d.corrected !== null).map(correction)).size;

function overruled(days: Day[], from: string) {
  const recent = days.filter((d) => d.date >= from).flatMap((d) => d.decisions);
  const last = new Map<string, LedgerDecision>();
  for (const d of recent) {
    const held = last.get(correction(d));
    if (d.corrected !== null && (!held || held.at <= d.at)) last.set(correction(d), d);
  }
  return ACTIONS.map((action) => ({ action, made: recent.filter((d) => d.action === action).length, corrected: [...last.values()].filter((d) => d.action === action).length }));
}

function decisionLines(days: Day[], asks: Ask[], since: Date, before: Date, recent: ReturnType<typeof overruled>): string[] {
  const decisions = days.flatMap((d) => d.decisions);
  const inWeek = decisions.filter((d) => new Date(d.at) >= since);
  const prev = decisions.filter((d) => new Date(d.at) >= before && new Date(d.at) < since);
  const recommended = days.flatMap((d) => d.recommended);
  const weekAsks = asks.filter((a) => a.at >= since);
  const weekRecommended = weekAsks.filter((a) => a.recommended);
  const first = days.find((d) => d.decisions.length || d.asks);
  return [
    "## ตัดสินแทน (สั่ง worker เองโดยไม่ได้ถาม)",
    `- 7 วัน: ${inWeek.length} ครั้ง · ${byAction(inWeek)}${prev.length ? ` (สัปดาห์ก่อน ${prev.length})` : ""}`,
    first ? `- ทั้งหมดตั้งแต่ ${ddmm(first.date)}: ${decisions.length} ครั้ง · เจ้าของสั่งแก้ run เดียวกันทีหลัง ${corrections(decisions)} ครั้ง (รายการ: state/audit/decisions.md)` : "- ยังไม่มี",
    `- ${TRUST_DAYS} วัน เจ้าของสั่งแก้ทีหลัง: ${recent.map((r) => `${ACTION_LABEL[r.action]} ${r.corrected}/${r.made}`).join(" · ")}`,
    "",
    "## ถามพร้อมคำแนะนำ แล้วเจ้าของตามไหม",
    `- 7 วัน: ถาม ${weekAsks.length} · มีคำแนะนำ ${weekRecommended.length} (${replies(weekRecommended)}) · ตามที่แนะนำ ${share(weekRecommended)}`,
    `- ทั้งหมด: ถาม ${days.reduce((n, d) => n + d.asks, 0)} · มีคำแนะนำ ${recommended.length} · ตามที่แนะนำ ${share(recommended)} · ${[...ACTIONS, null].map((a) => `${a ? ACTION_LABEL[a] : "อื่นๆ"} ${share(recommended.filter((x) => x.action === a))}`).join(" · ")}`,
    ...weekRecommended.filter((a) => a.reply === "objected").slice(-QUOTES).map((a) => `  - ${hhmm(a.at)} ค้าน "${a.said.slice(0, QUOTE_CHARS)}"`),
  ];
}

function decisionLog(days: Day[]): string {
  const decisions = days.flatMap((d) => d.decisions).toReversed();
  const recommended = days.flatMap((d) => d.recommended).toReversed();
  const cut = (n: number) => (n > LOG_LINES ? [`- … เก่ากว่านี้อีก ${n - LOG_LINES} รายการอยู่ใน state/audit/${LEDGER_FILE}`] : []);
  return [
    `# ตัดสินแทน · ${decisions.length} ครั้ง`,
    "",
    "สั่ง worker เองหลังงานแจ้งว่าเสร็จหรืองานตั้งเวลา โดยไม่มีข้อความเจ้าของมาก่อน · ใหม่สุดก่อน",
    "",
    ...decisions.slice(0, LOG_LINES).map((d) => `- ${hhmm(new Date(d.at))} · ${ACTION_LABEL[d.action]} · ${d.run ?? "-"} · ${CAUSE_LABEL[d.cause]}${d.corrected === null ? "" : d.corrected ? ` · เจ้าของสั่งแก้ทีหลัง: "${d.corrected.slice(0, QUOTE_CHARS)}"` : " · เจ้าของสั่งแก้ทีหลัง"}`),
    ...cut(decisions.length),
    "",
    `## ถามพร้อมคำแนะนำ · ${recommended.length} ครั้ง`,
    "",
    ...recommended.slice(0, LOG_LINES).map((a) => `- ${hhmm(new Date(a.at))} · ${REPLY_LABEL[a.reply]} · ${a.action ? ACTION_LABEL[a.action] : "อื่นๆ"} · "…${a.asked.slice(-80)}" → "${a.said.slice(0, 80)}"`),
    ...cut(recommended.length),
    "",
  ].join("\n");
}

type Change = { key: string; date: string; label: string; detail: string };

function improveRounds(): Change[] {
  const log = Bun.spawnSync(["git", "-C", ROOT, "log", "--grep=^improve:", "--format=%cI%x09%h", "-200"]).stdout.toString().split("\n").filter(Boolean);
  const rounds: { start: number; commits: string[] }[] = [];
  for (const line of log) {
    const [when = "", hash = ""] = line.split("\t");
    const at = new Date(when).getTime();
    const round = rounds.at(-1);
    if (round && (round.start - at <= ROUND_GAP_HOURS * HOUR || dateOf(new Date(round.start)) === dateOf(new Date(at)))) {
      round.start = at;
      round.commits.push(hash);
    } else rounds.push({ start: at, commits: [hash] });
  }
  return rounds.map((r) => {
    const date = dateOf(new Date(r.start));
    return { key: `improve:${date}`, date, label: `improve ${ddmm(date)}`, detail: `commit ${r.commits.join(", ")}` };
  });
}

const percent = (h: Handed) => (h.runs ? `${Math.round((100 * h.untouched) / h.runs)}%` : "-");
const perHundred = (t: { prompts: number; corrections: number }) => (t.prompts ? String(Math.round((100 * t.corrections) / t.prompts)) : "-");

function changeLines(days: Day[], today: string): { lines: string[]; worse: { key: string; title: string }[] } {
  const changes = [...improveRounds(), ...modelChanges(days).map((c) => ({ key: `model:${c.date}`, date: c.date, label: `model ${c.model} ตั้งแต่ ${ddmm(c.date)}`, detail: "" }))]
    .filter((c) => c.date >= shift(today, -CHANGE_SHOW_DAYS))
    .sort((a, b) => a.date.localeCompare(b.date));
  const worse: { key: string; title: string }[] = [];
  const lines = changes.map((c) => {
    const v = verdict(days, c.date, today);
    if (v.kind === "early") return `- ${c.label}: ยังเร็วไป อีก ${v.daysLeft} วันจึงเทียบได้`;
    if (v.word === "worse" && c.date >= shift(today, -(VERDICT_DAYS + BRIEF_VERDICT_DAYS))) worse.push({ key: c.key, title: `หลัง ${c.label} งานที่ส่งแล้วไม่ต้องแตะอีกลดจาก ${percent(v.before.handed)} เป็น ${percent(v.after.handed)} เกินความแกว่งปกติ${c.detail ? ` (${c.detail})` : ""} → พิมพ์ "improve" เพื่อดูว่าจะถอยอะไร` });
    return `- ${c.label}: งานที่ส่งแล้วไม่ต้องแตะอีก ${untouched(v.before.handed)} → ${untouched(v.after.handed)} · ${WORD_LABEL[v.word]} · ถูกแก้ต่อ 100 prompt ${perHundred(v.before)} → ${perHundred(v.after)}${c.detail ? ` · ${c.detail}` : ""}`;
  });
  return { lines: lines.length ? [`## หลังการเปลี่ยนแปลง (${VERDICT_DAYS} วันก่อน เทียบ ${VERDICT_DAYS} วันหลัง)`, ...lines, ""] : [], worse };
}

function projectLines(days: Day[], from: string): string[] {
  const byProject = new Map<string, LedgerRun[]>();
  for (const r of days.filter((d) => d.date >= from).flatMap((d) => d.runs)) byProject.set(r.project ?? NO_PROJECT, [...(byProject.get(r.project ?? NO_PROJECT) ?? []), r]);
  const rows = [...byProject]
    .map(([project, runs]) => ({ project, runs, handed: handed(runs) }))
    .filter((r) => r.handed.runs >= PROJECT_MIN_RUNS)
    .sort((a, b) => a.handed.untouched / a.handed.runs - b.handed.untouched / b.handed.runs || b.handed.runs - a.handed.runs);
  if (!rows.length) return [];
  const rest = rows.slice(PROJECT_LINES);
  return [
    `## ต่อโปรเจกต์ (${TRUST_DAYS} วัน · ไม่ต้องแตะอีกน้อยสุดก่อน · เฉพาะโปรเจกต์ที่นับแล้ว ${PROJECT_MIN_RUNS} งานขึ้นไป)`,
    ...rows.slice(0, PROJECT_LINES).map((r) => `- ${r.project}: ${untouched(r.handed)} · แก้ของผิด ${r.handed.fixed} · เพิ่มโจทย์หรือตอบคำถาม ${r.handed.more} · ทิ้งงาน ${r.handed.dropped}`),
    ...(rest.length ? [`- อีก ${rest.length} โปรเจกต์: ${untouched(handed(rest.flatMap((r) => r.runs)))}`] : []),
    "",
  ];
}

type Item = { key: string; title: string; score: number };

function ruleLines(days: Day[], today: string, name: string): { lines: string[]; items: Item[] } {
  const mode = renderMode();
  const identity = readIdentity();
  const rules = identity.rules;
  const problems = identity.problems.filter((p) => p.startsWith("rules.json"));
  if (!mode && !rules.length && !problems.length) return { lines: [], items: [] };
  const ids = (rs: typeof rules) => `${rs.slice(0, RULE_IDS).map((r) => r.id).join(", ")}${rs.length > RULE_IDS ? ` และอีก ${rs.length - RULE_IDS}` : ""}`;
  const listed = (rs: typeof rules) => (rs.length ? `${rs.length} (${ids(rs)})` : "0");
  const stale = rules.filter((r) => (lastEvidence(r) ?? today) < shift(today, -STALE_RULE_DAYS));
  const undated = rules.filter((r) => lastEvidence(r) === null);
  const forModel = rules.filter((r) => r.about === "model");
  const change = modelChanges(days).findLast((c) => c.date >= shift(today, -BRIEF_VERDICT_DAYS));
  const retest = change ? forModel.filter((r) => (lastEvidence(r) ?? "") < change.date) : [];
  const size = mode ? `${mode.length.toLocaleString()} / ${MODE_MAX_CHARS.toLocaleString()} ตัวอักษร (${Math.round((100 * mode.length) / MODE_MAX_CHARS)}%)` : null;
  return {
    lines: [
      "## กฎและขนาด mode",
      ...(size ? [`- ${name}-mode ที่ทุก session โหลด: ${size}`] : []),
      `- กฎ ${rules.length} ข้อ · ไม่มีหลักฐานใหม่เกิน ${STALE_RULE_DAYS} วัน ${listed(stale)} · ยังไม่มีวันที่ยืนยัน ${listed(undated)}`,
      `- กฎที่มีไว้แก้นิสัยของ model: ${listed(forModel)}${change && retest.length ? ` · model หลักเปลี่ยนเป็น ${change.model} ตั้งแต่ ${ddmm(change.date)} ควรลองใหม่ ${listed(retest)}` : ""}`,
      ...(problems.length ? [`- ⚠ อ่านกฎไม่ได้ จำนวนข้างบนจึงไม่ครบ: ${problems.join(" · ")}`] : []),
      "",
    ],
    items: [
      ...(mode && size && crowded(mode) ? [{ key: "audit:mode-size", title: `${name}-mode ยาว ${size} เกิน ${100 * MODE_CROWDED_SHARE}% ของงบ: improve รอบถัดไปเพิ่มกฎได้เมื่อรวมหรือลบกฎเก่า`, score: 28 }] : []),
      ...(stale.length ? [{ key: "audit:stale-rules", title: `กฎ ${stale.length} ข้อไม่มีหลักฐานใหม่เกิน ${STALE_RULE_DAYS} วัน (state/audit/) → พิมพ์ "improve" เพื่อยืนยันหรือลบ`, score: 25 }] : []),
      ...(change && retest.length ? [{ key: `audit:model-rules:${change.date}`, title: `model หลักเปลี่ยนเป็น ${change.model} ตั้งแต่ ${ddmm(change.date)}: กฎแก้นิสัยของ model ${retest.length} ข้อควรลองใหม่ (state/audit/) → พิมพ์ "improve"`, score: 28 }] : []),
    ],
  };
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
  preserve: [LEDGER_FILE],
  defaultOn: true,
  async run({ now, profile }) {
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
    const before = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY);
    const today = dateOf(now);
    const h = readHistory(TRANSCRIPTS);
    const stored = readLedger(LEDGER);
    const t = turns(since, now);
    const replied = h.seen.some((s) => s.at >= since);
    const commanded = h.commands.some((c) => c.at >= since);
    const blind =
      t.count >= CANARY_TURNS && !replied
        ? `audit อ่านประวัติ session ไม่ได้: 7 วันมี worker ${t.count} turn แต่ไม่พบคำตอบของ ${profile.name} ในประวัติเลย รูปแบบไฟล์ของ Claude Code อาจเปลี่ยน (lib/decisions.ts)`
        : t.followups >= CANARY_TURNS && replied && !commanded
          ? `audit ไม่พบคำสั่ง followup ในประวัติ session เลย ทั้งที่ 7 วันมี turn ต่อ ${t.followups} ครั้ง ตัวเลขตัดสินแทนจะเป็นศูนย์ รูปแบบไฟล์ของ Claude Code อาจเปลี่ยน (lib/decisions.ts)`
          : null;
    const readableSince = blind ? now : transcriptsKeptSince(now);
    const { runs, excluded } = outcomes(h.commands, new Map(stored.flatMap((d) => d.runs).map((r) => [r.id, r])), readableSince);
    const dated = runs.map(({ startedAt, own, ...r }) => ({ ...r, date: dateOf(new Date(startedAt)) }));
    const w = week(h.exchanges, runs, since, now, t);
    const b = week(h.exchanges, runs, before, since, turns(before, since));
    const hasPrev = b.prompts > 0 || b.turns.count > 0;
    const { vs, arrow } = trend(hasPrev);
    const gates = (m: Map<string, number>) => [...m.values()].reduce((a, n) => a + n, 0);
    const gateLine = [...t.gates.entries()].map(([g, n]) => `${g} ${n}`).join(" · ") || "-";
    const quotes = profile.sources.claudeCode;
    const merged = mergeDays(stored, buildDays(h, dated, quotes), readableSince, excluded);
    const days = quotes ? merged : withoutQuotes(merged);
    const trustFrom = shift(today, -TRUST_DAYS);
    const trusted = ACTIONS.flatMap((a) => {
      const asked = days.filter((d) => d.date >= trustFrom).flatMap((d) => d.recommended.filter((x) => x.action === a && x.reply !== "other"));
      const agreed = asked.filter((x) => x.reply === "agreed").length;
      return asked.length >= TRUST_MIN_ASKS && agreed >= TRUST_SHARE * asked.length ? [{ action: a, asked: asked.length, agreed }] : [];
    });
    const recent = overruled(days, trustFrom);
    const doubted = recent.filter((r) => r.corrected >= DOUBT_MIN_CORRECTED && r.corrected >= DOUBT_SHARE * r.made);
    const changes = changeLines(days, today);
    const kept = ruleLines(days, today, profile.name);
    const index = [
      `# ${profile.name} audit · ${WINDOW_DAYS} วันถึง ${now.toLocaleDateString("sv-SE")}`,
      "",
      `prompt ใน ${profile.name} ${w.prompts}${hasPrev ? ` (สัปดาห์ก่อน ${b.prompts})` : ""} · worker ${t.count} turn${hasPrev ? ` (สัปดาห์ก่อน ${b.turns.count})` : ""}`,
      `ตัวชี้วัดหลัก: งานที่ส่งแล้วไม่ต้องแตะอีก ${untouched(w.handed)}${hasPrev ? ` (สัปดาห์ก่อน ${untouched(b.handed)})` : ""} · งานนับเมื่อจบมาแล้ว ${SETTLE_HOURS} ชม. หรือปิดแล้ว · ไม่นับ turn อนุมัติและ turn ตรวจที่ระบบสั่ง`,
      `ที่เหลือ: เจ้าของส่งกลับไปแก้ของผิดอย่างน้อย ${w.handed.fixed}${vs(w.handed.fixed, b.handed.fixed)} · เพิ่มโจทย์หรือตอบคำถาม ${w.handed.more} · ปิดแบบทิ้งงาน ${w.handed.dropped}`,
      `งานที่ส่ง ${w.sent}: ในโปรเจกต์อื่น ${w.sent - w.own} · ของ ${profile.name} เอง ${w.own}`,
      "",
      hasPrev ? "↓ = น้อยลงกว่าสัปดาห์ก่อน (ดีขึ้น) · ↑ = มากขึ้น" : "สัปดาห์ก่อนยังไม่มีข้อมูล ลูกศรจะขึ้นเมื่อมีครบ 2 สัปดาห์",
      "",
      ...changes.lines,
      ...projectLines(days, trustFrom),
      ...decisionLines(days, h.asks, since, before, recent),
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
      ...kept.lines,
    ].join("\n");
    const flagged = w.goAheads.length >= FLAG_GO_AHEADS || w.corrections.length >= FLAG_CORRECTIONS;
    return {
      kind: "ok",
      files: { "index.md": index, "decisions.md": decisionLog(days), [LEDGER_FILE]: serialize(days) },
      brief: "",
      items: [
        ...(flagged
          ? [{ key: "audit:week", project: profile.name, title: `audit 7 วัน: ถามแล้วได้ "ทำ" ${w.goAheads.length}${arrow(w.goAheads.length, b.goAheads.length)} · ถูกแก้ ${w.corrections.length}${arrow(w.corrections.length, b.corrections.length)} · ตามงาน ${w.chases.length}${arrow(w.chases.length, b.chases.length)} (state/audit/) → พิมพ์ "improve"`, score: 30 }]
          : []),
        ...(blind ? [{ key: "audit:blind", project: profile.name, title: blind, score: 40 }] : []),
        ...changes.worse.map((c) => ({ key: `audit:verdict:${c.key}`, project: profile.name, title: c.title, score: 30 })),
        ...doubted.map((d) => ({ key: `audit:doubt:${d.action}`, project: profile.name, title: `${profile.name} ${ACTION_LABEL[d.action]} เอง ${d.made} ครั้งใน ${TRUST_DAYS} วัน เจ้าของสั่งแก้ทีหลัง ${d.corrected} ครั้ง → พิมพ์ "improve" เพื่อพิจารณาลดเป็นถามก่อน`, score: 30 })),
        ...kept.items.map((i) => ({ ...i, project: profile.name })),
        ...trusted.map((t) => ({ key: `audit:trust:${t.action}`, project: profile.name, title: `ถามก่อน${ACTION_LABEL[t.action]} ${t.asked} ครั้งใน ${TRUST_DAYS} วัน ตามที่แนะนำ ${t.agreed} → พิมพ์ "improve" เพื่อเลื่อนเป็นทำแล้วบอก`, score: 28 })),
      ],
    };
  },
});
