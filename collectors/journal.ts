import { $ } from "bun";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import { firstSegment, inside } from "../lib/paths.ts";
import { SKIP_PREFIX, redact } from "../lib/transcript.ts";
import { HOME, ROOT } from "../lib/profile.ts";

const TRANSCRIPTS = join(HOME, ".claude/projects");
const JOURNAL_DIR = join(ROOT, "journal");
const BACKFILL_DAYS = 30;
const MAX_PROMPTS_PER_PROJECT = 40;
const PROMPT_CHARS = 200;
const Line = z.looseObject({
  type: z.literal("user"),
  timestamp: z.string(),
  cwd: z.string(),
  isMeta: z.boolean().optional(),
  message: z.looseObject({
    content: z.union([z.string(), z.array(z.looseObject({ type: z.string(), text: z.string().optional() }))]),
  }),
});

type Prompt = { at: Date; text: string };
type Commit = { at: Date; subject: string };
type Day = Map<string, { prompts: Prompt[]; commits: Commit[] }>;

const localDate = (d: Date) => d.toLocaleDateString("sv-SE");
const hhmm = (d: Date) => d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

function projectOf(cwd: string, devRoot: string | null): string | null {
  const repo = cwd.split(/[\\/]\.claude[\\/]worktrees[\\/]/)[0]!;
  if (repo === ROOT || inside(ROOT, repo)) return basename(ROOT);
  if (devRoot && inside(devRoot, repo)) return firstSegment(devRoot, repo);
  return null;
}

function humanText(content: z.infer<typeof Line>["message"]["content"]): string | null {
  const text = typeof content === "string" ? content : content.filter((c) => c.type === "text").map((c) => c.text ?? "").join(" ");
  const t = text.trim();
  return t && !SKIP_PREFIX.test(t) ? t : null;
}

function bucket(days: Map<string, Day>, date: string, project: string) {
  let day = days.get(date);
  if (!day) days.set(date, (day = new Map()));
  let entry = day.get(project);
  if (!entry) day.set(project, (entry = { prompts: [], commits: [] }));
  return entry;
}

async function collectPrompts(days: Map<string, Day>, since: Date, devRoot: string | null) {
  if (!existsSync(TRANSCRIPTS)) return;
  for (const dir of readdirSync(TRANSCRIPTS)) {
    const full = join(TRANSCRIPTS, dir);
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full).filter((f) => f.endsWith(".jsonl"))) {
      const path = join(full, f);
      if (statSync(path).mtimeMs < since.getTime()) continue;
      for (const raw of (await Bun.file(path).text()).split("\n")) {
        if (!raw.includes('"type":"user"')) continue;
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          continue;
        }
        const line = Line.safeParse(json);
        if (!line.success || line.data.isMeta) continue;
        const at = new Date(line.data.timestamp);
        const project = projectOf(line.data.cwd, devRoot);
        const text = humanText(line.data.message.content);
        if (!project || !text || at < since) continue;
        bucket(days, localDate(at), project).prompts.push({ at, text });
      }
    }
  }
}

async function collectCommits(days: Map<string, Day>, since: Date, devRoot: string | null) {
  const repos = [ROOT, ...(devRoot ? readdirSync(devRoot).map((d) => join(devRoot, d)) : [])];
  const email = (await $`git config --global user.email`.quiet().nothrow()).text().trim();
  if (!email) return;
  for (const repo of new Set(repos)) {
    if (!existsSync(join(repo, ".git"))) continue;
    const r = await $`git -C ${repo} log ${["--exclude=refs/twin/*", "--exclude=refs/remotes/backup/*", "--all"]} --since=${since.toISOString()} --author=${email} --format=%cI%x09%s`.quiet().nothrow();
    for (const l of r.text().split("\n").filter(Boolean)) {
      const [iso, subject] = l.split("\t") as [string, string];
      const at = new Date(iso);
      bucket(days, localDate(at), basename(repo)).commits.push({ at, subject });
    }
  }
}

function renderDay(date: string, day: Day): string {
  const projects = [...day.entries()].sort((a, b) => b[1].prompts.length + b[1].commits.length - (a[1].prompts.length + a[1].commits.length));
  const out = [`# ${date}`, ""];
  if (!day.size) out.push("(ไม่มีกิจกรรม)", "");
  for (const [project, { prompts, commits }] of projects) {
    out.push(`## ${project} · ${prompts.length} prompts · ${commits.length} commits`);
    for (const c of commits.sort((a, b) => +a.at - +b.at)) out.push(`- ${hhmm(c.at)} commit: ${redact(c.subject)}`);
    const sorted = prompts.sort((a, b) => +a.at - +b.at);
    for (const p of sorted.slice(0, MAX_PROMPTS_PER_PROJECT)) out.push(`- ${hhmm(p.at)} ${redact(p.text.replace(/\s+/g, " ")).slice(0, PROMPT_CHARS)}`);
    if (sorted.length > MAX_PROMPTS_PER_PROJECT) out.push(`- … อีก ${sorted.length - MAX_PROMPTS_PER_PROJECT} prompts`);
    out.push("");
  }
  return out.join("\n");
}

const dayLine = (label: string, day: Day | undefined) =>
  day && day.size
    ? `- ${label}: ${[...day.entries()]
        .sort((a, b) => b[1].prompts.length - a[1].prompts.length)
        .map(([p, e]) => `${p} ${e.prompts.length}/${e.commits.length}`)
        .join(" · ")}`
    : `- ${label}: -`;

export default defineCollector({
  title: "Journal (prompts/commits)",
  order: 60,
  everyMinutes: 30,
  timeoutSeconds: 180,
  inBrief: false,
  keep: "archive",
  defaultOn: true,
  async run({ now, profile }) {
    const dates = Array.from({ length: BACKFILL_DAYS + 1 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      return localDate(d);
    });
    const [today, yesterday] = dates as [string, string];
    const wanted = dates.filter((d) => d === today || d === yesterday || !existsSync(join(JOURNAL_DIR, `${d}.md`)));
    const since = new Date(`${wanted[wanted.length - 1]}T00:00:00`);
    const days = new Map<string, Day>();
    await collectPrompts(days, since, profile.devRoot);
    await collectCommits(days, since, profile.devRoot);
    const files = Object.fromEntries(wanted.map((d) => [`${d}.md`, renderDay(d, days.get(d) ?? new Map())]));
    return { kind: "ok", files, brief: [dayLine("วันนี้", days.get(today)), dayLine("เมื่อวาน", days.get(yesterday))].join("\n"), items: [] };
  },
});
