import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { tr } from "./lang.ts";

export type SkillSource = "engine" | "profile" | "mode";
export type Skill = { file: string; folder: string; source: SkillSource; name: string; description: string; invocable: boolean; yaml: boolean; body: string };
export type Finding = { level: "error" | "warn"; file: string; rule: string; detail: string };

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const BODY_MAX_LINES = 500;
const REF_TOC_LINES = 100;
const TOC_WINDOW = 30;
const OVERLAP_WARN = 0.3;
const SHARED_SHOWN = 8;
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const XML = /<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?>/;
const LINK = /\]\(([^)\s]+)\)/g;
const STOP = new Set("the and for use when with from into that this them they their its your you are was has have not but all any each what which who how one two".split(" "));

const Front = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  "disable-model-invocation": z.boolean().optional(),
});

type Parsed = { ok: true; skill: Skill } | { ok: false; finding: Finding };

const shown = (root: string, file: string) => relative(root, file).split(sep).join("/");

function lenient(block: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][\w-]*):[ \t]*(.*)$/);
    if (!m) continue;
    const raw = m[2]!.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    out[m[1]!] = raw === "true" ? true : raw === "false" ? false : raw;
  }
  return out;
}

function strict(block: string): Record<string, unknown> | null {
  try {
    const v: unknown = Bun.YAML.parse(block);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;
  } catch {
    return null;
  }
}

function parse(root: string, file: string, folder: string, source: SkillSource): Parsed {
  const where = shown(root, file);
  const fail = (detail: string): Parsed => ({ ok: false, finding: { level: "error", file: where, rule: "frontmatter", detail } });
  const text = readFileSync(file, "utf8");
  const m = text.match(FRONT);
  if (!m) return fail(tr("ไม่มี frontmatter (--- name, description --- ที่บรรทัดแรก)", "no frontmatter (--- name, description --- at the first line)"));
  const exact = strict(m[1]!);
  const front = Front.safeParse(exact ?? lenient(m[1]!));
  if (!front.success) return fail(tr(`frontmatter ผิดชนิด: ${front.error.issues.map((i) => i.path.join(".")).join(", ")}`, `frontmatter has the wrong type: ${front.error.issues.map((i) => i.path.join(".")).join(", ")}`));
  const f = front.data;
  return {
    ok: true,
    skill: { file, folder, source, name: f.name ?? "", description: f.description ?? "", invocable: f["disable-model-invocation"] !== true, yaml: exact !== null, body: text.slice(m[0].length) },
  };
}

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

export function readSkills(root: string, modeName: string | null): { skills: Skill[]; findings: Finding[] } {
  const skills: Skill[] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (file: string, folder: string, source: SkillSource) => {
    const real = realpathSync(file);
    if (seen.has(real)) return;
    seen.add(real);
    const r = parse(root, file, folder, source);
    if (r.ok) skills.push(r.skill);
    else findings.push(r.finding);
  };
  const mode = join(root, "profile/mode/SKILL.md");
  if (modeName && existsSync(mode)) add(mode, `${modeName}-mode`, "mode");
  for (const [dir, source] of [[join(root, "profile/skills"), "profile"], [join(root, ".claude/skills"), "engine"]] as const) {
    if (!existsSync(dir)) continue;
    for (const folder of readdirSync(dir).sort()) {
      const at = join(dir, folder);
      if (!isDir(at)) continue;
      const file = join(at, "SKILL.md");
      if (existsSync(file)) add(file, folder, source);
      else findings.push({ level: "error", file: shown(root, at), rule: "frontmatter", detail: tr("โฟลเดอร์ skill ไม่มี SKILL.md", "skill folder has no SKILL.md") });
    }
  }
  return { skills, findings };
}

type Rule = { id: string; level(s: Skill): Finding["level"]; check(s: Skill): string | null };
const always = (level: Finding["level"]) => () => level;

