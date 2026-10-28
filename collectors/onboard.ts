import { existsSync, readFileSync } from "node:fs";
import { defineCollector, type AttentionItem } from "../lib/collector.ts";
import { LAYERS, readIdentity, todaysQuestions } from "../lib/identity.ts";
import { INTERVIEW_FILE } from "../lib/profile.ts";

const answered = () => (existsSync(INTERVIEW_FILE) ? readFileSync(INTERVIEW_FILE, "utf8").match(/^ตอบ:\s*\S/gm)?.length ?? 0 : 0);

export default defineCollector({
  title: "ตัวตน",
  order: 1,
  everyMinutes: 1,
  keep: "snapshot",
  defaultOn: true,
  refreshOnBrief: true,
  async run({ now, profile }) {
    const id = readIdentity();
    const problems: AttentionItem[] = id.problems.map((p, i) => ({ key: `onboard:bad:${i}`, title: `⚠ ไฟล์ตัวตนอ่านไม่ได้: ${p}`, score: 60 }));
    if (!profile.onboarded) {
      const n = answered();
      const title = n
        ? `onboard ค้างอยู่ (ตอบแล้ว ${n} ข้อ): ตอบคำถามล่าสุดต่อได้เลย หรือพิมพ์ onboard`
        : `ยังไม่ได้ onboard: พิมพ์ onboard ให้ ${profile.name} รู้จักคุณ (เริ่มได้ใน 10 นาที หยุดได้ทุกเมื่อ)`;
      return { kind: "ok", files: { "index.md": `${title}\n` }, brief: `- ${title}`, items: [{ key: "onboard", title, score: 95 }, ...problems] };
    }
    const today = now.toLocaleDateString("sv-SE");
    const picks = todaysQuestions(id.coverage, today);
    const line = picks.length ? `${profile.name} อยากรู้จักคุณเพิ่ม ${picks.length} เรื่อง: ${picks.map((r) => `${LAYERS[r.layer]}/${r.topic}`).join(" · ")} · พิมพ์ "ถามฉันหน่อย"` : "";
    return {
      kind: "ok",
      files: { "index.md": `onboard แล้ว ${profile.onboarded}\n${line}\n` },
      brief: line ? `- ${line}` : "",
      items: [...(line ? [{ key: `onboard:deepen:${today}`, title: line, score: 15 }] : []), ...problems],
    };
  },
});
