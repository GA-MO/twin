import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROFILE_DIR } from "./profile.ts";

export const LAYERS = {
  identity: "ตัวตน",
  tools: "เครื่องมือ",
  work: "งาน",
  life: "นอกงาน",
  collab: "ทำงานกับเขา",
  decisions: "การตัดสินใจ",
} as const;
export type Layer = keyof typeof LAYERS;
const Layer = z.enum(Object.keys(LAYERS) as [Layer, ...Layer[]]);

export const STARTER_TOPICS: Record<Layer, string[]> = {
  identity: ["บทบาท", "ทีมและองค์กร", "วันปกติ", "ภาษาที่ใช้"],
  tools: ["เครื่องและ OS", "อีเมลและปฏิทิน", "แชท", "เอกสารและงาน", "AI ที่ใช้"],
  work: ["ประเภทงาน", "โปรเจกต์และลูกค้า", "งานประจำ", "คนที่ทำงานด้วย"],
  life: ["หาความรู้เรื่องอะไร", "งานอดิเรก", "อ่านหรือติดตามอะไร"],
  collab: ["ให้ guide หรือทำให้เลย", "ละเอียดแค่ไหน", "น้ำเสียง", "เมื่อไหร่ควรถาม"],
  decisions: ["เส้นห้าม", "เกณฑ์ที่ตัดสินเองได้", "ระดับการทำแทนต่อหมวด"],
};

export const LEVELS = {
  observe: "ดูเงียบ ยังไม่เสนอ",
  ask: "ถามก่อนทุกครั้ง",
  draft: "ร่างไว้ให้กดส่ง",
  tell: "ทำแล้วบอก",
  silent: "ทำเงียบ",
} as const;
const Level = z.enum(Object.keys(LEVELS) as [keyof typeof LEVELS, ...(keyof typeof LEVELS)[]]);

const Rule = z.object({
  id: z.string().min(1),
  layer: Layer,
  rule: z.string().min(1),
  why: z.string().min(1),
  source: z.string().min(1),
  quote: z.string().optional(),
  status: z.enum(["stated", "observed"]),
  confirmations: z.number().int().min(0).default(0),
});
const Rules = z.object({ rules: z.array(Rule) });

const RedLine = z.object({ id: z.string().min(1), never: z.string().min(1), why: z.string().min(1), source: z.string().min(1) });
const RedLines = z.object({ redLines: z.array(RedLine) });

const Category = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: Level,
  why: z.string().min(1),
  source: z.string().min(1),
  criteria: z.array(z.string()).default([]),
  ceiling: Level.optional(),
  ledger: z.object({ predicted: z.number().int().min(0), correct: z.number().int().min(0) }).default({ predicted: 0, correct: 0 }),
});
const Autonomy = z.object({ categories: z.array(Category) });

const CoverageRow = z.object({
  layer: Layer,
  topic: z.string().min(1),
  confidence: z.number().int().min(0).max(3),
  evidence: z.number().int().min(0),
  lastAsked: z.iso.date().nullable(),
});
export type CoverageRow = z.infer<typeof CoverageRow>;

export const FILES = {
  rules: join(PROFILE_DIR, "rules.json"),
  redLines: join(PROFILE_DIR, "red-lines.json"),
  autonomy: join(PROFILE_DIR, "autonomy.json"),
  coverage: join(PROFILE_DIR, "coverage.md"),
};

export type Identity = {
  rules: z.infer<typeof Rule>[];
  redLines: z.infer<typeof RedLine>[];
  autonomy: z.infer<typeof Category>[];
  coverage: CoverageRow[];
  problems: string[];
};

const LAYER_BY_LABEL = new Map(Object.entries(LAYERS).map(([k, v]) => [v, k as Layer]));

const layerOf = (cell: string): Layer | undefined => {
  const label = cell.replaceAll("*", "").trim();
  return LAYER_BY_LABEL.get(label as (typeof LAYERS)[Layer]) ?? (Object.hasOwn(LAYERS, label) ? (label as Layer) : undefined);
};
const count = (cell: string) => (/^\d+$/.test(cell) ? Number(cell) : Number.NaN);

export function parseCoverage(text: string): { rows: CoverageRow[]; problems: string[] } {
  const rows: CoverageRow[] = [];
  const problems: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim())) {
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c)) || /^(ชั้น|layer)$/i.test(cells[0] ?? "")) continue;
    const layer = cells.length === 5 ? layerOf(cells[0]!) : undefined;
    const row = CoverageRow.safeParse({
      layer,
      topic: cells[1],
      confidence: count(cells[2] ?? ""),
      evidence: count(cells[3] ?? ""),
      lastAsked: cells[4] === "-" ? null : cells[4],
    });
    if (row.success) rows.push(row.data);
    else problems.push(`coverage.md แถว "${line.slice(0, 60)}" อ่านไม่ได้: ต้องมี 5 ช่อง ชั้น | หัวข้อ | มั่นใจ 0-3 | หลักฐาน | ถามล่าสุด (YYYY-MM-DD หรือ -)`);
  }
  return { rows, problems };
}

