import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { AttentionItem } from "./collector.ts";
import { ROOT } from "./profile.ts";

const DIR = join(ROOT, "state/patterns");
const FRAGMENT = join(ROOT, "state/brief/patterns.json");
export const PROPOSALS_FILE = "proposals.json";
export const DECLINED_FILE = "declined.json";
const SHOWN = 3;
const SCORE = 20;
const SAME_GROUP = 0.5;

const Entry = z.object({ n: z.number().int().positive(), key: z.string().min(1), title: z.string().min(1), members: z.array(z.string()).default([]) });
export type Entry = z.infer<typeof Entry>;
const Entries = z.array(Entry);
const Declined = z.array(z.object({ key: z.string(), title: z.string(), at: z.string(), members: z.array(z.string()).default([]) }));
export type Declined = z.infer<typeof Declined>;
const Fragment = z.looseObject({ body: z.string(), items: z.array(z.looseObject({ key: z.string() })) });

export const memberKey = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 12);

function read<T>(file: string, schema: z.ZodType<T>, empty: T): T {
  try {
    return schema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return empty;
  }
}

export const readDeclined = (dir = DIR): Declined => read(join(dir, DECLINED_FILE), Declined, []);
export const readEntries = (dir = DIR): Entry[] => read(join(dir, PROPOSALS_FILE), Entries, []);

export function isDeclined(e: Pick<Entry, "key" | "members">, declined: Declined): boolean {
  return declined.some((d) => d.key === e.key || (e.members.length > 0 && e.members.filter((m) => d.members.includes(m)).length / e.members.length >= SAME_GROUP));
}

export function briefOf(entries: Entry[], declined: Declined): { brief: string; items: AttentionItem[] } {
  const open = entries.filter((e) => !isDeclined(e, declined));
  const shown = open.slice(0, SHOWN);
  return {
    brief: [...shown.map((e) => `- ${e.n}. ${e.title}`), ...(open.length > SHOWN ? [`- อีก ${open.length - SHOWN} ข้อใน state/patterns/`] : [])].join("\n"),
    items: shown.map((e) => ({ key: `patterns:${e.key}`, title: `${e.title} (state/patterns/)`, score: SCORE })),
  };
}

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export function decline(arg: string | undefined, now = new Date(), dir = DIR, fragment = FRAGMENT): string {
  const entries = readEntries(dir);
  if (!entries.length) throw new Error("ยังไม่มีข้อเสนอ: bun twin.ts sync patterns");
  const e = arg && /^\d+$/.test(arg) ? entries.find((x) => x.n === Number(arg)) : entries.find((x) => x.key === arg);
  if (!e) throw new Error(`ใช้: patterns no <เลขข้อ ${entries[0]!.n}-${entries.at(-1)!.n} หรือ key> (ดูใน state/patterns/index.md)`);
  const declined = readDeclined(dir);
  if (declined.some((d) => d.key === e.key)) return `ข้อ ${e.n} ไม่เอาไว้แล้ว: ${e.title}`;
  const next = [...declined, { key: e.key, title: e.title, at: now.toISOString(), members: e.members }];
  mkdirSync(dir, { recursive: true });
  writeAtomic(join(dir, DECLINED_FILE), JSON.stringify(next, null, 2));
  if (existsSync(fragment)) {
    const f = Fragment.safeParse(read(fragment, z.unknown(), null));
    const { brief, items } = briefOf(entries, next);
    if (f.success) writeAtomic(fragment, JSON.stringify({ ...f.data, body: brief, items }, null, 2));
  }
  return `จะไม่เสนออีก: ${e.title}`;
}
