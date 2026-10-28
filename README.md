# twin

agent ของคุณเองใน Claude Code: รู้ว่ามีงานอะไรค้าง ประชุมอะไร ตัดสินใจแบบคุณ และขออนุญาตก่อนทำเรื่องที่คุณยังไม่ไว้ใจให้ทำ

คู่มือทีละขั้นสำหรับคนที่ไม่ได้เขียนโค้ด (ติดตั้ง Bun, Claude Desktop, git บน Mac และ Windows): [docs/SETUP.md](docs/SETUP.md)

อยากเข้าใจว่า twin ทำงานอย่างไรก่อนติดตั้ง: เปิด [docs/how-it-works.html](docs/how-it-works.html) ในเบราว์เซอร์ (ภาษาไทย ไม่ต้องรู้โค้ด)

## ต้องมี

- [Bun](https://bun.sh) 1.3 ขึ้นไป
- [Claude Code](https://code.claude.com) (`claude`) ที่ login แล้ว
- git

ไม่ต้องมี pstack, Baton หรือ Mac: มีก็ใช้ ไม่มีก็ทำงานได้

## เริ่ม

```bash
git clone <repo นี้> my-twin
cd my-twin
bun install
bun twin.ts setup            # ถามชื่อ agent แล้วตั้งค่าเครื่องให้
```

แล้วเปิดคุยกับ agent ทางใดทางหนึ่ง:

- **Claude Desktop (Mac และ Windows)**: เปิดแอป Claude → แท็บ **Code** → เลือกโฟลเดอร์ (Select folder) แล้วชี้ไปที่โฟลเดอร์ `my-twin` → เริ่มคุยในโฟลเดอร์นั้น ครั้งแรกแอปจะถามว่าไว้ใจโฟลเดอร์นี้ไหม ให้กดไว้ใจ ทุกครั้งที่เปิดคุยในโฟลเดอร์นี้ agent จะโหลดตัวตนของคุณและสรุปงาน (brief) ให้เอง
- **Terminal**: `cd my-twin && claude`

แท็บ Chat ของ Claude Desktop ไม่ได้ต่อกับ agent นี้ ให้ใช้แท็บ Code

ครั้งแรกพิมพ์ `onboard`: agent จะขออนุญาตอ่านประวัติที่คุณเคยคุยกับ Claude ก่อน (ให้หรือไม่ให้ก็ได้) ถ้ามีประวัติเยอะ มันจะเดากฎของคุณจากประวัติแล้วให้คุณกด ถูก / ผิด / แล้วแต่ ถ้ามีน้อย มันจะถามทีละข้อเป็นสถานการณ์จริง ชุดละ 5 ข้อ หยุดได้ทุกเมื่อ จากนั้นมันจะถามเพิ่มวันละ 1-3 ข้อในเรื่องที่ยังรู้จักคุณน้อย

ใช้ claude.ai บนเว็บหรือมือถือเป็นหลัก: Settings → Privacy → Export data แล้วแตกไฟล์ที่ได้ทางอีเมล เอา `conversations.json` ไปวางในโฟลเดอร์ `my-twin/profile/imports/` agent จะถามก่อนอ่าน

`setup` ทำอะไรบ้าง (รันซ้ำได้ ผลเหมือนเดิม):

- เขียน `profile/twin.json`: ชื่อ agent, OS, โฟลเดอร์ code (`--dev <path>`), เครื่องมือที่ตรวจเจอ, collector ที่เปิด
- ลิงก์ `profile/mode` ไปที่ `~/.claude/skills/<ชื่อ>-mode`
- เพิ่ม SessionStart hook หนึ่งตัวใน `~/.claude/settings.json` (hook เดิมของคุณยังอยู่) หรือใส่ `--scope project` เพื่อให้ hook กับ skill อยู่ใน repo นี้อย่างเดียว เหมาะกับเครื่องที่มี agent อื่นอยู่แล้ว
- เปิดแถบสถานะงาน (mod) ให้ repo นี้ใน `.claude/settings.local.json`
- ตั้งตารางเวลา sync ทุก 10 นาทีและ daily 08:30: launchd บน Mac, cron บน Linux, Task Scheduler บน Windows (`--no-schedule` เพื่อข้าม; Windows ยังไม่ได้ทดสอบบนเครื่องจริง)

## ใช้ทุกวัน

| พิมพ์ใน claude | ได้ |
|---|---|
| มีอะไรค้าง | ตอบจาก brief |
| จำไว้ว่า … / เตือน … | โน้ตใน `notes/` |
| สรุปประชุม + วางโน้ต | การตัดสินใจ, action, งานที่ต้องส่งต่อ |
| ไปแก้ X ใน <project> | worker ทำใน worktree ของ project นั้น แล้วรายงานกลับ |
| จด feedback: … / improve | ปรับตัวตนและการทำงานจากที่คุณแก้ |

คำสั่ง: `bun twin.ts` (ไม่มี argument) แสดงทั้งหมด

## ข้อมูลของคุณ

`profile/`, `notes/`, `journal/` เป็นของคุณ อยู่ในเครื่องคุณ ไม่ถูก commit ลง branch ที่คุณ `git pull` จาก repo ต้นทาง และไม่ถูก push ไปที่นั่น ทุกชั่วโมง `sync` เก็บ snapshot ไว้ใน ref `refs/twin/backup` ในเครื่อง (ไม่ใช่ branch) ถ้าอยากสำรองนอกเครื่อง: สร้าง repo private แล้ว `git remote add backup <url>` ระบบจะ push ไปเป็น branch `twin-backup` ที่นั่นเอง

ย้ายเครื่อง: clone repo นี้ใหม่ แล้ว `git remote add backup <url> && git fetch backup twin-backup && git checkout FETCH_HEAD -- profile notes journal && git reset -q` ก่อน `bun twin.ts setup`

ลบ node_modules ใน repo ที่ไม่แตะ 14 วันและ cache เครื่องมืออัตโนมัติทุกเช้า: เปิดเองด้วย `bun twin.ts profile autoClean=on` (ปิดไว้ก่อน)

API key หรือ token: `bun twin.ts secret <ชื่อ>` เก็บใน Keychain / Credential Manager / libsecret ของเครื่อง ไม่เขียนลงไฟล์

ทำไมออกแบบแบบนี้: `docs/design.md`
