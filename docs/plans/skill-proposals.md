# เสนอ skill จากงานที่เจ้าของสั่งซ้ำ และเขียนตาม best practice

ค้าง: Phase 1 ตัวตรวจ skill ตามกฎของ Anthropic
ค้าง: Phase 2 eval ว่าเรียก skill ถูกตัว
ค้าง: Phase 3 ตัวหางานที่สั่งซ้ำ เสนอใน brief
ค้าง: Phase 4 สร้าง skill เมื่อเจ้าของตอบตกลง
ค้าง: Phase 5 ตัด mode ที่โหลดทุก session ให้เหลือแต่แกน
ค้าง: Phase 6 reflect นับว่า worker เปิดไฟล์ไหนของ skill

ที่มา: คู่มือ "Skill authoring best practices" ของ Anthropic (platform.claude.com, อ่าน 24 พ.ย. 2026) และคำถามของเจ้าของวันเดียวกัน: "twin ควร proactive แนะนำให้สร้าง skill ได้เอง ... ตอนนี้คือต้องรอให้ user คิดออกเองว่าอะไรควรสร้างเป็น skill"

สิ่งที่คู่มือกำหนด (ใช้เป็นเกณฑ์ทั้ง plan):
- `name` ยาวไม่เกิน 64 ตัว ใช้ได้แค่ a-z 0-9 - ห้ามมีคำว่า anthropic หรือ claude
- `description` ยาว 1–1,024 ตัว บอกทั้งว่าทำอะไรและใช้เมื่อไร เขียนบุรุษที่ 3 Claude ใช้ช่องนี้ช่องเดียวเลือกว่าจะเรียก skill ไหน
- เนื้อ SKILL.md ไม่เกิน 500 บรรทัด ไฟล์อ้างอิงลึกได้ชั้นเดียว ไฟล์อ้างอิงที่ยาวเกิน 100 บรรทัดต้องมีสารบัญ
- เขียน eval อย่างน้อย 3 ข้อก่อนเขียน skill และวัดผลตอนไม่มี skill ไว้เป็นฐาน
- ดูว่า agent เปิดไฟล์ไหน ไฟล์ที่ไม่เคยถูกเปิดให้ลบหรือชี้ทางให้ชัดขึ้น ไฟล์ที่ถูกเปิดซ้ำให้ย้ายขึ้นมาไว้ใน SKILL.md

สิ่งที่มีอยู่ตอนนี้ (วัดเมื่อ 24 พ.ย.):
- skill 9 ตัว (engine 6 ตัว, profile 3 ตัว) ทุกตัวยาวไม่เกิน 120 บรรทัด description ยาวไม่เกิน 503 ตัว
- description ของ `mac` (profile) กับ `computer` (engine) ระบุงานชุดเดียวกัน คือ Reminders, Calendar, Notes, Mail drafts
- reflect มี route `skill` แต่จะเสนอเฉพาะตอนแก้ความผิดพลาดซ้ำ ยังไม่มีส่วนไหนดูงานที่สั่งซ้ำ
- eval ใน `evals/` วัดผลงานของ worker บน fixture อย่างเดียว ไม่มีข้อไหนวัดว่าเรียก skill ถูกตัว
- `state/mode.md` ยาว 221 บรรทัด 33 KB และโหลดทุก session
- ข้อความของเจ้าของ 3,000 ชิ้นใน `state/history/messages.jsonl` (อยู่ใน repo gamo 1,490 ชิ้น) เป็นแหล่งที่เจ้าของยินยอมแล้ว

ขนาด: ใหญ่ (collector ใหม่, eval ใหม่, แตะ improve, brief และ reflect)
- ก่อนเขียนโค้ดของ Phase 3 ให้ทำ architect ก่อน
- 1 run ทำได้ไม่เกิน 1–2 phase จบ phase ละ 1 commit
- ก่อนจะถือว่าเสร็จ ต้องให้ reviewer อิสระตรวจ diff สุดท้าย
- เป็นงาน engine ทุกเจ้าของได้ใช้ ส่วน skill ที่สร้างให้เจ้าของลง `profile/skills/` เสมอ

## ค่าเริ่มต้นที่เลือกไว้ (เจ้าของสั่งเปลี่ยนได้)

