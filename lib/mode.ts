import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { forbid, readIdentity, renderIdentity } from "./identity.ts";
import { readJsonl, Tag, TAGS_FILE } from "./misses.ts";
import { HOME, MODE_DIR, ROOT, modeHookCommand, potetoDir, readProfile } from "./profile.ts";

export const MODE_FILE = join(ROOT, "state/mode.md");
export const MODE_MAX_CHARS = 40_000;
const USER_MEMORY = () => join(HOME, ".claude/CLAUDE.md");
export const importLine = (file: string) => `@${file.replaceAll("\\", "/").replaceAll(" ", "\\ ")}`;
const IMPORT = importLine(MODE_FILE);

export function renderMode(): string | null {
  const profile = readProfile();
  const file = join(MODE_DIR, "SKILL.md");
  if (!profile || !existsSync(file)) return null;
  const body = readFileSync(file, "utf8").replace(/^---[\s\S]*?---\n/, "");
  const method = potetoDir()
    ? ` For code work that touches more than one file, involves a design choice, or is a bug with an unknown cause, invoke pstack:poteto-mode as the method; ${profile.name}-mode wins where the two differ.`
    : "";
  return `<EXTREMELY_IMPORTANT>
You work for your owner as ${profile.name}. The ${profile.name}-mode skill below is already loaded in full; follow it on every task, small or large.${method} Reply in the language the owner writes.
Base directory for this skill: ${MODE_DIR}

${[body.trim(), renderIdentity(readIdentity())].filter(Boolean).join("\n\n")}
</EXTREMELY_IMPORTANT>
`;
}

export const MODE_CROWDED_SHARE = 0.8;
export const crowded = (text: string) => text.length >= MODE_CROWDED_SHARE * MODE_MAX_CHARS;

