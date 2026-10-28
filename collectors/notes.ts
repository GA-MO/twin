import { defineCollector, type AttentionItem } from "../lib/collector.ts";
import { readNotes, type Note } from "../lib/notes.ts";

const BRIEF_TODOS = 3;
const IMPROVE_AFTER_FEEDBACK = 5;
const IMPROVE_AFTER_DAYS = 14;
const SCORE: Partial<Record<Note["kind"], number>> = { todo: 40, idea: 20, meeting: 35 };

export default defineCollector({
  title: "โน้ต / todo / ไอเดีย",
  order: 40,
  everyMinutes: 1,
  keep: "snapshot",
  defaultOn: true,
  refreshOnBrief: true,
  async run({ now, profile }) {
    const { notes, problems } = readNotes();
    const open = notes.filter((n) => n.status !== "done" && n.status !== "dropped");
    const feedback = open.filter((n) => n.kind === "feedback");
    const oldestDays = feedback.length ? (now.getTime() - Date.parse(feedback[0]!.file.slice(0, 10))) / 86_400_000 : 0;
    const items: AttentionItem[] = [
      ...(feedback.length >= IMPROVE_AFTER_FEEDBACK || (feedback.length && oldestDays >= IMPROVE_AFTER_DAYS)
        ? [{ key: "notes:improve", project: profile.name, title: `feedback ถึง ${profile.name} ${feedback.length} ข้อ: พิมพ์ "improve"`, score: 30 }]
        : []),
      ...open
        .filter((n) => SCORE[n.kind] !== undefined)
        .map((n) => ({
          key: `notes:${n.file}`,
          title: `${n.kind === "todo" ? "todo" : n.kind === "meeting" ? "action จากประชุม" : "ไอเดีย"}: ${n.title} (notes/${n.file})`,
          ...(n.project ? { project: n.project } : {}),
          ...(n.due ? { due: n.due } : {}),
          score: SCORE[n.kind]!,
        })),
      ...problems.map((p) => ({ key: `notes:bad:${p.file}`, title: `โน้ตรูปแบบผิด notes/${p.file}: ${p.problem}`, score: 50 })),
    ];
    const count = (k: Note["kind"]) => open.filter((n) => n.kind === k).length;
    const todos = open.filter((n) => n.kind === "todo").sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
    const brief = [
      `- todo ${count("todo")} · ไอเดีย ${count("idea")} · action ประชุม ${count("meeting")} · feedback ${count("feedback")}${problems.length ? ` · ⚠ รูปแบบผิด ${problems.length}` : ""}`,
      ...todos.slice(0, BRIEF_TODOS).map((t) => `- ${t.title}${t.due ? ` (due ${t.due})` : ""}`),
    ].join("\n");
    const index = ["# โน้ตที่เปิดอยู่", "", ...open.map((n) => `- [${n.kind}] ${n.title}${n.project ? ` · ${n.project}` : ""}${n.due ? ` · due ${n.due}` : ""} · notes/${n.file}`)].join("\n");
    return { kind: "ok", files: { "index.md": `${index}\n` }, brief: notes.length ? brief : "", items };
  },
});