export function renderCoverage(rows: CoverageRow[]): string {
  return [
    "# รู้จักเจ้าของแค่ไหน",
    "",
    "มั่นใจ: 0 ยังไม่รู้ · 1 เดา · 2 ได้ยินจากเจ้าของ · 3 ได้ยินและเห็นจากหลักฐานตรงกัน. หลักฐาน: จำนวนคำตอบหรือ quote ที่รองรับ.",
    "",
    "| ชั้น | หัวข้อ | มั่นใจ | หลักฐาน | ถามล่าสุด |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${LAYERS[r.layer]} | ${r.topic} | ${r.confidence} | ${r.evidence} | ${r.lastAsked ?? "-"} |`),
    "",
  ].join("\n");
}

export const starterCoverage = () =>
  renderCoverage(Object.entries(STARTER_TOPICS).flatMap(([layer, topics]) => topics.map((topic) => ({ layer: layer as Layer, topic, confidence: 0, evidence: 0, lastAsked: null }))));

function readJson<T>(file: string, schema: z.ZodType<T>, problems: string[]): T | null {
  if (!existsSync(file)) return null;
  try {
    const r = schema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (r.success) return r.data;
    problems.push(`${file.slice(PROFILE_DIR.length + 1)}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  } catch (e) {
    problems.push(`${file.slice(PROFILE_DIR.length + 1)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

export function readIdentity(): Identity {
  const problems: string[] = [];
  const coverage = (() => {
    try {
      return existsSync(FILES.coverage) ? parseCoverage(readFileSync(FILES.coverage, "utf8")) : { rows: [], problems: [] };
    } catch (e) {
      return { rows: [], problems: [`coverage.md: ${e instanceof Error ? e.message : String(e)}`] };
    }
  })();
  return {
    rules: readJson(FILES.rules, Rules, problems)?.rules ?? [],
    redLines: readJson(FILES.redLines, RedLines, problems)?.redLines ?? [],
    autonomy: readJson(FILES.autonomy, Autonomy, problems)?.categories ?? [],
    coverage: coverage.rows,
    problems: [...problems, ...coverage.problems],
  };
}

export function renderIdentity(id: Identity): string {
  const out: string[] = [];
  if (id.redLines.length) out.push("## เส้นห้ามข้าม", "", ...id.redLines.map((r) => `- ห้าม${/^[A-Za-z0-9]/.test(r.never) ? " " : ""}${r.never} เพราะ ${r.why} (${r.source})`), "");
  if (id.autonomy.length)
    out.push(
      "## ระดับการทำแทน",
      "",
      "| หมวด | ระดับ | เกณฑ์ | ทำไม |",
      "|---|---|---|---|",
      ...id.autonomy.map((c) => `| ${c.name} | ${LEVELS[c.level]}${c.ceiling ? ` (สูงสุด: ${LEVELS[c.ceiling]})` : ""} | ${c.criteria.join("; ") || "-"} | ${c.why} |`),
      "",
      `ระดับ: ${Object.values(LEVELS).join(" → ")}. หมวดที่ไม่อยู่ในตาราง: ถามก่อนทุกครั้ง. เลื่อนขึ้นเมื่อเจ้าของบอกเท่านั้น; ทำผิดเรื่องใหญ่ในหมวดไหน ลดหมวดนั้นลงหนึ่งระดับแล้วบอกเจ้าของ. เส้นห้ามชนะทุกระดับ.`,
      "",
    );
  if (id.rules.length) {
    out.push("## กฎ", "");
    for (const [layer, label] of Object.entries(LAYERS)) {
      const rules = id.rules.filter((r) => r.layer === layer);
      if (!rules.length) continue;
      out.push(`### ${label}`, ...rules.map((r) => `- ${r.rule} เพราะ ${r.why} (${r.source}${r.status === "observed" ? ", เห็นจากหลักฐาน" : ""})`), "");
    }
  }
  if (id.problems.length) out.push(`⚠ ไฟล์ตัวตนบางไฟล์อ่านไม่ได้ ให้แก้ก่อนเชื่อส่วนนั้น: ${id.problems.join(" · ")}`);
  return out.join("\n").trim();
}

export function todaysQuestions(rows: CoverageRow[], today: string, perDay = 3): CoverageRow[] {
  const asked = rows.filter((r) => r.lastAsked === today).length;
  const open = rows.filter((r) => r.lastAsked !== today && r.confidence < 3);
  const depth = (layer: Layer) => {
    const inLayer = rows.filter((r) => r.layer === layer);
    return inLayer.reduce((s, r) => s + r.confidence, 0) / Math.max(inLayer.length, 1);
  };
  const ranked = [...open].sort((a, b) => depth(a.layer) - depth(b.layer) || a.confidence - b.confidence || a.evidence - b.evidence);
  const picked: CoverageRow[] = [];
  for (const r of ranked) {
    if (picked.length >= perDay - asked) break;
    if (!picked.some((p) => p.layer === r.layer)) picked.push(r);
  }
  return picked;
}