const RULES: Rule[] = [
  {
    id: "yaml",
    level: always("warn"),
    check: (s) => (s.yaml ? null : tr("frontmatter ไม่ใช่ YAML ที่ถูกต้อง Claude Code อ่านได้ แต่ parser ที่เคร่งอ่านไม่ได้: ใส่ค่าที่มี \": \" ไว้ในเครื่องหมายคำพูด", "frontmatter is not valid YAML. Claude Code reads it, a strict parser does not: quote values that contain \": \"")),
  },
  {
    id: "name",
    level: always("error"),
    check: (s) =>
      !s.name
        ? tr("ไม่มี name", "name is missing")
        : !/^[a-z0-9-]+$/.test(s.name)
          ? tr(`name "${s.name}" ใช้ได้แค่ a-z 0-9 -`, `name "${s.name}" may use only a-z 0-9 -`)
          : s.name.length > NAME_MAX
            ? tr(`name ยาว ${s.name.length} ตัว เกิน ${NAME_MAX}`, `name is ${s.name.length} characters, over ${NAME_MAX}`)
            : /anthropic|claude/.test(s.name)
              ? tr(`name "${s.name}" มีคำสงวน anthropic หรือ claude`, `name "${s.name}" contains the reserved word anthropic or claude`)
              : null,
  },
  {
    id: "name-folder",
    level: always("error"),
    check: (s) => (s.name && s.name !== s.folder ? tr(`name "${s.name}" ไม่ตรงกับชื่อที่ลิงก์ "${s.folder}"`, `name "${s.name}" does not match its link name "${s.folder}"`) : null),
  },
  {
    id: "description",
    level: (s) => (s.invocable ? "error" : "warn"),
    check: (s) =>
      !s.description.trim()
        ? tr("ไม่มี description: Claude ใช้ช่องนี้ช่องเดียวเลือกว่าจะเรียก skill ไหน", "description is missing: it is the only thing Claude reads to pick a skill")
        : s.description.length > DESCRIPTION_MAX
          ? tr(`description ยาว ${s.description.length} ตัว เกิน ${DESCRIPTION_MAX}`, `description is ${s.description.length} characters, over ${DESCRIPTION_MAX}`)
          : XML.test(s.description)
            ? tr(`description มี tag แบบ XML "${s.description.match(XML)![0]}"`, `description contains an XML-like tag "${s.description.match(XML)![0]}"`)
            : null,
  },
  {
    id: "body-lines",
    level: always("error"),
    check: (s) => {
      const lines = s.body.split("\n").length;
      return lines > BODY_MAX_LINES ? tr(`เนื้อ SKILL.md ยาว ${lines} บรรทัด เกิน ${BODY_MAX_LINES}: แยกรายละเอียดไปไฟล์อ้างอิง`, `SKILL.md body is ${lines} lines, over ${BODY_MAX_LINES}: move detail into reference files`) : null;
    },
  },
];

const localLinks = (text: string, from: string, within: string) =>
  [...text.matchAll(LINK)]
    .map((m) => m[1]!.split("#")[0]!)
    .filter((t) => t && !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith("/"))
    .map((t) => resolve(dirname(from), decodeURIComponent(t)))
    .filter((p) => p.startsWith(within + sep));

const hasToc = (text: string) => {
  const head = text.split("\n").slice(0, TOC_WINDOW).join("\n");
  return /^#+\s*(table of )?contents\b|^#+\s*สารบัญ/im.test(head) || (head.match(/\]\(#/g)?.length ?? 0) >= 3;
};

