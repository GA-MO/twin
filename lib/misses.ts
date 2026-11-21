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

export const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
