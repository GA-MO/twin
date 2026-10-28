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
    if (!n) return { kind: "ok", files: { "index.md": "# eval กลางคืน\n\nยังไม่เคยรัน: bun twin.ts nightly\n" }, brief: "", items: [] };
    const date = n.at.slice(0, 10);
    const old = (now.getTime() - Date.parse(n.at)) / 86_400_000 > STALE_DAYS;
    const index = [`# eval กลางคืน ${date} · ${Math.round(n.seconds / 60)} นาที${n.worse ? " · แย่ลง" : ""}`, "", ...n.lines.map((l) => (l.startsWith("  ") ? `  - ${l.trim()}` : `- ${l}`)), ""].join("\n");
    const headline = n.lines.filter((l) => !l.startsWith("  ")).slice(0, 2).join(" · ");
    return {
      kind: "ok",
      files: { "index.md": index },
      brief: "",
      items: [
        ...(n.worse ? [{ key: `nightly:worse:${date}`, project: profile.name, title: `eval กลางคืน ${date} แย่ลง: ${headline} (state/nightly/) → พิมพ์ "improve"`, score: 60 }] : []),
        ...(!n.worse && n.incomplete.length ? [{ key: `nightly:incomplete:${date}`, project: profile.name, title: `eval กลางคืน ${date} วัดไม่ครบ ${n.incomplete.length} ข้อ (state/nightly/)`, score: 20 }] : []),
        ...(old ? [{ key: "nightly:stale", project: profile.name, title: `eval กลางคืนไม่ได้รันมาตั้งแต่ ${date}: เครื่องหลับตอนตี 2 หรือยังไม่ได้ setup ใหม่`, score: 15 }] : []),
      ],
    };
  },
});