function references(root: string, s: Skill): Finding[] {
  const dir = dirname(s.file);
  const out: Finding[] = [];
  const at = (rule: string, level: Finding["level"], detail: string) => out.push({ level, file: shown(root, s.file), rule, detail });
  for (const ref of new Set(localLinks(s.body, s.file, dir))) {
    const name = shown(dir, ref);
    if (!existsSync(ref)) {
      at("reference", "error", tr(`ลิงก์ไปไฟล์ที่ไม่มี: ${name}`, `links to a missing file: ${name}`));
      continue;
    }
    if (!ref.endsWith(".md")) continue;
    const text = readFileSync(ref, "utf8");
    const lines = text.split("\n").length;
    if (lines > REF_TOC_LINES && !hasToc(text)) at("reference-toc", "warn", tr(`${name} ยาว ${lines} บรรทัดแต่ไม่มีสารบัญด้านบน: Claude อาจอ่านแค่ต้นไฟล์`, `${name} is ${lines} lines with no table of contents at the top: Claude may read only its head`));
    const nested = localLinks(text, ref, dir).filter((p) => p.endsWith(".md") && p !== ref && existsSync(p));
    if (nested.length) at("reference-depth", "warn", tr(`${name} ลิงก์ต่อไป ${nested.map((p) => shown(dir, p)).join(", ")}: ไฟล์อ้างอิงควรลึกชั้นเดียวจาก SKILL.md`, `${name} links on to ${nested.map((p) => shown(dir, p)).join(", ")}: references should be one level deep from SKILL.md`));
  }
  return out;
}

const words = (text: string) => new Set((text.toLowerCase().match(/[a-z][a-z0-9-]{2,}|[฀-๿]+/g) ?? []).filter((w) => !STOP.has(w)));

export function overlaps(skills: Skill[]): { a: Skill; b: Skill; score: number; shared: string[] }[] {
  const live = skills.filter((s) => s.invocable && s.description);
  const bags = live.map((s) => words(s.description));
  const out: { a: Skill; b: Skill; score: number; shared: string[] }[] = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const shared = [...bags[i]!].filter((w) => bags[j]!.has(w));
      const score = shared.length / (bags[i]!.size + bags[j]!.size - shared.length || 1);
      if (score >= OVERLAP_WARN) out.push({ a: live[i]!, b: live[j]!, score, shared });
    }
  return out.sort((x, y) => y.score - x.score);
}

export function checkSkills(root: string, modeName: string | null): { skills: Skill[]; findings: Finding[] } {
  const { skills, findings } = readSkills(root, modeName);
  for (const s of skills) {
    for (const rule of RULES) {
      const detail = rule.check(s);
      if (detail) findings.push({ level: rule.level(s), file: shown(root, s.file), rule: rule.id, detail });
    }
    findings.push(...references(root, s));
  }
  for (const o of overlaps(skills))
    findings.push({
      level: "warn",
      file: shown(root, o.a.file),
      rule: "overlap",
      detail: tr(
        `description ทับกับ ${o.b.name} (${shown(root, o.b.file)}) ${Math.round(o.score * 100)}%: ${o.shared.slice(0, SHARED_SHOWN).join(", ")} Claude อาจเลือกผิดตัว`,
        `description overlaps ${o.b.name} (${shown(root, o.b.file)}) ${Math.round(o.score * 100)}%: ${o.shared.slice(0, SHARED_SHOWN).join(", ")}. Claude may pick the wrong one`,
      ),
    });
  const order = (f: Finding) => `${f.level === "error" ? 0 : 1} ${f.file} ${f.rule}`;
  return { skills, findings: findings.sort((x, y) => (order(x) < order(y) ? -1 : order(x) > order(y) ? 1 : 0)) };
}

export function renderFindings(skills: Skill[], findings: Finding[]): string {
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  const line = (f: Finding) => `${f.level === "error" ? "✗" : "⚠"} ${f.file} · ${f.rule}: ${f.detail}`;
  return [tr(`skill ${skills.length} ตัว · ผิดกฎ ${errors.length} · เตือน ${warns.length}`, `${skills.length} skills · ${errors.length} errors · ${warns.length} warnings`), ...errors.map(line), ...warns.map(line)].join("\n");
}
