import { defineCollector } from "../lib/collector.ts";
import { readNightly } from "../lib/evalgate.ts";

const STALE_DAYS = 3;

export default defineCollector({
  title: "eval กลางคืน",
  order: 95,
  everyMinutes: 60,
  inBrief: false,
  keep: "snapshot",
  defaultOn: true,
  async run({ now, profile }) {
    const n = readNightly();
    if (!n)
      return {
        kind: "ok",
        files: { "index.md": "# eval กลางคืน\n\nยังไม่เคยรัน\n" },
        brief: "",
        items: [{ key: "nightly:never", project: profile.name, title: "eval กลางคืนยังไม่เคยรัน: bun twin.ts setup ลงตารางเวลา 02:30 ให้ (ไม่มีมัน ไม่มีใครบอกได้ว่า improve ทำให้ดีขึ้นหรือแย่ลง)", score: 15 }],
      };
    const date = n.at.slice(0, 10);
    const old = (now.getTime() - Date.parse(n.at)) / 86_400_000 > STALE_DAYS;
    const index = [
      `# eval กลางคืน ${date} · ${Math.round(n.seconds / 60)} นาที${n.worse ? " · แย่ลง" : ""}`,
      "",
      ...n.lines.map((l) => (l.startsWith("  ") ? `  - ${l.trim()}` : `- ${l}`)),
      ...(n.open.length ? ["", "## ยังแย่ลงอยู่ (จนกว่ารอบที่วัดใหม่จะไม่แย่ลง)", ...n.open.map((o) => `- ${o}`)] : []),
      "",
    ].join("\n");
    return {
      kind: "ok",
      files: { "index.md": index },
      brief: "",
      items: [
        ...n.open.map((o) => ({ key: `nightly:open:${o.slice(0, 10)}`, project: profile.name, title: `eval กลางคืนแย่ลง ${o} (state/nightly/) → พิมพ์ "improve"`, score: 60 })),
        ...(n.incomplete.length ? [{ key: `nightly:incomplete:${date}`, project: profile.name, title: `eval กลางคืน ${date} วัดไม่ครบ ${n.incomplete.length} ข้อ รอบหน้าวัดต่อ (state/nightly/)`, score: 20 }] : []),
        ...(old ? [{ key: "nightly:stale", project: profile.name, title: `eval กลางคืนไม่ได้รันมาตั้งแต่ ${date}: เครื่องหลับตอนตี 2 หรือยังไม่ได้รัน setup ใหม่`, score: 15 }] : []),
      ],
    };
  },
});
