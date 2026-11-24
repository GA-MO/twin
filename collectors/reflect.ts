import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import { readIdentity, type Rule } from "../lib/identity.ts";
import { dateOf, shift } from "../lib/ledger.ts";
import { clip, Miss, MISS_DAYS, MISSES_FILE, readJsonl, Tag, TAGS_FILE } from "../lib/misses.ts";
import { ROOT } from "../lib/profile.ts";
import { VERIFIER_BLOCKS } from "../lib/verify.ts";

const MODEL = "sonnet";
const DIR = join(ROOT, "state/reflect");
const PROPOSALS_FILE = "proposals.json";
const KEEP_DAYS = 180;
const COUNT_DAYS = 30;
const EFFECT_DAYS = 14;
const MIN_GROUP = 2;
const MAX_PROPOSALS = 5;
const UNTAGGED = "untagged";
const SETTLE_DAYS = 2;
const DAY = 86_400_000;
const TITLES_SHOWN = 2;
const QUOTES = 3;
const QUOTE_CHARS = 140;
const ROUTES = ["rule", "mode", "skill", "contract", "collector", "engine", "project"] as const;
const LADDER = ["structure", "check", "test", "verifier", "prose"] as const;
const LEVEL_LABEL: Record<(typeof LADDER)[number] | "unrated", string> = { unrated: "ยังไม่ระบุ (ร่างก่อนมีบันได)", structure: "โครงสร้าง (ทำผิดไม่ได้)", check: "ตัวตรวจใน engine หรือ hook", test: "test", verifier: "ผู้ตรวจอิสระตาม checklist", prose: "ข้อความ (ไม่มีอะไรบังคับ)" };
const unenforced = (r: Rule | undefined) => {
  const by = r?.enforced_by?.trim() ?? "";
  return !by || /^(none|-|ไม่มี)$/i.test(by) || (/^verifier\b/i.test(by) && !VERIFIER_BLOCKS);
};
const ROUTE_LABEL: Record<(typeof ROUTES)[number], string> = { rule: "rules.json", mode: "mode prose", skill: "skill", contract: "worker contract", collector: "collector/brief", engine: "engine (lib, hook, test)", project: "CLAUDE.md ของโปรเจกต์" };

const Proposal = z.object({ title: z.string().min(1), keys: z.array(z.string()), rule: z.string().nullable(), route: z.enum(ROUTES), level: z.enum(LADDER), check: z.string(), change: z.string().min(1) });
type Proposal = z.infer<typeof Proposal>;
const StoredProposal = Proposal.extend({ level: z.union([Proposal.shape.level, z.literal("unrated")]).default("unrated"), check: Proposal.shape.check.default("") });
type StoredProposal = z.infer<typeof StoredProposal>;
const Stored = z.object({ at: z.iso.datetime(), handled: z.iso.datetime().nullable(), basedOn: z.array(z.string()), proposals: z.array(StoredProposal) });

const Answer = z.object({
  tags: z.array(z.object({ key: z.string(), rule: z.string().nullable(), cause: z.string(), agentFault: z.boolean() })),
  proposals: z.array(Proposal),
});
const ClaudeOut = z.object({ is_error: z.boolean(), structured_output: z.unknown() });

