# ประตูปิด run: ledger ต่อข้อ และผู้ตรวจอิสระ

ที่มา: research 23 พ.ย. 2026 (note ของเจ้าของ agent-adherence-research รอบ 2)
- กฎที่เขียนเป็นข้อความ แม้จะอยู่ใน context ครบ ก็ยังถูกข้ามได้ งาน arXiv 2611.10884 (7 พ.ย. 2026) วัด compliance ได้ดังนี้
  - สั่งใน prompt 11.9%
  - ใส่ใน system prompt 20.1%
  - เตือนซ้ำทุกรอบ 48.6%
  - state machine ที่บังคับจากข้างนอก 94.8%
- ตัวตรวจที่อยู่ใน context เดียวกับงานที่ตัวเองทำ จับผิดได้แย่ลง: AUROC 0.99 → 0.89 (2603.04582)
- judge ที่ดูแค่รายงานสุดท้าย พลาด fault ที่ไม่เปลี่ยนคำตอบ (2609.00038)
- ทีม Claude Code ทำ commit gate ที่มีโหมด off, observe และ enforce ("How the Claude Code team thinks about verification", claude.dev, 16 พ.ย. 2026)
  - "If a change can modify the check that judges it, the check is broken"
  - ถ้ายังไม่ผ่านหลัง 3 รอบ ให้หยุดแล้วเรียกคน
- model ตรวจ UI แจ้งผิดว่ามีปัญหา 18–62% บนภาพที่ไม่มีปัญหาจริง (ScreenProof, 2611.10234) ดังนั้นต้องเทียบผู้ตรวจกับคำตัดสินของเจ้าของก่อนจะให้มันบล็อกอะไร

ปัญหาที่ plan นี้แก้: สองเรื่องที่ reflect เจอซ้ำมากที่สุดใน 14 วัน (7 ครั้งเท่ากัน) คือ
- รายงานว่าเสร็จโดยไม่ได้ตรวจทีละข้อบนของจริง
- ผ่านงาน UI โดยไม่มีผู้ตรวจอิสระ

ทั้งสองเรื่องเขียนไว้ใน mode แล้ว แต่ไม่มีอะไรบังคับ

ขนาด: ใหญ่ (เพิ่ม module ใหม่ lib/verify.ts ที่เชื่อมกับ dispatch, contract และ audit)
- ก่อนเขียนโค้ดของ phase 2 ให้ทำ architect ก่อน
- 1 run ทำได้ไม่เกิน 1–2 phase
- จบ phase ละ 1 commit
- ก่อนจะถือว่าเสร็จ ต้องให้ reviewer อิสระตรวจ diff สุดท้าย

## ค่าเริ่มต้นที่เลือกไว้ (เจ้าของสั่งเปลี่ยนได้)

- ข้อที่ต้องตรวจมาจาก brief ไม่ใช่จาก worker
  - ตอน `start` engine แยกบรรทัด `เสร็จเมื่อ`, `คงไว้` และ `อาการ` ออกเป็นข้อ แต่ละข้อมีเลข แล้วเก็บไว้ใน run.json
  - worker แก้รายการข้อนี้ไม่ได้
- ผู้ตรวจเป็น `claude -p` อีก session ที่ context ใหม่ engine เป็นคนเรียก
  - worker ไม่ได้เป็นคน spawn และ session ของ gamo ไม่ได้เป็นคนตรวจ
  - ผู้ตรวจเห็นแค่ข้อจาก run.json, ledger, ไฟล์หลักฐาน, diff และสำหรับงาน UI ก็เห็น taste.md ด้วย
  - ผู้ตรวจไม่เห็น did/verified ของ worker
  - prompt ของผู้ตรวจอยู่ใน engine จึงอยู่นอก worktree ที่ worker แก้ได้
- งานชนิด ui ทุกชนิด ผู้ตรวจต้องเปิดหน้าจริงเองผ่าน browser capability ของ profile
  - เปิด 1 จอหลัก ที่ 1280 และ 375
  - ไม่ได้เชื่อแค่ภาพที่ worker ส่งมา
