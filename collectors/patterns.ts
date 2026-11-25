import { $ } from "bun";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector, type AttentionItem } from "../lib/collector.ts";
import { ROOT } from "../lib/profile.ts";
import { checkSkills, overlaps, type Skill } from "../lib/skills.ts";
import { fire, pool } from "../lib/triggers.ts";
import { DECLINED_FILE, PROPOSALS_FILE, readDeclined, type Declined } from "../lib/patterns.ts";

const HISTORY = join(ROOT, "state/history/messages.jsonl");
const DAYS = 30;
const DAY = 86_400_000;
const MIN_MESSAGES = 3;
const MIN_DAYS = 2;
const MIN_CHARS = 12;
const CLIP = 300;
const SHOWN = 3;
const QUOTES = 3;
const CLUSTER_MODEL = "sonnet";
const TRIGGER_MODEL = "opus";
const PARALLEL = 3;
const ROUTERS = new Set(["dispatch"]);
const SCORE = 20;

const Message = z.object({ at: z.string(), source: z.string(), where: z.string(), text: z.string() });
export type Message = z.infer<typeof Message>;
const Group = z.object({ title: z.string().trim().min(1), kind: z.enum(["skill", "command"]), project: z.string().nullable(), ids: z.array(z.string()), example: z.string(), steps: z.string(), why: z.string() });
export type Group = z.infer<typeof Group>;
const Answer = z.object({ groups: z.array(Group) });
const ClaudeOut = z.object({ is_error: z.boolean(), structured_output: z.unknown() });

export type Repeat = { title: string; as: "skill" | "command"; count: number; days: number; project: string | null; quotes: string[]; example: string; steps: string; why: string };
export type Proposal =
  | ({ kind: "new"; key: string; fired: string | null } & Repeat)
  | { kind: "merge"; key: string; a: string; b: string; score: number }
  | { kind: "unused"; key: string; skill: string; file: string };

const ACK = /^(ทำ|เอา|ลุย|ได้|ใช่|ไม่|โอเค)|^(ok|yes|no|go)\b/i;

export function ownerMessages(lines: string[], now: Date): (Message & { id: string })[] {
  const since = now.getTime() - DAYS * DAY;
  const out: (Message & { id: string })[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const m = Message.safeParse(json);
    if (!m.success || m.data.source === "git") continue;
    const at = Date.parse(m.data.at);
    const text = m.data.text.replace(/\s+/g, " ").trim();
    if (Number.isNaN(at) || at < since || at > now.getTime() + DAY || text.length < MIN_CHARS || /^[<\/]/.test(text) || (ACK.test(text) && text.length < 2 * MIN_CHARS)) continue;
    out.push({ ...m.data, text: text.slice(0, CLIP), id: `m${out.length}` });
  }
  return out;
}

export function repeats(groups: Group[], messages: (Message & { id: string })[], projects: Set<string>): Repeat[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  return groups.flatMap((g) => {
    const hits = [...new Set(g.ids)].flatMap((id) => byId.get(id) ?? []);
    const days = new Set(hits.map((m) => m.at.slice(0, 10))).size;
    if (hits.length < MIN_MESSAGES || days < MIN_DAYS) return [];
    const example = byId.get(g.example) && g.ids.includes(g.example) ? byId.get(g.example)! : hits.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    return [{ title: g.title, as: g.kind, count: hits.length, days, project: g.project && projects.has(g.project) ? g.project : null, quotes: hits.slice(0, QUOTES).map((m) => m.text), example: example.text, steps: g.steps.trim(), why: g.why.trim() }];
  });
}

export const covers = (fired: string | null) => fired !== null && !fired.includes(":") && !ROUTERS.has(fired);

const keyOf = (kind: string, text: string) => `${kind}:${createHash("sha256").update(text).digest("hex").slice(0, 10)}`;