function readStored(): z.infer<typeof Stored> | null {
  const path = join(DIR, PROPOSALS_FILE);
  if (!existsSync(path)) return null;
  try {
    return Stored.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

function prompt(misses: Miss[], rules: Rule[], known: Map<string, Tag>, owner: string): string {
  const causes = [...new Set([...known.values()].map((t) => t.cause))];
  return `You review the mistakes of ${owner}'s AI agent so it can get better. Below are the times in the last two weeks the owner sent a delegated task back to be fixed (sent-back) or corrected the agent in chat (correction). The owner writes Thai.

For every miss, return a tag:
- agentFault: true only when the agent could have avoided it: it broke one of the rules below, ignored the brief or the design it was given, guessed instead of checking, or handed over work it had not checked. false when the owner changed their mind, added new scope, or gave taste feedback the agent could not have known.
- rule: the id of the rule below that the agent broke, or null when no rule covers it.
- cause: a short English kebab-case label of the root cause, not the symptom. Reuse a label from this list when it fits: ${causes.join(", ") || "(none yet)"}.

Then propose changes, only for a root cause shared by ${MIN_GROUP} or more misses with agentFault true:
- title: one Thai line naming the mistake pattern.
- keys: the keys of the misses it covers.
- rule: the id of the rule to rewrite, or null for a new rule.
- route: where the fix belongs: rule (rules.json), mode (who the owner is, prose), skill (a skill step misled the agent), contract (how delegated workers must work and verify), collector (wrong data in the agent's brief), engine (a gate, brief format, hook or test in the engine), project (holds in one project only, goes to that project's CLAUDE.md).
- level: the highest rung of this ladder that can catch the pattern, tried in order: structure (change the engine or the brief format so the mistake cannot happen), check (a gate in the engine or a hook that fails when it happens, its message naming what to do instead), test (a test that fails on the mistake), verifier (an ask the brief must carry, which the independent verifier judges against evidence every run, for judgment calls a check cannot decide; it observes and does not block yet), prose (a rule or mode text; nothing fails when the agent skips it). Pick prose only for taste or judgment no check or verifier row can decide.
- check: for structure, check, test or verifier, what fails, where, and how to prove it fails on one of these misses as it happened; for prose, why no higher rung can catch it.
- change: in Thai, the exact new or rewritten text, or for a non-rule route what to change. When a rule exists and keeps being broken, say why the current wording fails, and move it up the ladder rather than adding words: a rule whose enforced by is none and that is broken again is never fixed with more prose.
Merge causes that one change would fix into one proposal, and return at most ${MAX_PROPOSALS}, the ones that cost the owner most first. Propose nothing rather than something weak. Never propose a change built on one miss.

## Rules
${rules.map((r) => `- ${r.id}: ${r.rule} (enforced by: ${r.enforced_by || "none"})`).join("\n") || "(none)"}

## Misses
${misses.map((m) => `- key: ${m.key}\n  kind: ${m.kind}${m.project ? ` · project: ${m.project}` : ""}\n  context: ${m.context || "-"}\n  owner said: ${m.said}${known.has(m.key) ? `\n  earlier tag: rule ${known.get(m.key)!.rule ?? "null"}, cause ${known.get(m.key)!.cause}` : ""}`).join("\n")}`;
}

async function lastImprove(): Promise<string | null> {
  const r = await $`git -C ${ROOT} log -1 --grep ^improve: --format=%cI`.quiet().nothrow();
  const at = r.exitCode === 0 ? new Date(r.stdout.toString().trim()) : null;
  return at && !Number.isNaN(at.getTime()) ? at.toISOString() : null;
}

function readMisses(path: string): Miss[] {
  try {
    const raw = z.array(z.unknown()).parse(JSON.parse(readFileSync(path, "utf8")));
    return raw.flatMap((m) => {
      const r = Miss.safeParse(m);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

async function askClaude(text: string): Promise<z.infer<typeof Answer>> {
  const { $schema: _, ...json } = z.toJSONSchema(Answer);
  const cwd = join(tmpdir(), "twin-reflect");
  mkdirSync(cwd, { recursive: true });
  const claude = Bun.which("claude") ?? "claude";
  const r = await $`${claude} -p --safe-mode --no-session-persistence --tools "" --model ${MODEL} --output-format json --json-schema ${JSON.stringify(json)} < ${new Response(text)}`.cwd(cwd).quiet().nothrow();
  if (r.exitCode !== 0) throw new Error(`claude -p exit ${r.exitCode}: ${(r.stderr.toString() || r.stdout.toString()).trim().split("\n")[0]}`);
  const out = ClaudeOut.parse(JSON.parse(r.stdout.toString()));
  if (out.is_error) throw new Error("claude -p ตอบ error");
  return Answer.parse(out.structured_output);
}

type Effect = { rule: Rule; changed: string; before: number; after: number };

function effects(rules: Rule[], tags: Tag[], today: string): Effect[] {
  const first = tags[0] ? dateOf(new Date(tags[0].at)) : null;
  return rules.flatMap((rule) => {
    const changed = rule.confirmed;
    if (!changed || !first || first > shift(changed, -EFFECT_DAYS) || shift(changed, EFFECT_DAYS) > today) return [];
    const count = (from: string, to: string) => tags.filter((t) => t.agentFault && t.rule === rule.id && dateOf(new Date(t.at)) >= from && dateOf(new Date(t.at)) < to).length;
    const before = count(shift(changed, -EFFECT_DAYS), changed);
    const after = count(changed, shift(changed, EFFECT_DAYS));
    return after >= MIN_GROUP && after >= before ? [{ rule, changed, before, after }] : [];
  });
}

export default defineCollector({
  title: "reflect",
  order: 92,
  everyMinutes: 24 * 60,
  timeoutSeconds: 900,
  inBrief: false,
  keep: "snapshot",
  preserve: [TAGS_FILE, PROPOSALS_FILE],
  defaultOn: true,
  requires: ["claude"],
  async run({ now, profile }) {
    const source = join(ROOT, "state/audit", MISSES_FILE);
    if (!existsSync(source)) return { kind: "off", why: "ยังไม่มีข้อมูลจาก audit: bun twin.ts sync audit" };
    const misses = readMisses(source);
    const { rules } = readIdentity();
    const ids = new Set(rules.map((r) => r.id));
    const byRule = new Map(rules.map((r) => [r.id, r]));
    const today = dateOf(now);
    const horizon = shift(today, -KEEP_DAYS);
    const keys = new Set(misses.map((m) => m.key));
    const settled = now.getTime() - (MISS_DAYS - SETTLE_DAYS) * DAY;
    const stored = readJsonl(join(DIR, TAGS_FILE), Tag).filter((t) => dateOf(new Date(t.at)) >= horizon && (keys.has(t.key) || Date.parse(t.at) < settled));
    const known = new Map(stored.map((t) => [t.key, t]));
    const fresh = misses.filter((m) => !known.has(m.key));
    const last = readStored();
    const answer = fresh.length || !last ? (misses.length ? await askClaude(prompt(misses, rules, known, profile.name)) : { tags: [], proposals: [] }) : null;
    const byKey = new Map(misses.map((m) => [m.key, m]));
    const answered = new Map((answer?.tags ?? []).map((t) => [t.key, t]));
    const added = answer
      ? fresh.map((m): Tag => {
          const t = answered.get(m.key);
          return { key: m.key, at: m.at, project: m.project, rule: t?.rule != null && ids.has(t.rule) ? t.rule : null, cause: t?.cause ?? UNTAGGED, agentFault: t?.agentFault ?? false };
        })
      : [];
    const tags = [...stored, ...added].sort((a, b) => a.at.localeCompare(b.at));
    const tagged = new Map(tags.map((t) => [t.key, t]));
    const improvedAt = await lastImprove();
    const handled = last && improvedAt && improvedAt > last.at ? improvedAt : (last?.handled ?? null);
    const drafts = answer ? answer.proposals.map((p) => ({ ...p, rule: p.rule !== null && ids.has(p.rule) ? p.rule : null })) : last!.proposals;
    const open = (k: string) => keys.has(k) && tagged.get(k)?.agentFault === true && (handled === null || byKey.get(k)!.at > handled);
    const proposals = drafts
      .map((p) => ({ ...p, keys: [...new Set(p.keys)].filter(open) }))
      .filter((p) => p.keys.length >= MIN_GROUP)
      .slice(0, MAX_PROPOSALS);
    const basedOn = answer ? misses.map((m) => m.key) : last!.basedOn;
    const failing = effects(rules, tags, today);
    const countFrom = shift(today, -COUNT_DAYS);
    const recent = tags.filter((t) => t.agentFault && dateOf(new Date(t.at)) >= countFrom);
    const perRule = [...Map.groupBy(recent, (t) => t.rule ?? `(ไม่มี rule) ${t.cause}`).entries()].sort((a, b) => b[1].length - a[1].length);
    const faults = misses.filter((m) => tagged.get(m.key)?.agentFault).length;
    const show = (p: StoredProposal) => [
      `### ${p.title}`,
      `- ${p.keys.length} ครั้ง · แก้ที่ ${ROUTE_LABEL[p.route]}${p.rule ? ` · rule ${p.rule}` : " · rule ใหม่"}`,
      `- ระดับ: ${LEVEL_LABEL[p.level]}${/^-?$/.test(p.check.trim()) ? "" : ` · ${p.check}`}`,
      `- เสนอ: ${p.change}`,
      ...p.keys.slice(-QUOTES).flatMap((k) => (byKey.has(k) ? [`  - ${byKey.get(k)!.project ?? profile.name} ${dateOf(new Date(byKey.get(k)!.at))} "${clip(byKey.get(k)!.said, QUOTE_CHARS)}"`] : [])),
      "",
    ];
    const index = [
      `# ${profile.name} reflect · ${today}`,
      "",
      `${MISS_DAYS} วัน: พลาด ${misses.length} ครั้ง (ส่งกลับแก้ ${misses.filter((m) => m.kind === "sent-back").length} · ตำหนิในแชท ${misses.filter((m) => m.kind === "correction").length}) · ${profile.name} ผิดเอง ${faults} · จัดกลุ่มโดย claude -p ${MODEL}${answer ? "" : " (ไม่มีครั้งใหม่ ใช้ผลรอบก่อน)"}`,
      "",
      "## ข้อเสนอ (ร่าง ยังไม่ได้แก้อะไร)",
      ...(proposals.length ? proposals.flatMap(show) : ["- ยังไม่มีเรื่องที่พลาดซ้ำ 2 ครั้งขึ้นไป", ""]),
      "## rule ที่แก้แล้วยังพลาด",
      ...(failing.length ? failing.map((f) => `- ${f.rule.id} (แก้หรือยืนยันล่าสุด ${f.changed}): ${EFFECT_DAYS} วันก่อน ${f.before} · ${EFFECT_DAYS} วันหลัง ${f.after} · ${unenforced(f.rule) ? "ย้ายขึ้นบันไดหรือถอด" : "ตัวบังคับยังรั่ว: แก้ตัวบังคับหรือถอด"}`) : ["- ไม่มี"]),
      "",
      `## พลาดต่อ rule (${COUNT_DAYS} วัน)`,
      ...(perRule.length ? perRule.map(([rule, ts]) => `- ${rule}: ${ts.length}${byRule.has(rule) && unenforced(byRule.get(rule)) && ts.length >= MIN_GROUP ? " · ไม่มีอะไรบังคับ: ย้ายขึ้นบันได ไม่ใช่เพิ่มคำ" : ""}`) : ["- ไม่มี"]),
    ].join("\n");
    return {
      kind: "ok",
      files: {
        "index.md": `${index}\n`,
        [TAGS_FILE]: tags.map((t) => JSON.stringify(t)).join("\n") + (tags.length ? "\n" : ""),
        [PROPOSALS_FILE]: `${JSON.stringify({ at: answer || !last ? now.toISOString() : last.at, handled, basedOn, proposals: drafts }, null, 1)}\n`,
      },
      brief: "",
      items: [
        ...(proposals.length ? [{ key: `reflect:proposals:${basedOn.at(-1) ?? ""}`, project: profile.name, title: `${profile.name} เจอเรื่องที่พลาดซ้ำ ${proposals.length} เรื่อง ร่างวิธีแก้ไว้แล้ว: ${proposals.slice(0, TITLES_SHOWN).map((p) => clip(p.title, 60)).join(" · ")}${proposals.length > TITLES_SHOWN ? " …" : ""} (state/reflect/) → พิมพ์ "improve"`, score: 34 }] : []),
        ...failing.map((f) => ({ key: `reflect:failing:${f.rule.id}:${f.changed}`, project: profile.name, title: `rule ${f.rule.id} แก้หรือยืนยันล่าสุด ${f.changed} แล้วยังพลาด ${f.after} ครั้ง (ก่อนแก้ ${f.before}) → พิมพ์ "improve" เพื่อ${unenforced(f.rule) ? "ย้ายขึ้นบันไดหรือถอด" : "แก้ตัวบังคับหรือถอด"}`, score: 30 })),
      ],
    };
  },
});