- เสนอเฉพาะงานหลายขั้นตอนที่สั่งซ้ำอย่างน้อย 3 ครั้งใน 30 วัน และไม่มี skill ตัวไหนรับงานนั้นอยู่ (ตัดสินด้วย eval ของ Phase 2 ไม่ใช่การอ่าน description เอง) ตัวเลข 3/30 เป็นค่าตั้งต้นที่ยังไม่ได้วัด Phase 3 ต้องลองกับข้อความจริงก่อนตั้งค่าจริง
- งานที่รันคำสั่งเดิมตามลำดับเดิมโดยไม่ต้องใช้วิจารณญาณ เสนอเป็นคำสั่งใน `profile/commands/` แทน skill
- ไม่สร้าง skill เอง เพราะการสร้าง skill ไม่อยู่ในตารางระดับการทำแทน จึงต้องถามก่อนทุกครั้ง ข้อเสนอขึ้นใน brief บรรทัดละ 1 ข้อ ไม่เกิน 3 ข้อ
- นอกจากเสนอ skill ใหม่ ให้เสนอรวม skill ที่ทับกัน และลบ skill ที่ไม่มีใครเรียกใน 30 วันด้วย
- ไม่นับข้อความจาก scheduled task (`<scheduled-task ...>`) เพราะไม่ใช่คำสั่งของเจ้าของ และงานนั้นเป็น skill อยู่แล้ว

## Phase 1: ตัวตรวจ skill (deterministic)

ไฟล์ที่ต้องแตะ:
- `lib/skills.ts` (ใหม่) อ่าน skill จาก `.claude/skills/*/SKILL.md` และ `profile/skills/*/SKILL.md` แล้วตรวจตามกฎข้างบนทุกข้อ ใช้ zod ตรวจ frontmatter
  - ไฟล์ที่ SKILL.md ลิงก์ไป: ต้องอยู่ชั้นเดียว ถ้ายาวเกิน 100 บรรทัดต้องมีสารบัญ
  - หา description ที่ทับกัน: วัดความคล้ายของคำที่ใช้เรียก skill ทีละคู่ คู่ไหนเกินเกณฑ์ขึ้นเป็นคำเตือน ไม่ใช่ error
- `twin.ts` เพิ่มคำสั่ง `bun twin.ts skills` พิมพ์ผล และจบด้วย exit code ไม่ใช่ 0 เมื่อมี error
- `lib/evalgate.ts` ให้ gate ของ improve รัน `skills` ด้วยเมื่อ commit แตะ skill

เสร็จเมื่อ:
- `bun twin.ts skills` บน repo ตอนนี้ขึ้นคำเตือนคู่ `mac`/`computer` และไม่มี error
- มี test สำหรับ: name ที่มีตัวพิมพ์ใหญ่, name ที่มีคำว่า claude, description ว่าง, description ยาว 1,025 ตัว, frontmatter พัง, ไฟล์อ้างอิงลึก 2 ชั้น, ไฟล์อ้างอิง 150 บรรทัดที่ไม่มีสารบัญ, skill ที่ไม่มี SKILL.md
- `bunx tsc --noEmit -p .` และ `bun test` ผ่าน

## Phase 2: eval ว่าเรียก skill ถูกตัว

ไฟล์ที่ต้องแตะ:
- `evals/triggers.ts` (ใหม่) สำหรับแต่ละ prompt ให้รัน `claude -p --output-format stream-json` ด้วยชุด skill จริง แล้วอ่านว่า Skill tool เรียก skill ตัวไหน (หรือไม่เรียกเลย)
- `profile/evals/triggers.json` ใช้ prompt จริงของเจ้าของจาก history skill ละ 3 ข้อ บวกข้อที่ไม่ควรเรียก skill เลย engine มีแค่ตัวอย่างใน `evals/examples/`
- แก้ description ของ `mac` และ `computer` ให้แยกกันชัด ตามผลที่วัดได้ ห้ามเดา

เสร็จเมื่อ:
- รายงานผลราย skill: เรียกถูกตัว, เรียกผิดตัว, ไม่เรียก ทั้งตอนก่อนและหลังแก้ description
- prompt "เตือนผม…" กับ "นัด…" เรียกตัวเดิมได้ทุกครั้งใน 3 รอบ
- เก็บผลรันไว้ใช้ซ้ำ รันใหม่เฉพาะ skill ที่ description เปลี่ยน

## Phase 3: ตัวหางานที่สั่งซ้ำ

ทำ architect ก่อน: ตัดสินว่าจะเป็น collector ใหม่ `collectors/patterns.ts` หรือเป็นส่วนหนึ่งของ reflect (reflect จัดกลุ่มด้วย `claude -p` sonnet อยู่แล้ว)

