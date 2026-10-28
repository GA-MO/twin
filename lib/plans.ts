import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listRuns, start } from "./dispatch.ts";
import { NOTES_DIR, readNotes } from "./notes.ts";

const slugOf = (file: string) =>
  `plan-${file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "")}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 41)
    .replace(/-+$/, "");

function task(file: string, slug: string): string {
  return `ชนิด: plan
ขนาด: เล็ก
เป้าหมาย: ร่าง plan ของ todo นี้ไว้ ให้เจ้าของเปิดมาเจอแล้วสั่งทำได้ทันที
อ้างอิง: notes/${file} (ด้านล่าง), CLAUDE.md และ code ของ project นี้
ห้าม: แก้ code, เพิ่ม dependency, เปิด dev server; เขียนได้ไฟล์เดียวคือ docs/plans/${slug}.md
ก่อนเริ่ม: ไล่ git log ของ develop ตั้งแต่วันที่ของ note ถ้างานนี้ทำไปแล้ว ไม่ต้องเขียน plan ให้รายงาน outcome "done" ที่ "ทำแล้ว" ขึ้นต้นว่า "ทำไปแล้ว:" ตามด้วย commit ที่ทำ
เสร็จเมื่อ: commit docs/plans/${slug}.md บน branch นี้ มี phase, ไฟล์ที่ต้องแตะต่อ phase, วิธีเช็กว่าเสร็จ และคำถามที่เจ้าของต้องตัดสิน (ถ้ามี) อยู่บนสุด
ลงที่: push branch นี้เท่านั้น
คำถาม: todo นี้ต้องทำอะไรบ้าง แตะไฟล์ไหน และรู้ได้อย่างไรว่าเสร็จ

${readFileSync(join(NOTES_DIR, file), "utf8")}`;
}

export async function draftDuePlans(now: Date): Promise<{ started: string[]; failed: string[] }> {
  const today = now.toLocaleDateString("sv-SE");
  const taken = new Set(listRuns().map((r) => `${r.project}/${r.slug}`));
  const due = readNotes().notes.flatMap((n) => (n.kind === "todo" && n.status === "open" && n.project && n.due && n.due <= today ? [{ file: n.file, project: n.project }] : []));
  const started: string[] = [];
  const failed: string[] = [];
  for (const n of due) {
    const slug = slugOf(n.file);
    if (taken.has(`${n.project}/${slug}`)) continue;
    try {
      const run = await start(n.project, slug, task(n.file, slug));
      started.push(run.id);
    } catch (e) {
      failed.push(`${n.project}/${slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { started, failed };
}
