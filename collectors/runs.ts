import { defineCollector, type AttentionItem } from "../lib/collector.ts";
import { describe, listRuns, type RunView } from "../lib/dispatch.ts";

function attention(v: RunView): AttentionItem | null {
  const key = `runs:${v.id}`;
  const base = { key, project: v.project, ...(v.owner ? { owner: v.owner } : {}) };
  if (v.status === "crashed") return { ...base, title: `งาน ${v.slug} ตาย กลางทาง: bun twin.ts runs ${v.id}`, score: 55 };
  if (v.status !== "finished") return null;
  if (v.handling) return null;
  const r = v.report;
  if (!r) return { ...base, title: `งาน ${v.slug} จบแต่อ่าน report ไม่ได้`, score: 55 };
  if (r.outcome === "needs-approval") return { ...base, title: `งาน ${v.slug} ขออนุมัติ ${r.gates_requested.join(",")} · ${v.commits.length} commits`, score: 70 };
  if (r.outcome === "needs-input") return { ...base, title: `งาน ${v.slug} ถาม: ${r.question ?? r.pending}`, score: 70 };
  if (r.outcome === "blocked") return { ...base, title: `งาน ${v.slug} ติด: ${r.pending}`, score: 55 };
  return { ...base, title: `งาน ${v.slug} เสร็จ${v.pushed ? " (push แล้ว)" : ""} รอ ship หรือปิด`, score: 45 };
}

const line = (v: RunView) => `- ${v.project}/${v.slug} · ${v.status}${v.report ? ` · ${v.report.outcome}` : ""} · ${v.commits.length} commits`;

export default defineCollector({
  title: "งานที่ส่งไป",
  order: 10,
  everyMinutes: 1,
  keep: "snapshot",
  defaultOn: true,
  refreshOnBrief: true,
  async run() {
    const open = listRuns().filter((v) => v.status !== "closed");
    return {
      kind: "ok",
      files: { "index.md": `# งานที่ส่งไป (${open.length})\n\n${open.map(describe).join("\n\n")}\n` },
      brief: open.filter((v) => !v.owner).map(line).join("\n"),
      owned: open.flatMap((v) => (v.owner ? [{ owner: v.owner, text: line(v) }] : [])),
      items: open.map(attention).filter((i): i is AttentionItem => i !== null),
    };
  },
});