ไฟล์ที่ต้องแตะ (ร่าง):
- `collectors/patterns.ts` (ใหม่) รันสัปดาห์ละครั้ง อ่าน `state/history/messages.jsonl` 30 วันล่าสุด ตัด scheduled task และข้อความสั้นที่เป็นแค่การตอบ (ทำ, เอา, ลุย) ออก แล้วจัดกลุ่มงานที่สั่งซ้ำ
  - แต่ละกลุ่มที่ถึงเกณฑ์ เอา prompt ตัวแทนไปรันกับ eval ของ Phase 2 ถ้ามี skill รับอยู่แล้ว ไม่ต้องเสนอ
  - เขียนลง `state/patterns/index.md`: ชื่องาน, จำนวนครั้ง, ประโยคจริง 3 ประโยค, เสนอเป็น skill หรือคำสั่ง
  - รวมข้อเสนอ "รวม skill ที่ทับกัน" จาก Phase 1 และ "skill ที่ไม่มีใครเรียกใน 30 วัน" จาก transcript
- `lib/brief.ts` เพิ่ม section บรรทัดเดียวต่อข้อเสนอ เช่น "งาน X สั่งซ้ำ 4 ครั้ง ทำเป็น skill ไหม"

เสร็จเมื่อ:
- รันกับข้อความจริง 30 วันแล้วได้ข้อเสนอที่เจ้าของบอกว่าใช่ อย่างน้อย 1 ข้อ และไม่มีข้อเสนอที่ซ้ำกับ skill ที่มีอยู่
- input ผิดรูป: history ว่าง, บรรทัด JSON พัง, ข้อความยาวมาก, ภาษาผสม ต้องไม่ล้มและไม่เสนออะไรมั่ว มี test ทุกกรณี
- ปรับเกณฑ์ 3/30 ตามผลจริง และบันทึกตัวเลขที่ใช้ตัดสินไว้ใน plan นี้

## Phase 4: สร้าง skill เมื่อเจ้าของตอบตกลง

ไฟล์ที่ต้องแตะ:
- `.claude/skills/improve/SKILL.md` เพิ่มทาง "skill ใหม่จากข้อเสนอ" ทำตามลำดับนี้
  1. เอาประโยคจริง 3 ประโยคของกลุ่มมาเป็น eval แล้ววัดผลตอนไม่มี skill ไว้เป็นฐาน
  2. เขียน `profile/skills/<name>/SKILL.md` ให้สั้นที่สุดที่ทำให้ eval ผ่าน ใส่แค่สิ่งที่ Claude ยังไม่รู้
  3. ส่วนที่เปราะหรือต้องทำเหมือนเดิมทุกครั้ง ให้เป็น script ไม่ใช่ข้อความ
  4. ต้องผ่าน `bun twin.ts skills` และ eval เรียก skill ถูกตัว แล้วรัน `bun twin.ts setup`
- คำสั่ง (ไม่ใช่ skill) ลง `profile/commands/<name>.ts` ด้วย `defineCommand`

เสร็จเมื่อ:
- สร้าง skill จริง 1 ตัวจากข้อเสนอของ Phase 3 ที่เจ้าของตอบตกลง และ eval ทั้ง 3 ข้อผ่าน ทั้งที่ฐานตอนไม่มี skill ไม่ผ่าน
- skill ที่สร้างไม่ทำให้ eval ของ skill ตัวอื่นเรียกผิดตัว

## Phase 5: ตัด mode ให้เหลือแต่แกน

plan `run-gate.md` เลื่อนเรื่องนี้ออกไป ทำใน plan นี้แยก phase

ไฟล์ที่ต้องแตะ:
- `lib/mode.ts` render `state/mode.md` เฉพาะส่วนที่ใช้ทุกงาน (Base, Think first, Talk, Autonomy, Scope, Verify, Process, เส้นห้ามข้าม, ระดับการทำแทน, กฎ)
- ส่วนเฉพาะงาน (Frontend defaults, UI taste, Data and backend, AI in the product, npm libraries) แยกเป็นไฟล์ชั้นเดียว worker contract แนบให้ตามชนิดงาน แบบเดียวกับ taste.md

เสร็จเมื่อ:
- วัดจำนวน token ที่โหลดตอนเริ่ม session ทั้งก่อนและหลังแยก จาก usage ของ `claude -p --output-format json` รันคำสั่งเดิม และบันทึกตัวเลขไว้
- `bun twin.ts eval` ไม่ตก และเนื้อหาทุกข้อของ mode เดิมยังอยู่ (ไม่มีอะไรหาย)

## Phase 6: reflect นับไฟล์ของ skill ที่ถูกเปิด

ไฟล์ที่ต้องแตะ:
- `collectors/reflect.ts` อ่าน Read tool call จาก transcript ของ worker นับต่อ skill ว่าเปิดไฟล์ไหนกี่ครั้ง
- ใน `state/reflect/index.md` แสดงไฟล์ที่ไม่เคยถูกเปิดใน 30 วัน และไฟล์ที่ถูกเปิดซ้ำทุก run

เสร็จเมื่อ:
- reflect รอบถัดไปมีหัวข้อนี้พร้อมตัวเลขจริงจาก transcript
