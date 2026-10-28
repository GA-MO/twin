import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START = Date.parse("2026-09-14T00:00:00+07:00");
const at = (day: number, hour: number, minute = 0) => new Date(START + day * 86_400_000 + (hour * 60 + minute) * 60_000).toISOString();
const isWeekend = (day: number) => [0, 6].includes(new Date(START + day * 86_400_000).getDay());

const BOSS: { name: string; day: number; hour: number; messages: string[] }[] = [
  { name: "จัดลำดับงานทีม dev สัปดาห์นี้", day: 0, hour: 21, messages: ["ช่วยจัดลำดับงานให้หน่อย ทีมมี 4 คน แต่มี 3 ลูกค้าขอพร้อมกัน ลูกค้า A bug บน prod ยังใช้ได้ ลูกค้า B มี milestone ศุกร์", "ขอเป็นตารางสั้นๆ ใครทำอะไรวันไหน"] },
  { name: "ร่างอีเมลแจ้งเลื่อนส่งงาน", day: 2, hour: 10, messages: ["ร่างอีเมลแจ้งลูกค้าว่ารายงานเลื่อนเป็นวันจันทร์ บรรทัดแรกบอกวันใหม่เลย ขอโทษไว้ท้ายสั้นๆ", "สั้นกว่านี้อีก ไม่เกิน 4 บรรทัด"] },
  { name: "เรียน AI coding สำหรับหัวหน้าทีม", day: 6, hour: 20, messages: ["อยากเข้าใจว่า AI coding tool อย่าง Claude Code ช่วยทีม dev ได้แค่ไหน อธิบายแบบคนไม่ได้เขียน code ทีละขั้น", "ยกตัวอย่างงานจริงในบริษัท software house ให้หน่อย", "แล้วจะวัดผลยังไงว่าทีมเร็วขึ้นจริง"] },
  { name: "เกณฑ์สัมภาษณ์ junior dev", day: 8, hour: 14, messages: ["ช่วยทำเกณฑ์สัมภาษณ์ junior dev รอบสุดท้าย เน้นเรียนรู้เร็วกับสื่อสาร ไม่เน้นท่องจำ"] },
  { name: "ลูกค้าขอเพิ่ม scope", day: 9, hour: 11, messages: ["ลูกค้าขอเพิ่มหน้ารายงานอีกหน้า อยากได้พร้อมงานศุกร์ ช่วยร่างตอบว่าส่งงานเดิมตามนัด หน้าใหม่เป็นรอบถัดไป ไม่ต้องใส่ราคา เดี๋ยวคุยเอง"] },
  { name: "ตารางซ้อมฮาล์ฟมาราธอน", day: 13, hour: 6, messages: ["ช่วยวางตารางซ้อมฮาล์ฟมาราธอน 12 สัปดาห์ วิ่งได้แค่เช้าวันธรรมดา 3 วันกับเสาร์ยาว", "อธิบายละเอียดหน่อยว่า tempo run ต่างจาก easy run ยังไง"] },
  { name: "สรุปหนังสือ Radical Candor", day: 14, hour: 22, messages: ["สรุปหนังสือ Radical Candor เป็นข้อคิดที่เอาไปใช้คุยกับลูกทีมได้จริง ทีละบท", "บทไหนเหมาะกับการให้ feedback junior ที่ติดงาน"] },
  { name: "แผนงานไตรมาสหน้า", day: 21, hour: 21, messages: ["วันอาทิตย์นี้ขอเตรียมแผนไตรมาสหน้าก่อนประชุม CEO วันจันทร์ ช่วยร่างโครง 1 หน้า", "ตัวเลขก่อน คำอธิบายทีหลัง"] },
  { name: "OT ทีม B", day: 23, hour: 17, messages: ["ทีม B OT มาสองสัปดาห์แล้ว ช่วยคิดว่าจะตัด scope อะไรได้บ้างโดยไม่ผิดสัญญา ไม่อยากให้ใครหมดไฟอีก"] },
  { name: "เรียน prompt สำหรับงานบริหาร", day: 27, hour: 20, messages: ["สอนเขียน prompt ให้ AI สรุปประชุมให้ตรงใจ ทีละขั้น พร้อมตัวอย่างดีกับไม่ดี", "ลองเขียนให้ดูอีกแบบที่เน้น action item"] },
  { name: "ทบทวนสัญญาลูกค้าใหม่", day: 28, hour: 21, messages: ["วันอาทิตย์อีกแล้ว ช่วยอ่านข้อสัญญาส่วน change request ให้หน่อยว่ามีช่องให้ลูกค้าขอเพิ่มฟรีไหม"] },
  { name: "จัดคนเข้าโปรเจกต์ใหม่", day: 30, hour: 9, messages: ["มีโปรเจกต์ใหม่เริ่มเดือนหน้า ควรให้ junior คนไหนไปเรียนรู้กับ senior ช่วยเทียบตัวเลือกให้ ไม่ต้องตัดสินแทน"] },
  { name: "อาหารก่อนวิ่ง", day: 34, hour: 7, messages: ["ก่อนวิ่งยาว 18 กม. ควรกินอะไร อธิบายเหตุผลด้วย"] },
  { name: "สรุปข่าว AI ประจำสัปดาห์", day: 35, hour: 21, messages: ["สรุปข่าว AI ที่เกี่ยวกับการบริหารทีม software สัปดาห์นี้ 3 เรื่องพอ", "เรื่องไหนน่าลองกับทีมเราที่สุด"] },
];

