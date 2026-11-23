import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

export const MISSES_FILE = "misses.json";
export const MISS_DAYS = 14;
export const MISS_CHARS = 800;
export const CONTEXT_CHARS = 300;

export const Miss = z.object({
  key: z.string().min(1),
  kind: z.enum(["sent-back", "correction"]),
  at: z.iso.datetime(),
  project: z.string().nullable(),
  said: z.string().min(1),
  context: z.string(),
});
export type Miss = z.infer<typeof Miss>;

export const TAGS_FILE = "tags.jsonl";
export const Tag = z.object({ key: z.string(), at: z.iso.datetime(), project: z.string().nullable(), rule: z.string().nullable(), cause: z.string(), agentFault: z.boolean() });
export type Tag = z.infer<typeof Tag>;

export function readJsonl<T>(path: string, schema: z.ZodType<T>): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").flatMap((l) => {
    if (!l.trim()) return [];
    try {
      const r = schema.safeParse(JSON.parse(l));
      return r.success ? [r.data] : [];
    } catch {
      return [];
    }
  });
}

export const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
