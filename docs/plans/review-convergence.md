# Review ที่จบเร็ว และ eval จากงานที่เจ้าของต้องแก้ซ้ำ

ที่มา: บทความ "How the Claude Code team does code review" (claude.dev, 15 ต.ค. 2026) ทีมเขาตั้งเพดานรอบรีวิว แล้วงานที่ผ่านในรอบเดียวขึ้นจาก 65% เป็น 78% ส่วนงานที่ใช้ 5 รอบขึ้นไปลดจาก 8.9% เหลือ 1.5% นอกจากนี้เขาเอา PR ที่เคยทำให้เกิด incident มาเป็นชุด eval ที่ reviewer ต้องรันทุกครั้งที่มีการเปลี่ยนแปลง

ขนาด: กลาง (แก้หลายไฟล์ใน engine) · จบ phase ละหนึ่ง commit · ตรวจ diff สุดท้ายด้วย reviewer อิสระหนึ่งตัว

## ตัดสินไว้แล้ว

- เพดานรีวิวคือ 3 รอบ ตามที่บทความวัดมา
- ไม่แก้ nit ส่วน pre-existing ให้รายงานไว้ ไม่ต้องแก้ (ตรงกับกฎ "โค้ดเก่าไม่ต้องแตะ แค่ list ไว้")
- โค้ดของลูกค้าห้ามอยู่ใน `evals/` เพราะ `evals/` ถูก push ไปให้ owner ทุกคน ของที่มาจากงานจริงต้องเก็บใน `profile/evals/` เท่านั้น
- รอบนี้ทำแค่ replay scenario ส่วนการสร้าง arms fixture จาก repo ลูกค้ายังไม่ทำ (ดูหัวข้อ "ไม่ทำรอบนี้")

## Phase 1: รีวิวมีเพดาน และทุก finding มีป้าย

ไฟล์ที่ต้องแตะ:
- `lib/contract.ts`: เพิ่มกติกาให้ reviewer ของขนาดกลางและใหญ่
  - รีวิวได้ไม่เกิน 3 รอบ
  - ตั้งแต่รอบ 2 ส่ง reviewer แค่ diff ที่เปลี่ยนตั้งแต่รอบก่อน กับรายการ finding เดิม และสั่งห้ามทักซ้ำ
  - reviewer ต้องบอกชนิดของบั๊ก แล้ว worker แก้ให้ครบทุกจุดที่เป็นชนิดนั้น
  - ทุก finding มีป้าย `important`, `nit` หรือ `pre-existing` พร้อม file:line
  - ผ่าน 3 รอบแล้วยังเหลือ `important` ให้หยุด แล้วรายงาน outcome `needs-input` พร้อมคำถามว่าจะเปลี่ยนวิธีหรือไม่
- `lib/dispatch.ts`: เพิ่มฟิลด์ `findings` ใน `Report` แต่ละรายการมี `tag`, `what`, `where` และ `resolution` (`fixed`, `wrong`, `intentional`, `not-worth`) และให้ `StoredReport` ใช้ค่า default เป็น `[]` เพื่อให้อ่าน report เก่าได้
- `collectors/audit.ts`: เพิ่มบรรทัด noise ของ reviewer: นับเฉพาะ run ของเจ้าของ (ไม่รวม eval run): finding แยกตามป้าย, important แยกตาม resolution, ค่าเฉลี่ยรอบรีวิวต่อ turn และ noise = สัดส่วนที่ reviewer ผิด
- `lib/evalgate.ts`: ใส่กฎเพดานรอบลงในรายการ key rule ของ contract
- `.claude/skills/dispatch/SKILL.md`: ฝั่ง gamo ก็มีเพดาน ถ้าส่ง turn แก้ปัญหาเดิมใน run เดียวกันครบ 3 ครั้งแล้ว ให้คิดวิธีใหม่ก่อน ไม่ส่ง turn ที่ 4
- `docs/design.md`: อัปเดตหัวข้อ "Size is review depth" ให้มีเพดานกับป้าย

เช็กว่าเสร็จ:
- `bunx tsc --noEmit -p .` และ `bun test` ผ่าน รวมถึง test ที่ยืนยันว่า report เก่าที่ไม่มี `findings` ยังอ่านได้
- `bun twin.ts eval` ผ่าน
- รัน `evals/arms.ts --isolated --fixtures evals/fixtures-hard --tasks cache-dedupe,duration-parse,api-migration --arms now` ทั้งบน HEAD ก่อนแก้และบนโค้ดหลังแก้ แล้วเทียบสามค่า: hidden tests ต้องไม่ลดลง, จำนวน subagent (คือจำนวนรอบรีวิว) และนาทีต่องานควรลดลง ต้องมีตัวเลขจริงก่อนจะเขียนผลลง design.md

## Phase 2: run ที่เจ้าของต้องแก้ซ้ำกลายเป็น replay scenario

ไฟล์ที่ต้องแตะ:
- `collectors/audit.ts`: ให้ list id ของ run ที่ถูกแตะซ้ำ (มีไฟล์ `touch`) ในช่วงเวลาที่ audit ครอบคลุม พร้อมข้อความที่เจ้าของพิมพ์ตอนแตะ ข้อมูลนี้ `turns()` คำนวณอยู่แล้ว แค่ยังไม่ได้ออกมาเป็นรายการ
- `.claude/skills/improve/SKILL.md`: เพิ่มขั้นในส่วน "Improving" ให้ทุก run ที่ถูกแตะตั้งแต่รอบ improve ก่อน ได้ scenario หนึ่งข้อใน `profile/evals/replay.json` แต่ละข้อมี `context` (สถานการณ์ก่อนที่เจ้าของจะแตะ), `say` และ `want` (สิ่งที่เจ้าของต้องการ ซึ่งอ่านได้จากข้อความที่เขาพิมพ์ตอนแก้) ถ้า run ไหนไม่ควรเป็น scenario ให้เขียนเหตุผลหนึ่งบรรทัดแทน
- `docs/design.md`: เขียนลงหัวข้อ Improve ว่าชุด replay ของ owner โตขึ้นจากงานจริงที่พลาด

เช็กว่าเสร็จ:
- ลองกับ run จริงที่ถูกแตะหนึ่งตัว: ได้ scenario ที่ `replay.ts` อ่านได้ (ผ่าน zod `Scenario`)
- scenario นั้นต้องไม่ผ่านบน commit ก่อนที่จะแก้ปัญหานั้น และผ่านหลังแก้ ถ้าไม่เป็นแบบนี้ แปลว่า `want` เขียนไม่ตรงกับสิ่งที่เจ้าของต้องการจริง
- `bun twin.ts eval` ผ่าน

## ไม่ทำรอบนี้

- สร้าง arms fixture จาก repo ลูกค้า (ย่อ repo ให้เหลือเท่าที่ทำซ้ำบั๊กได้ และเขียน hidden test) งานนี้ต้องให้ `lib/evalgate.ts` และ `arms.ts` อ่าน `profile/evals/fixtures*` ได้ด้วย ควรเป็น run แยก
- เทียบ `/code-review` ที่มากับ Claude Code กับ thermo-nuclear reviewer ใน `arms.ts` ทำเป็น run แยกเพราะเป็นงานสร้างเครื่องมือวัด
