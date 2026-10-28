<p align="center">
  <img src="site/public/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">twin</h1>

<p align="center">
  agent ของคุณเองใน Claude Code รู้ว่ามีงานอะไรค้าง ตัดสินใจแบบคุณ<br>
  และขออนุญาตก่อนทำเรื่องที่คุณยังไม่ไว้ใจให้ทำ
</p>

<p align="center">
  <a href="https://ga-mo.github.io/twin/th/docs">เอกสาร</a> ·
  <a href="https://ga-mo.github.io/twin/th/docs/install">คู่มือติดตั้งทีละขั้น</a> ·
  <a href="README.md">English</a>
</p>

---

twin คือ repo ที่คุณ clone ครั้งเดียว เปิดใน Claude Code (แท็บ Code ของ Claude Desktop หรือ `claude` ในเทอร์มินัล) แล้ว session นั้นคือ agent ของคุณ ก่อนคุณพิมพ์อะไร มันอ่านประชุม project โน้ต และงานที่ส่งไปแล้ว โหลดตัวตนของคุณจากไฟล์ที่เป็นของคุณคนเดียว และส่งงานโค้ดไปทำใน repo อื่นด้วย worker ที่ไม่ชนกับงานที่คุณทำอยู่

## ทำอะไรได้

- **รู้ว่าอะไรค้าง**: ทุก session เริ่มด้วย brief: เรื่องที่ต้องดู ประชุม งานที่ส่งไป โน้ตและ todo ที่ยังเปิด ข้อมูลมาจาก collector ตัวเล็กๆ (ปฏิทิน, project, โน้ต, run, Trello, ช่องโหว่ของ dependency, disk, ข่าวรายวัน) ที่คุณเปิดปิดเองได้
- **เรียนรู้ว่าคุณตัดสินใจอย่างไร**: `onboard` อ่านประวัติที่คุณอนุญาต แล้วเสนอกฎให้คุณยืนยัน หรือถามทีละชุด ชุดละ 5 ข้อ กฎ เส้นห้าม และระดับที่ทำแทนได้เองในแต่ละเรื่อง เก็บเป็นไฟล์ที่ตรวจได้
- **จำแทนคุณ**: "จำไว้ว่า…" "เตือน…" "ตัดสินใจแล้วว่า…" กลายเป็นโน้ต วางโน้ตประชุมแล้วได้การตัดสินใจ action ของคุณ และงานที่ต้องส่งต่อ
- **ทำงานใน project อื่นอย่างปลอดภัย**: "ไปแก้ X ใน Y" เริ่ม worker ใน git worktree และ branch ของมันเอง push ได้แค่ branch ของตัวเอง แล้วรายงานกลับว่าทำอะไรไป
- **เก่งขึ้นจากการใช้งานจริง**: บอกว่าผิดตรงไหน `improve` จะปรับตัว ตัวเลขที่มันดูคือสัดส่วนงานที่ส่งไปแล้วคุณไม่ต้องกลับไปแตะอีก

ไม่มีอะไรรันบน cloud ไม่มี daemon ไม่มีฐานข้อมูล ตัวตน โน้ต และ journal ของคุณอยู่ในเครื่องคุณ และไม่ถูกส่งไปที่ repo ต้นทางที่คุณ `git pull`

ไม่เคยใช้เทอร์มินัล: ทำตาม[คู่มือติดตั้งทีละขั้น](https://ga-mo.github.io/twin/th/docs/install) (ติดตั้ง Bun, Claude Desktop, git บน Mac และ Windows) หรือเปิด [docs/SETUP.md](docs/SETUP.md)

## ต้องมี

- [Bun](https://bun.sh) 1.3 ขึ้นไป
- [Claude Code](https://code.claude.com) (`claude`) ที่ login แล้ว
- git

ไม่ต้องมี pstack, Baton หรือ Mac: มีก็ใช้ ไม่มีก็ทำงานได้

## เริ่ม

```bash
git clone https://github.com/GA-MO/twin.git my-twin
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

ทำไมออกแบบแบบนี้: [การออกแบบ](https://ga-mo.github.io/twin/th/docs/design) หรือ [docs/design.md](docs/design.md)