- เริ่มที่โหมด observe: บันทึกผลและแสดงผล แต่ไม่บล็อก
  - เลื่อนเป็นโหมด enforce เมื่อวัดได้ตามเกณฑ์ใน phase 3
  - ใน enforce ถ้าข้อไหนไม่ผ่าน จะส่ง turn ให้แก้ ได้สูงสุด 3 รอบ จากนั้นเป็น `needs-input` ถึงเจ้าของ
- ไม่ทำรอบนี้:
  - บันได /correct ใน improve
  - verify skill และ feature map ต่อโปรเจกต์
  - ตัดสินระดับรีวิวจาก diff
  - ป้าย run 4 แบบ
  - ตัด mode ให้สั้นลง

## Phase 1: ledger ต่อข้อ (deterministic, บังคับทันที)

ไฟล์ที่ต้องแตะ:
- `lib/briefs.ts`: เพิ่มฟังก์ชันที่แยกบรรทัด `เสร็จเมื่อ`, `คงไว้` และ `อาการ` ออกเป็น `Ask[]`
  - shape: `{ id: "a1", from: "เสร็จเมื่อ" | "คงไว้" | "อาการ", text }`
  - แยกตามบรรทัดย่อยหรือ bullet ถ้าบรรทัดเดียวมีหลายข้อในประโยคเดียว ให้นับเป็นข้อเดียว
- `lib/dispatch.ts`
  - `Run` มี `asks`
  - `Report` มี `ledger`: `{ ask: id, where, how, evidence, result: "pass" | "fail" | "not-checked" }[]`
  - `StoredReport` ใช้ default `[]` เพื่อให้ run เก่ายังอ่านได้
  - ใน `CHECKS` เพิ่มเงื่อนไข: ถ้า outcome เป็น `done` แต่มีข้อไหนไม่มีแถว หรือแถวนั้นไม่มี evidence ที่เป็นไฟล์จริงใน worktree หรือค่าที่วัดได้ ให้เข้าคิว turn ตรวจ เหมือนที่ทำกับ `clicked` อยู่แล้ว
- `lib/contract.ts`: เพิ่มกฎหนึ่งย่อหน้า: ทุกข้อของ run ต้องมีแถวใน ledger, evidence ต้องชี้ไปที่ภาพหรือค่าที่วัดจริง และข้อไหนยังไม่ได้ตรวจให้เขียน `not-checked` ห้ามเขียนว่าผ่าน
- `.claude/skills/dispatch/SKILL.md`: ตอนรายงานเจ้าของ ให้ใช้ ledger เป็น checklist ทีละข้อ
- ทดสอบใน `test/dispatch.test.ts`
  - brief 3 ข้อได้ asks 3 ข้อ
  - report ที่ขาดหนึ่งข้อทำให้เกิด turn ตรวจ
  - report เก่าที่ไม่มี ledger ยังอ่านได้

เช็กว่าเสร็จ:
- `bunx tsc --noEmit -p .` ผ่าน, test ที่แตะผ่าน และ `bun twin.ts eval` ผ่าน
- run จริงครั้งถัดไปของเจ้าของมี ledger ครบทุกข้อของ brief โดยเช็กจาก run.json และ result.json ของ turn

## Phase 2: ผู้ตรวจอิสระ โหมด observe

ไฟล์ที่ต้องแตะ:
- `lib/verify.ts` (ใหม่)
  - prompt ของผู้ตรวจ
  - schema ของคำตัดสิน: `{ ask, verdict: "pass" | "fail" | "unsupported", reason, looked_at }[]`
  - ฟังก์ชันที่รวบรวม input จาก run.json, ledger, ไฟล์หลักฐาน, `git diff base...HEAD` และ taste.md สำหรับงาน ui