export const longestSections = (text: string, most: number) =>
  text
    .split(/\n(?=## )/)
    .filter((part) => part.startsWith("## "))
    .map((part) => ({ title: part.slice(3).split("\n")[0]!.split(" (")[0]!.trim(), chars: part.length }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, most)
    .map((s) => `${s.title} ${s.chars.toLocaleString()}`)
    .join(" · ");

export const oversize = (text: string) =>
  text.length > MODE_MAX_CHARS ? `ตัวตนยาว ${text.length.toLocaleString()} ตัวอักษร เกินงบ ${MODE_MAX_CHARS.toLocaleString()} ที่ twin ตั้งไว้: ย่อ SKILL.md หรือย้ายรายละเอียดไปไฟล์ที่อ่านเมื่อใช้` : null;

export function writeMode(): { text: string | null; changed: boolean } {
  const text = renderMode();
  const before = existsSync(MODE_FILE) ? readFileSync(MODE_FILE, "utf8") : null;
  if (text === null) rmSync(MODE_FILE, { force: true });
  if (text === null || text === before) return { text, changed: false };
  mkdirSync(dirname(MODE_FILE), { recursive: true });
  const tmp = `${MODE_FILE}.${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, MODE_FILE);
  return { text, changed: true };
}

export function placeImport(present: boolean): boolean {
  const file = USER_MEMORY();
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  const has = current?.split("\n").includes(IMPORT) ?? false;
  if (has === present) return false;
  mkdirSync(dirname(file), { recursive: true });
  if (present) writeFileSync(file, current?.trim() ? `${current.trimEnd()}\n\n${IMPORT}\n` : `${IMPORT}\n`);
  else {
    const lines = (current ?? "").split("\n");
    const at = lines.indexOf(IMPORT);
    const from = at > 0 && lines[at - 1] === "" ? at - 1 : at;
    writeFileSync(file, `${[...lines.slice(0, from), ...lines.slice(at + 1)].join("\n").trimEnd()}\n`);
  }
  return true;
}

export function refreshMode(): string | null {
  const profile = readProfile();
  if (!profile) return null;
  const { text, changed } = writeMode();
  const added = (() => {
    try {
      return profile.scope === "global" && placeImport(true);
    } catch (e) {
      return `เพิ่ม ${IMPORT} ใน ${USER_MEMORY()} ไม่ได้ (${(e as Error).message.split("\n")[0]}): session นอก repo นี้จะไม่มีตัวตน`;
    }
  })();
  if (!text || !(added || changed)) return null;
  return `${typeof added === "string" ? `${added}\n` : ""}<EXTREMELY_IMPORTANT>
${changedNotice(profile.name)}
</EXTREMELY_IMPORTANT>`;
}

export const MODE_HOOK_FILE = join(ROOT, "lib/mode-hook.ts");
const turnHookCommand = () => `"${process.execPath}" "${MODE_HOOK_FILE}"`;

export const MODE_HOOKS = [
  { event: "SessionStart", matcher: "startup|resume|clear|compact", timeout: 10, command: modeHookCommand },
  { event: "UserPromptSubmit", timeout: 5, command: turnHookCommand },
  { event: "PreToolUse", matcher: "Agent|Task", timeout: 5, command: turnHookCommand },
] as const;

export const modeReadRule = () => `Read(/${MODE_FILE.replaceAll("\\", "/")})`;

const BLIND_AGENTS = new Set(["Explore", "Plan"]);

export function lendMode(input: Record<string, unknown>): object | null {
  const profile = readProfile();
  const { subagent_type: type, prompt } = input;
  if (!profile || typeof type !== "string" || !BLIND_AGENTS.has(type) || typeof prompt !== "string" || !existsSync(MODE_FILE)) return null;
  const line = `Before you start, read ${MODE_FILE} in full with the Read tool and follow it while you do the task above: it is ${profile.name}-mode, which the session that sent you works under, and the ${type} agent type does not load it.`;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...input, prompt: `${prompt}\n\n${line}` } } };
}

const versionOf = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 8);
const SESSIONS = join(ROOT, "state/mode/sessions");
const SESSION_KEEP_MS = 14 * 86_400_000;
const SessionId = /^[A-Za-z0-9-]{1,80}$/;
const SessionState = z.object({ version: z.string(), cardAt: z.number().int().min(0).nullable() });
type SessionState = z.infer<typeof SessionState>;

function readSession(id: string): SessionState | null {
  const file = join(SESSIONS, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    const parsed = SessionState.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeSession(id: string, state: SessionState): void {
  mkdirSync(SESSIONS, { recursive: true });
  const file = join(SESSIONS, `${id}.json`);
  writeFileSync(`${file}.${process.pid}`, JSON.stringify(state));
  renameSync(`${file}.${process.pid}`, file);
}

export function markLoaded(id: string | undefined): void {
  if (!id || !SessionId.test(id) || !existsSync(MODE_FILE)) return;
  writeSession(id, { version: versionOf(readFileSync(MODE_FILE, "utf8")), cardAt: null });
  const old = Date.now() - SESSION_KEEP_MS;
  for (const f of readdirSync(SESSIONS)) if ((statSync(join(SESSIONS, f), { throwIfNoEntry: false })?.mtimeMs ?? Infinity) < old) rmSync(join(SESSIONS, f), { force: true });
}

const CARD_EVERY_TOKENS = 100_000;
const USAGE_TAIL_BYTES = 4_000_000;
const CARD_RULES = 3;
const CARD_MIN_MISSES = 2;
const CARD_DAYS = 30;

const Usage = z.object({
  type: z.literal("assistant"),
  isSidechain: z.boolean().optional(),
  message: z.object({ model: z.string().optional(), usage: z.object({ input_tokens: z.number(), cache_creation_input_tokens: z.number().default(0), cache_read_input_tokens: z.number().default(0) }) }),
});

function contextTokens(file: string): number | null {
  const { size } = statSync(file);
  const length = Math.min(size, USAGE_TAIL_BYTES);
  const buf = Buffer.alloc(length);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buf, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  for (const line of buf.toString("utf8").split("\n").reverse()) {
    if (line.includes('"subtype":"compact_boundary"')) return null;
    if (!line.includes('"usage"')) continue;
    try {
      const entry = Usage.safeParse(JSON.parse(line));
      if (!entry.success || entry.data.isSidechain || entry.data.message.model === "<synthetic>") continue;
      const u = entry.data.message.usage;
      const total = u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
      if (total > 0) return total;
    } catch {}
  }
  return null;
}

function missedRules(): string[] {
  const from = Date.now() - CARD_DAYS * 86_400_000;
  const rules = new Map(readIdentity().rules.map((r) => [r.id, r.rule]));
  const missed = readJsonl(join(ROOT, "state/reflect", TAGS_FILE), Tag).flatMap((t) => {
    const rule = t.rule === null ? undefined : rules.get(t.rule);
    return t.agentFault && rule && Date.parse(t.at) >= from ? [rule] : [];
  });
  return [...Map.groupBy(missed, (r) => r).entries()]
    .filter(([, times]) => times.length >= CARD_MIN_MISSES)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, CARD_RULES)
    .map(([rule, times]) => `- ${rule} (${times.length})`);
}

const changedNotice = (name: string) => `${name}-mode changed after this session loaded it. Before any other step, read ${MODE_FILE} in full with the Read tool and follow it over what you loaded.`;

export function promptCard(id: string | undefined, transcript: string | undefined): string | null {
  const profile = readProfile();
  if (!profile || !id || !SessionId.test(id) || !existsSync(MODE_FILE)) return null;
  const now = versionOf(readFileSync(MODE_FILE, "utf8"));
  const stored = readSession(id);
  const state = stored ?? { version: now, cardAt: null };
  const tokens = transcript && existsSync(transcript) ? contextTokens(transcript) : null;
  const from = tokens !== null && (state.cardAt === null || tokens < state.cardAt) ? tokens : state.cardAt;
  const due = tokens !== null && from !== null && tokens - from >= CARD_EVERY_TOKENS;
  const out: string[] = [];
  if (state.version !== now) out.push(changedNotice(profile.name));
  if (due) {
    const { redLines } = readIdentity();
    const missed = missedRules();
    out.push(
      [
        `${profile.name}-mode reminder: this session is long, and ${profile.name}-mode, loaded at its start, still governs this turn. If it is no longer in your context, read ${MODE_FILE} in full before you reply.`,
        ...(redLines.length ? ["Red lines:", ...redLines.map((r) => `- ${forbid(r)}`)] : []),
        ...(missed.length ? [`Rules missed most in the last ${CARD_DAYS} days:`, ...missed] : []),
      ].join("\n"),
    );
  }
  const next = { version: now, cardAt: due ? tokens : from };
  if (!stored || next.version !== stored.version || next.cardAt !== stored.cardAt) writeSession(id, next);
  return out.length ? `<EXTREMELY_IMPORTANT>\n${out.join("\n\n")}\n</EXTREMELY_IMPORTANT>` : null;
}

const plain = (s: string) => s.replace(/^[\s>*-]+/, "").replace(/\s+/g, " ").trim();

export const tailLine = (text: string) => {
  const lines = text.split("\n");
  const end = lines.findLastIndex((l) => l.includes("</EXTREMELY_IMPORTANT>"));
  return lines.slice(0, end < 0 ? lines.length : end).map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
};

export const cueOf = (line: string) => plain(line).slice(0, Math.min(25, Math.floor(plain(line).length / 3)));

export const quotes = (expected: string, answer: string) => {
  const want = plain(expected).slice(0, 80);
  return want.length > 0 && plain(answer).includes(want);
};
