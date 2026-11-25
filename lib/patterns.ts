import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT } from "./profile.ts";

const DIR = join(ROOT, "state/patterns");
export const PROPOSALS_FILE = "proposals.json";
export const DECLINED_FILE = "declined.json";

const Proposals = z.array(z.looseObject({ key: z.string().min(1), title: z.string().min(1) }));
const Declined = z.array(z.object({ key: z.string(), title: z.string(), at: z.string() }));
export type Declined = z.infer<typeof Declined>;

function read<T>(dir: string, file: string, schema: z.ZodType<T>, empty: T): T {
  try {
    return schema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  } catch {
    return empty;
  }
}

export const readDeclined = (dir = DIR): Declined => read(dir, DECLINED_FILE, Declined, []);

export function decline(n: string | undefined, now = new Date(), dir = DIR): string {
  const proposals = read(dir, PROPOSALS_FILE, Proposals, []);
  const i = Number(n);
  if (!n || !/^\d+$/.test(n) || i < 1 || i > proposals.length) throw new Error(proposals.length ? `ใช้: patterns no <1-${proposals.length}> (เลขข้อใน state/patterns/index.md)` : "ยังไม่มีข้อเสนอ: bun twin.ts sync patterns");
  const p = proposals[i - 1]!;
  const declined = readDeclined(dir);
  if (declined.some((d) => d.key === p.key)) return `ข้อ ${i} ไม่เอาไว้แล้ว: ${p.title}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, DECLINED_FILE), JSON.stringify([...declined, { key: p.key, title: p.title, at: now.toISOString() }], null, 2));
  return `จะไม่เสนออีก: ${p.title}`;
}