export function skillUses(dir: string, since: number): Map<string, number> {
  const uses = new Map<string, number>();
  const add = (name: string) => uses.set(name, (uses.get(name) ?? 0) + 1);
  if (!existsSync(dir)) return uses;
  for (const project of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const full = join(dir, project.name);
    for (const f of readdirSync(full).filter((f) => f.endsWith(".jsonl"))) {
      const file = join(full, f);
      if (statSync(file).mtimeMs < since) continue;
      for (const raw of readFileSync(file, "utf8").split("\n")) {
        if (!raw.includes('"name":"Skill"') && !raw.includes("command-name>")) continue;
        for (const m of raw.matchAll(/"name":"Skill","input":\{"skill":"([^"]+)"/g)) add(m[1]!);
        for (const m of raw.matchAll(/<command-name>\/?([\w:-]+)<\/command-name>/g)) add(m[1]!);
      }
    }
  }
  return uses;
}

export function unused(skills: Skill[], uses: Map<string, number>, since: number): Skill[] {
  return skills.filter((s) => s.invocable && s.source !== "mode" && !uses.get(s.name) && statSync(s.file).birthtimeMs < since);
}

export function describe(p: Proposal): string {
  if (p.kind === "new") return `งาน "${p.title}" สั่งซ้ำ ${p.count} ครั้งใน ${p.days} วัน${p.project ? ` (${p.project})` : ""} ยังไม่มี skill รับ: ทำเป็น${p.as === "skill" ? " skill " : "คำสั่ง"}ไหม`;
  if (p.kind === "merge") return `skill ${p.a} กับ ${p.b} description ทับกัน ${Math.round(p.score * 100)}%: รวมเป็นตัวเดียวไหม`;
  return `skill ${p.skill} ไม่ถูกเรียกเลยใน ${DAYS} วัน: ลบหรือรวมกับตัวอื่นไหม`;
}

function prompt(messages: (Message & { id: string })[], skills: Skill[], declined: Declined, agent: string, projects: Set<string>): string {
  return `Below are the owner's own messages to their AI agent, ${agent}, over the last ${DAYS} days (mostly Thai). The owner usually types in ${agent}'s own repo and ${agent} sends the work on to a project, so the [project] tag is often ${agent}. Find work the owner asks for again and again that would go the same way each time, so it could become a skill (a written procedure the agent follows, when the work needs judgment) or a command (a fixed script, when it does not).

Group only:
- the same kind of multi-step task, asked in at least ${MIN_MESSAGES} messages on at least ${MIN_DAYS} different days
- something the agent does (record, deploy, write up, check, bill, summarise), not a question, a correction, a preference, an approval, or a reply inside an ongoing task

Do not group work these skills already do:
${skills.filter((s) => s.invocable).map((s) => `- ${s.name}: ${s.description}`).join("\n") || "(none)"}

The owner already said no to these, so do not return them again:
${declined.map((d) => `- ${d.title}`).join("\n") || "(none)"}

For each group: title (Thai, one line naming the task), kind, project (when the task is about one project, its name exactly as in this list, else null: ${[...projects].sort().join(", ") || "(none)"}), ids (every message id in the group), example (the id of the message that states the task most fully), steps (Thai: what the agent does each time, in order), why (Thai: why a skill or command saves the owner work). Return no group rather than a weak one.

Messages:
${messages.map((m) => `${m.id} ${m.at.slice(0, 10)} [${m.where}] ${m.text}`).join("\n")}`;
}

async function cluster(text: string): Promise<Group[]> {
  const { $schema: _, ...json } = z.toJSONSchema(Answer);
  const cwd = join(tmpdir(), "twin-patterns");
  mkdirSync(cwd, { recursive: true });
  const claude = Bun.which("claude") ?? "claude";
  const r = await $`${claude} -p --safe-mode --no-session-persistence --tools "" --model ${CLUSTER_MODEL} --output-format json --json-schema ${JSON.stringify(json)} < ${new Response(text)}`.cwd(cwd).quiet().nothrow();
  if (r.exitCode !== 0) throw new Error(`claude -p exit ${r.exitCode}: ${(r.stderr.toString() || r.stdout.toString()).trim().split("\n")[0]}`);
  const out = ClaudeOut.parse(JSON.parse(r.stdout.toString()));
  if (out.is_error) throw new Error("claude -p ตอบ error");
  return Answer.parse(out.structured_output).groups;
}

function render(shown: Proposal[], covered: { repeat: Repeat; fired: string }[], now: Date): string {
  const block = (p: Proposal, i: number) => {
    const head = `## ${i + 1}. ${describe(p)}`;
    if (p.kind !== "new") return head;
    return [head, `- ทำซ้ำทุกครั้ง: ${p.steps}`, `- ทำไมคุ้ม: ${p.why}`, `- ตอนนี้ประโยคนี้เรียก: ${p.fired ?? "ไม่เรียก skill"}`, ...p.quotes.map((q) => `  - "${q}"`)].join("\n");
  };
  return [
    `# งานที่สั่งซ้ำ · ${now.toLocaleDateString("sv-SE")}`,
    "",
    `จากข้อความที่เจ้าของพิมพ์เอง ${DAYS} วัน งานที่ซ้ำอย่างน้อย ${MIN_MESSAGES} ครั้งใน ${MIN_DAYS} วันขึ้นไป และ skill ที่ทับกันหรือไม่มีใครเรียก ตอบ "ไม่เอาข้อ n" แล้ว gamo จะรัน bun twin.ts patterns no <n>`,
    "",
    ...(shown.length ? shown.map(block) : ["ไม่มีข้อเสนอรอบนี้"]),
    ...(covered.length ? ["", "## ซ้ำแต่มี skill รับอยู่แล้ว หรือตรวจไม่ได้ (ไม่เสนอ)", ...covered.map((c) => `- ${c.repeat.title} (${c.repeat.count} ครั้ง): เรียก ${c.fired}`)] : []),
    "",
  ].join("\n");
}

export default defineCollector({
  title: "งานที่สั่งซ้ำ",
  order: 93,
  everyMinutes: 7 * 24 * 60,
  timeoutSeconds: 1200,
  keep: "snapshot",
  preserve: [DECLINED_FILE],
  defaultOn: true,
  requires: ["claude", "consent"],
  async run({ now, profile }) {
    if (!existsSync(HISTORY)) return { kind: "off", why: "ยังไม่มีประวัติข้อความ: bun twin.ts sync history" };
    const messages = ownerMessages(readFileSync(HISTORY, "utf8").split("\n"), now);
    const { skills } = checkSkills(ROOT, profile.name);
    const declined = readDeclined();
    const no = new Set(declined.map((d) => d.key));
    const projects = new Set(profile.devRoot && existsSync(profile.devRoot) ? readdirSync(profile.devRoot).filter((d) => !d.startsWith(".")) : []);
    const groups = messages.length >= MIN_MESSAGES ? await cluster(prompt(messages, skills, declined, profile.name, projects)) : [];
    const found = repeats(groups, messages, projects);
    const fired = await pool(found.map((r) => () => fire(r.example, TRIGGER_MODEL)), PARALLEL);
    const covered: { repeat: Repeat; fired: string }[] = [];
    const fresh: (Proposal & { kind: "new" })[] = [];
    found.forEach((r, i) => {
      const f = fired[i]!;
      if ("error" in f) covered.push({ repeat: r, fired: `ตรวจไม่ได้ (${f.error}) รอบหน้าลองใหม่` });
      else if (covers(f.skill)) covered.push({ repeat: r, fired: f.skill! });
      else fresh.push({ kind: "new", key: keyOf("new", r.title), fired: f.skill, ...r });
    });
    const merges: Proposal[] = overlaps(skills).map((o) => ({ kind: "merge", key: `merge:${[o.a.name, o.b.name].sort().join("+")}`, a: o.a.name, b: o.b.name, score: o.score }));
    const since = now.getTime() - DAYS * DAY;
    const idle: Proposal[] = profile.sources.claudeCode ? unused(skills, skillUses(profile.sources.claudeCodeDir, since), since).map((s) => ({ kind: "unused", key: `unused:${s.name}`, skill: s.name, file: s.file })) : [];
    const all = [...fresh.sort((a, b) => b.count - a.count), ...merges, ...idle].filter((p) => !no.has(p.key));
    const shown = all.slice(0, SHOWN);
    const items: AttentionItem[] = shown.map((p) => ({ key: `patterns:${p.key}`, title: `${describe(p)} (state/patterns/)`, score: SCORE }));
    return {
      kind: "ok",
      files: { "index.md": render(all, covered, now), [PROPOSALS_FILE]: JSON.stringify(all.map((p) => ({ ...p, title: describe(p) })), null, 2) },
      brief: shown.map((p, i) => `- ${i + 1}. ${describe(p)}`).join("\n") + (all.length > SHOWN ? `\n- อีก ${all.length - SHOWN} ข้อใน state/patterns/` : ""),
      items,
    };
  },
});
