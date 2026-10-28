import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT } from "./profile.ts";

export const NOTES_DIR = join(ROOT, "notes");

export const NoteMeta = z.object({
  kind: z.enum(["idea", "todo", "decision", "fact", "meeting", "seed", "feedback"]),
  status: z.enum(["open", "thinking", "started", "done", "dropped"]).default("open"),
  project: z.string().optional(),
  due: z.iso.date().optional(),
  source: z.string().optional(),
});

export type Note = z.infer<typeof NoteMeta> & { file: string; title: string };
export type NoteProblem = { file: string; problem: string };

function frontmatter(text: string): Record<string, string> | null {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  return Object.fromEntries(
    m[1]!
      .split("\n")
      .map((l) => l.match(/^(\w+):\s*(.*)$/))
      .filter((x): x is RegExpMatchArray => !!x)
      .map((x) => [x[1]!, x[2]!.trim()]),
  );
}

export function readNotes(): { notes: Note[]; problems: NoteProblem[] } {
  if (!existsSync(NOTES_DIR)) return { notes: [], problems: [] };
  const notes: Note[] = [];
  const problems: NoteProblem[] = [];
  for (const file of readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md")).sort()) {
    const text = readFileSync(join(NOTES_DIR, file), "utf8");
    const fm = frontmatter(text);
    if (!fm) {
      problems.push({ file, problem: "ไม่มี frontmatter" });
      continue;
    }
    const meta = NoteMeta.safeParse(fm);
    if (!meta.success) {
      problems.push({ file, problem: meta.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      continue;
    }
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? file.replace(/\.md$/, "");
    notes.push({ ...meta.data, file, title });
  }
  return { notes, problems };
}
