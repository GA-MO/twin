# หน้า docs: งานหนึ่งชิ้น เล่าจากฝั่งคุณและฝั่งเบื้องหลัง


ที่มา: เจ้าของ 24 พ.ย. "มือใหม่มีคำถามและอยากเห็นแบบละเอียด" แล้ว "อ่านแล้วยังไม่เข้าใจว่าอยู่ๆไปโหลด skill dispatch ได้ไง ... เอาให้ละเอียดแต่ไม่เยอะจนต้องอ่านจนตาลายหรือมีกดดูรายละเอียดแต่ละจุด"

## แนวที่ตกลงแล้ว
- แบบเรื่องราว: แต่ละฉากเริ่มจากแชทที่คุณเห็น ตามด้วยเบื้องหลังเรียงตามเวลา (ต้นแบบ `.twin-scratch/walk/e-story-iso.html`)
- rail ขวา: กล่อง "ตอนนี้อยู่ที่" กับรายการฉาก ไม่มีภาพ iso (เจ้าของตีกลับ: "มีมาก็ไม่ได้ช่วยอะไร")
- ทุกเหตุการณ์บอก 1 บรรทัดว่าใครทำ และป้ายว่า **บังคับ** (hook, engine, scheduler ทำแน่นอน) หรือ **model ตัดสินเอง** (พลาดได้ พร้อมตัวเลขที่วัดได้ เช่น dispatch 427/1,371 คำสั่งรันโดยไม่ได้โหลด skill)
- ปิดไว้ก่อน กดเปิดดูรายละเอียดทีละจุด: ข้อความจริงที่ model เห็นก่อนตัดสิน, ข้อความที่ส่งต่อ, ไฟล์และคำสั่ง, ทำไม
- ข้อความทุกชิ้นมาจาก run จริงของ fixture `confirm-dialog` (ไม่มีข้อมูลลูกค้า) ผ่าน script ที่รันซ้ำได้ ไม่เขียนมือ

## Phase 1 โน้ตของ project เข้าไฟล์สถานะของ project
skill dispatch บังคับให้อ่าน `state/projects/<name>.md` อยู่แล้ว แต่ไฟล์นั้นไม่มีโน้ต collector `projects` ใส่โน้ตที่ยังเปิดและมี `project:` ตรงกัน (todo, feedback, decision) ลงไปด้วย
เสร็จเมื่อ: โน้ต feedback ที่มี `project: X` ขึ้นใน `state/projects/X.md` หลัง `sync projects` และ test ผ่าน

## Phase 2 บันทึก run จริงหนึ่งรอบ
session gamo แบบ headless (`claude -p --output-format stream-json`) ในเครื่องนี้รับคำสั่งบรรทัดเดียวเกี่ยวกับ repo ของ fixture แล้ว dispatch จริง เก็บ stream ของ session, `runs/<id>/` ทุก turn และ `closed.md`
เสร็จเมื่อ: มี stream ของ session ที่เห็นการโหลด skill, การอ่านไฟล์, brief ที่ส่ง และ run ที่จบด้วยการปิด

## Phase 3 script แปลงข้อมูล
`site/scripts/walkthrough.ts` อ่านไฟล์จาก Phase 2 แล้วเขียน `site/app/walkthrough.generated.json` (ฉาก → เหตุการณ์: actor, ป้าย บังคับ/model, เวลา, หัวเรื่อง, รายละเอียดที่กางได้) ตัด path ส่วนตัวออก
เสร็จเมื่อ: รัน script ซ้ำได้ผลเท่าเดิม และไม่มี path ของเครื่องหรือชื่อคนใน JSON

## Phase 4 component และหน้า
`<Walkthrough lang>` ใช้ token ของ site (figures.css) หน้า `concepts/walkthrough.mdx` และ `.th.mdx` อยู่ใน meta.json ถัดจาก Dispatch
เสร็จเมื่อ: build ผ่าน หน้าเปิดได้ทั้งสองภาษา

## Phase 5 ตรวจ
ภาพ 375/768/1280, กดเปิดทุกรายละเอียด, ข้อความไทยไม่ล้นกล่อง, reduced motion, ผู้ตรวจอิสระอ่าน diff และภาพเทียบกับ taste

## อัดใหม่เมื่อ engine เปลี่ยน
1. สร้าง repo ตัวอย่างจาก `evals/fixtures-ui/confirm-dialog/repo` ใน devRoot พร้อม origin แบบ bare ใน `.twin-scratch/`
2. `claude -p "<คำขอบรรทัดเดียว>" --session-id <id> --output-format stream-json --verbose --permission-mode auto --permission-prompts none --append-system-prompt "...use a run slug that starts with eval-..."` ใน repo นี้ แล้ว `--resume <id>` ด้วย "ปิดงานได้"
3. คัด transcript ของ session (`~/.claude/projects/<repo>/<id>.jsonl` เป็น `gamo.jsonl`), ของ worker (`worker.jsonl`) และ `cp -Rp runs/<id> run` ลงโฟลเดอร์เดียว ชุดที่หน้าใช้อยู่ตอนนี้คือ `.twin-scratch/walk/rec` (gitignored อยู่แค่เครื่องนี้) แก้ข้อความใน script แล้วรันกับโฟลเดอร์นี้ได้เลยโดยไม่ต้องอัดใหม่
4. `cd site && bun scripts/walkthrough.ts <โฟลเดอร์>` ถ้าเรื่องเปลี่ยน script จะบอกขั้นที่หาไม่เจอ และไม่เขียนไฟล์ถ้าเจอข้อมูลส่วนตัวหรือชื่อ project ของเจ้าของ
5. ลบ repo ตัวอย่าง origin และ branch ของมันตาม path ที่สร้าง

อัดใหม่แล้วเรื่องอาจไม่เหมือนเดิม model ตัดสินต่างกันได้ทุกรอบ และ session ใหม่อ่าน journal เจอ run ก่อนหน้าของ repo ตัวอย่าง (25 พ.ย.: nok รู้เรื่องบั๊ก focus จาก journal ไม่มี followup และปิดงานเองโดยไม่รอคุณ) ถ้าอยากเก็บเรื่องเดิมแต่ได้ของใหม่ ให้ copy ไฟล์จาก run ใหม่ลง `cmd/` ในโฟลเดอร์บันทึก พร้อม `cmd/from` ที่เป็น id ของ run นั้น script จะใช้ `cmd/` เฉพาะตอนที่ run หลักไม่มีไฟล์นั้น และบอกในหน้าว่ามาจาก run ไหน ตอนนี้ `command.json` กับ `verify-command.json` มาจาก run `1125-1100-files-admin-eval-esc-confirm-dialog` เพราะ run หลักเกิดก่อนที่ engine จะบันทึกคำสั่ง flag ของ worker เหมือนกันเพราะ `lib/dispatch.ts` ไม่เปลี่ยนระหว่างสอง run ต่างกันแค่ id ชื่อ session และ path
