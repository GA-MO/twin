import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readIdentity, renderIdentity } from "./identity.ts";
import { HOME, MODE_DIR, ROOT, potetoDir, readProfile } from "./profile.ts";

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

export const oversize = (text: string) =>
  text.length > MODE_MAX_CHARS ? `ตัวตนยาว ${text.length.toLocaleString()} ตัวอักษร เกิน ${MODE_MAX_CHARS.toLocaleString()} ที่ Claude Code โหลดได้ดี: ย่อ SKILL.md หรือย้ายรายละเอียดไปไฟล์ที่อ่านเมื่อใช้` : null;

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
${profile.name}-mode changed after this session loaded it. Before any other step, read ${MODE_FILE} in full with the Read tool and follow it over what you loaded.
</EXTREMELY_IMPORTANT>`;
}
