import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { PROFILE_DIR, ROOT } from "./profile.ts";

export const OWNER = {
  commands: join(PROFILE_DIR, "commands"),
  collectors: join(PROFILE_DIR, "collectors"),
  skills: join(PROFILE_DIR, "skills"),
};

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export type OwnerFiles = { files: Map<string, string>; problems: string[] };

export const shown = (file: string) => relative(ROOT, file).split(sep).join("/");

export function ownerFiles(kind: "commands" | "collectors", engine: Iterable<string>): OwnerFiles {
  const dir = OWNER[kind];
  const taken = new Set(engine);
  const files = new Map<string, string>();
  const problems: string[] = [];
  if (!existsSync(dir)) return { files, problems };
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.startsWith("_")).sort()) {
    const name = basename(f, ".ts");
    const file = join(dir, f);
    if (!NAME.test(name)) problems.push(`${shown(file)} ชื่อไฟล์ต้องเป็น a-z 0-9 - (ไฟล์ช่วยให้ขึ้นต้นด้วย _)`);
    else if (taken.has(name)) problems.push(`${shown(file)} ชื่อซ้ำกับของ engine จึงใช้ของ engine: เปลี่ยนชื่อไฟล์`);
    else files.set(name, file);
  }
  return { files, problems };
}

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

export function ownerSkills(): string[] {
  if (!existsSync(OWNER.skills)) return [];
  return readdirSync(OWNER.skills)
    .filter((d) => NAME.test(d) && isDir(join(OWNER.skills, d)) && existsSync(join(OWNER.skills, d, "SKILL.md")))
    .sort();
}

export async function importOwner(file: string): Promise<{ ok: true; value: unknown } | { ok: false; why: string }> {
  try {
    return { ok: true, value: ((await import(file)) as { default?: unknown }).default };
  } catch (e) {
    const line = (e as { position?: { line?: number } } | null)?.position?.line;
    const message = e instanceof Error ? e.message.split("\n")[0]! : String(e);
    return { ok: false, why: `${shown(file)}${line ? `:${line}` : ""} โหลดไม่ได้: ${message}` };
  }
}