- `lib/dispatch.ts`: ใน chain ของ `spawnTurn` เพิ่ม `_verify` ต่อจาก `_clickcheck` โดยรันเฉพาะ turn ที่ outcome เป็น `done` และ ledger ครบแล้ว ผลเขียนลง `turn-N/verify.json`
- `twin.ts`: เพิ่มคำสั่งภายใน `_verify <id>`
- `collectors/runs.ts` และ `mods/twin/hooks/model.ts`: แสดง "ตรวจอิสระ x/y" ต่อ run ถ้ายังไม่ได้ตรวจให้ขึ้นว่า "ยังไม่ได้ตรวจอิสระ"
- `.claude/skills/dispatch/SKILL.md`: gamo ยกบรรทัดผลตรวจอิสระมาตรงๆ และห้ามบอกเจ้าของว่า "ผ่าน" ถ้าไม่ได้ผ่านทุกข้อ
- `collectors/audit.ts`: ตั้งแต่ run แรกที่มี verify.json ให้นับต่อ run ของเจ้าของ
  - เจ้าของส่ง run กลับ แล้วผู้ตรวจเคยตีข้อนั้นว่า fail หรือไม่ (จับได้)
  - เจ้าของรับ run โดยไม่แตะ แต่ผู้ตรวจตี fail (แจ้งผิด)
- `docs/design.md`: เพิ่มหัวข้อประตูปิด run และเพิ่มบรรทัดใน Changes since

เช็กว่าเสร็จ:
- replay ด้วย run เก่า 6 run
  - 3 run ที่เจ้าของส่งกลับ ดูว่าผู้ตรวจตี fail ตรงข้อที่เจ้าของบ่นหรือไม่
  - 3 run ที่เจ้าของรับโดยไม่แตะ ดูว่าแจ้งผิดกี่ข้อ
  - บันทึกตัวเลขทั้งสองลง design.md ก่อน merge
- ในโหมด observe เวลาที่เพิ่มต่อ turn ไม่บล็อกการแจ้งว่าจบ turn และวัดจาก `_done` ที่ยังมาตามปกติ

## Phase 3: enforce เมื่อวัดได้ตามเกณฑ์

เกณฑ์เลื่อนเป็นโหมด enforce (อ่านจาก audit):
- มี run ของเจ้าของที่ผ่านโหมด observe แล้วอย่างน้อย 10 run
- ข้อที่เจ้าของส่งกลับ ผู้ตรวจจับได้ก่อนอย่างน้อย 70%
- ข้อที่ผู้ตรวจตี fail แต่เจ้าของรับไปโดยไม่แตะ ไม่เกิน 20%

ถ้ายังไม่ถึงเกณฑ์ ให้ปรับ prompt ของผู้ตรวจจากเคสที่พลาด แล้ววัดใหม่ด้วยชุด replay ของ phase 2

ไฟล์ที่ต้องแตะ:
- `lib/profile.ts`: เพิ่ม key `runGate=off|observe|enforce` โดย default เป็น `observe`
- `lib/dispatch.ts`: ในโหมด enforce ถ้ามีข้อที่ `fail` หรือ `unsupported` ให้เข้าคิว turn พร้อมเหตุผลของผู้ตรวจ ถ้าไม่ผ่านครบ 3 รอบให้เป็น `needs-input` ถึงเจ้าของ พร้อมรายการข้อที่ยังไม่ผ่าน
- `collectors/audit.ts`: ใน main number แยกแสดง run ที่ปิดผ่านประตูกับ run ที่ไม่ผ่าน

เช็กว่าเสร็จ:
- test ใน `test/dispatch.test.ts`
  - fail ทำให้เกิด turn ตรวจ
  - ครบ 3 รอบแล้วเป็น needs-input
  - โหมด off ไม่ทำอะไรเลย
- หลังเปิดใช้ 2 สัปดาห์ สัดส่วน run ที่เจ้าของไม่ต้องแตะใน audit ต้องขยับขึ้นเกินระดับที่แกว่งปกติ ถ้าไม่ขยับให้รายงานตามจริง
