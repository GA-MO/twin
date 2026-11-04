import { defineCollector } from "../lib/collector.ts";
import { available } from "../lib/update.ts";

const LISTED = 10;

export default defineCollector({
  title: "Update",
  order: 85,
  everyMinutes: 24 * 60,
  timeoutSeconds: 60,
  inBrief: false,
  keep: "snapshot",
  defaultOn: true,
  async run({ profile }) {
    const next = await available();
    if (!next) return { kind: "off", why: "branch นี้ไม่มี upstream จึงเช็กรุ่นใหม่ไม่ได้: git branch --set-upstream-to origin/main" };
    const { upstream, subjects } = next;
    const head = subjects.length ? `มี ${profile.name} รุ่นใหม่ ${subjects.length} เรื่อง (${upstream})` : `เป็นรุ่นล่าสุดของ ${upstream} แล้ว`;
    const md = [`# Update`, ``, head, ``, ...subjects.slice(0, LISTED).map((s) => `- ${s}`), ...(subjects.length > LISTED ? [`- …อีก ${subjects.length - LISTED} เรื่อง`] : [])].join("\n");
    return {
      kind: "ok",
      files: { "index.md": `${md}\n` },
      brief: `- ${head}`,
      items: subjects.length ? [{ key: "update:available", title: `${head} · พิมพ์ "update" หรือ bun twin.ts update`, score: 45 }] : [],
    };
  },
});