export function bossExport(file: string) {
  const conversations = BOSS.map((c, i) => ({
    uuid: `conv-${i}`,
    name: c.name,
    created_at: at(c.day, c.hour),
    updated_at: at(c.day, c.hour, 30),
    chat_messages: c.messages.flatMap((text, j) => [
      { uuid: `m-${i}-${j}-h`, sender: "human", text, created_at: at(c.day, c.hour, j * 6), content: [{ type: "text", text }] },
      { uuid: `m-${i}-${j}-a`, sender: "assistant", text: "(คำตอบของ Claude)", created_at: at(c.day, c.hour, j * 6 + 2), content: [{ type: "text", text: "(คำตอบของ Claude)" }] },
    ]),
  }));
  writeFileSync(file, JSON.stringify(conversations, null, 2));
}

const DEV_WORK = [
  "เพิ่ม endpoint GET /orders/:id ใน shop-api ใช้ sqlc ไม่เอา ORM",
  "refactor service order ให้แยก repository ไม่ต้องถาม ทำเลย",
  "เขียน test ของ checkout ใช้ testcontainers postgres อย่า mock db",
  "สั้นๆ พอ ไม่ต้องอธิบาย",
  "commit แยกทีละเรื่องนะ อย่ารวม",
  "migration เพิ่ม column ถามก่อนนะ อย่ารันเอง",
  "ห้าม push main เด็ดขาด push branch ตัวเองพอ",
  "ดู issue SHOP-142 ใน Linear แล้วแก้ให้หน่อย",
  "ร่างข้อความ Slack ให้ทีมว่า deploy staging เสร็จแล้ว สั้นๆ",
  "ไม่ใช่ ผมบอกแล้วว่าไม่เอา ORM",
  "แก้ lint ทั้ง repo ไม่ต้องถาม",
  "เพิ่ม index ให้ query orders by customer ช้า ขอ EXPLAIN ก่อนแก้",
  "ทำไม test flaky ลองหาสาเหตุจาก log ก่อน อย่าเดา",
  "review PR นี้ให้หน่อย เน้น error handling",
];
const DEV_LEARN = [
  "ผมกำลังเรียน Rust อธิบาย ownership ละเอียดทีละขั้นพร้อมตัวอย่าง",
  "ทำไม borrow checker ฟ้องตรงนี้ อธิบายแบบคนเพิ่งเริ่ม",
  "ช่วยวางตารางซ้อม bouldering สัปดาห์ละ 3 วันหลังเลิกงาน",
  "แนะนำ blog หรือ newsletter เรื่อง database internals ที่ควรตาม",
];

const line = (o: Record<string, unknown>) => JSON.stringify(o);

export function devTranscripts(claudeProjects: string, devRoot: string) {
  const sessions = new Map<string, string[]>();
  const push = (project: string, day: number, entry: Record<string, unknown>) => {
    const key = `${project}:${day}`;
    sessions.set(key, [...(sessions.get(key) ?? []), line(entry)]);
  };
  let w = 0;
  let l = 0;
  for (let day = 0; day < 36; day++) {
    const project = isWeekend(day) ? "rust-playground" : "shop-api";
    const count = isWeekend(day) ? 3 : 6;
    for (let k = 0; k < count; k++) {
      const text = isWeekend(day) ? DEV_LEARN[l++ % DEV_LEARN.length]! : DEV_WORK[w++ % DEV_WORK.length]!;
      push(project, day, { type: "user", timestamp: at(day, isWeekend(day) ? 10 + k : 9 + k * 2), cwd: join(devRoot, project), entrypoint: "cli", message: { role: "user", content: text } });
    }
    push(project, day, { type: "user", timestamp: at(day, 18), cwd: join(devRoot, project), entrypoint: "cli", message: { role: "user", content: "<system-reminder>ignored</system-reminder>" } });
    push(project, day, { type: "user", timestamp: at(day, 18, 5), cwd: join(devRoot, project), entrypoint: "cli", isSidechain: true, message: { role: "user", content: "subagent prompt, not the owner" } });
  }
  push("shop-api", 3, { type: "user", timestamp: at(3, 20), cwd: join(devRoot, "shop-api", ".claude/worktrees/twin-x"), entrypoint: "sdk-cli", message: { role: "user", content: "worker brief, not the owner" } });
  for (const [key, lines] of sessions) {
    const [project, day] = key.split(":") as [string, string];
    const dir = join(claudeProjects, join(devRoot, project).replace(/[^A-Za-z0-9]/g, "-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `session-${day.padStart(2, "0")}.jsonl`), `${lines.join("\n")}\n`);
  }
}

if (import.meta.main) {
  const [kind, a, b] = process.argv.slice(2);
  if (kind === "boss" && a) bossExport(a);
  else if (kind === "dev" && a && b) devTranscripts(a, b);
  else throw new Error("ใช้: bun evals/fixtures/history.ts boss <conversations.json> | dev <~/.claude/projects> <devRoot>");
}
