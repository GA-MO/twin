import type { Locale } from '@/lib/i18n';

export const LANES = ['you', 'twin', 'collectors', 'worker', 'git'] as const;
export type Lane = (typeof LANES)[number];

export type FlowNode = { id: string; lane: Lane; col: number; title: string; detail: string };

type Step = { title: string; body: string; code?: string };

export type HomeCopy = {
  meta: { title: string; description: string };
  eyebrows: { flow: string; brief: string; learn: string; work: string; data: string };
  flow: {
    title: string;
    body: string;
    label: string;
    lanes: Record<Lane, string>;
    phases: string[];
    nodes: FlowNode[];
    edges: [string, string][];
    tally: { of: (mine: number, all: number) => string; note: string };
  };
  hero: {
    kicker: string;
    title: string;
    lede: string;
    docs: string;
    github: string;
    needs: string;
    copy: string;
    copied: string;
  };
  terminal: {
    label: string;
    briefHead: string;
    briefSection: string;
    briefItems: string[];
    prompt: string;
    reply: string;
    band: { kind: string; ask: string; meta: string; primary: string; secondary: string };
    status: string;
  };
  brief: { title: string; body: string; more: string; label: string; caption: string };
  learn: {
    title: string;
    body: string[];
    card: { label: string; intro: string; rule: string; why: string; quote: string; from: string; options: string[]; hint: string };
  };
  work: { title: string; body: string; claims: { title: string; body: string }[] };
  data: { title: string; body: string; more: string };
  install: { title: string; body: string; steps: Step[]; guide: string };
  footer: { line: string; docs: string; github: string; other: string };
};

const clone = 'git clone https://github.com/GA-MO/twin my-twin';
const setup = 'git clone https://github.com/GA-MO/twin \\\n  my-twin\ncd my-twin\nbun install\nbun twin.ts setup';
export const oneLine = `${clone} && cd my-twin && bun install && bun twin.ts setup`;

const en: HomeCopy = {
  meta: {
    title: 'twin: your own agent inside Claude Code',
    description:
      'twin knows what is waiting for you before you type, decides the way you decide, and asks before it does anything you have not trusted it with. Everything it learns stays in files on your machine.',
  },
  eyebrows: { flow: 'How it works', brief: 'Brief', learn: 'Identity', work: 'Dispatch', data: 'Your data' },
  flow: {
    title: 'You ask once and press one button. twin does the rest.',
    body: 'One piece of work across a day. Collectors and a morning plan get it ready before you open a session. twin hands it to a worker, sends the worker back to click what it changed, counts the commits itself, and stops for you only at the push. After the merge, it closes the run.',
    label: 'Swimlane diagram of one piece of work. Overnight, collectors sync and twin builds the morning brief with a plan drafted at 08:30. You say start it; twin dispatches a worker into its own worktree. The worker builds and tests; twin sees UI changed with nothing clicked and sends a check turn; the worker clicks through. twin counts the commits from git log and puts an Approval card in the band. You approve; the pre-push hook lets only the run branch through. twin closes the run once it is merged. You did 2 of the 11 steps.',
    lanes: { you: 'You', twin: 'twin', collectors: 'Collectors', worker: 'Worker', git: 'git' },
    phases: ['Overnight', 'You ask', 'Work runs', 'It checks', 'You decide', 'It ships'],
    nodes: [
      { id: 'sync', lane: 'collectors', col: 0, title: 'sync', detail: 'calendar, repos, deps' },
      { id: 'brief', lane: 'twin', col: 0, title: 'morning brief', detail: 'plan drafted at 08:30' },
      { id: 'ask', lane: 'you', col: 1, title: '"ok, start it"', detail: 'one line' },
      { id: 'dispatch', lane: 'twin', col: 1, title: 'dispatch', detail: 'worktree, branch, port' },
      { id: 'work', lane: 'worker', col: 2, title: 'claude -p', detail: 'builds and tests' },
      { id: 'check', lane: 'twin', col: 3, title: 'check turn', detail: 'nothing was clicked' },
      { id: 'click', lane: 'worker', col: 3, title: 'clicks through', detail: 'every screen it changed' },
      { id: 'card', lane: 'twin', col: 4, title: 'Approval card', detail: 'commits from git log' },
      { id: 'approve', lane: 'you', col: 4, title: 'Approve push', detail: 'one click' },
      { id: 'push', lane: 'git', col: 5, title: 'push nok/…', detail: 'pre-push: its branch only' },
      { id: 'close', lane: 'twin', col: 5, title: 'closes the run', detail: 'once it is merged' },
    ],
    edges: [
      ['sync', 'brief'],
      ['brief', 'ask'],
      ['ask', 'dispatch'],
      ['dispatch', 'work'],
      ['work', 'check'],
      ['check', 'click'],
      ['click', 'card'],
      ['card', 'approve'],
      ['approve', 'push'],
      ['push', 'close'],
    ],
    tally: {
      of: (mine, all) => `You did ${mine} of ${all} steps`,
      note: 'The rest ran on its own, inside the autonomy you gave it. It stopped for you only where your rules say it must.',
    },
  },
  hero: {
    kicker: 'Runs inside Claude Code · Desktop and terminal',
    title: 'Your own agent, inside Claude Code.',
    lede: 'twin knows what is waiting for you before you type, decides the way you decide, and asks before it does anything you have not trusted it with. Everything it learns stays in files on your machine.',
    docs: 'Read the docs',
    github: 'View on GitHub',
    needs: 'Needs Bun 1.3 or later, a signed-in Claude Code, and git.',
    copy: 'Copy install command',
    copied: 'Copied',
  },
  terminal: {
    label: 'A Claude Code session in the my-twin folder. The brief loads at session start, the agent nok answers what is pending, and an approval card waits above the prompt.',
    briefHead: '# nok · Wed 28 Oct 08:52',
    briefSection: '## Needs you (5 of 17 · all: bun twin.ts todo)',
    briefItems: [
      '- meeting 10:30 Design review in 98 min',
      '- checkout-web · run fix-coupon-rounding: approve push',
      '- api-gateway · security advisory high: 1',
      '- billing-api · 4 files uncommitted for 6 days',
      '- todo: renew the domain (due 2026-10-30)',
    ],
    prompt: "what's pending?",
    reply:
      'Design review is at 10:30. Before that, one thing waits on you. fix-coupon-rounding in checkout-web is done and checked, and needs your approval to push. The api-gateway advisory can wait until after the review.',
    band: {
      kind: 'Approval',
      ask: 'Approve push for fix-coupon-rounding',
      meta: 'checkout-web · 3m ago',
      primary: 'Approve push',
      secondary: 'Report',
    },
    status: '1 waiting on you · 1 in progress',
  },
  brief: {
    title: 'Every session starts with a brief.',
    body: 'Collectors read your calendar, repos, notes and runs in the background. When you open a session, one hook ranks everything they found into a short list, so the first answer comes from your day instead of an empty context.',
    more: 'Every collector, and how the ranking works',
    label:
      'The brief at session start, with a column on the left naming the collector behind each line: calendar for the 10:30 design review, runs for the push waiting on approval, notes for the domain renewal, disk for free space, projects for open plan items and unpushed or uncommitted work, deps for a security advisory.',
    caption: 'The left column names the collector behind each line. The real brief has no such column.',
  },
  learn: {
    title: 'It learns how you decide.',
    body: [
      'Type `onboard` on day one. With your yes, it reads your past Claude conversations and proposes rules from what you actually did, one at a time, each with the quote it came from. With little history, it asks about real recent situations instead, five at a time.',
      'What it may do alone is set per category of work. Red lines are asked directly, never guessed.',
    ],
    card: {
      label:
        'An onboard turn. nok proposes a rule it found in your Claude Code history: patch updates with a green CI you merge yourself, minor and major updates wait until you have read the changelog. It says why it thinks so, quotes you from 14 September, and offers four answers: Right, Wrong, Depends on, Skip.',
      intro: 'From your Claude Code history, this looks like one of your rules.',
      rule: 'Patch updates with a green CI, you merge yourself. Minor and major updates wait until you have read the changelog.',
      why: 'Why I think so: you said it in three sessions in September, and asked for a review only on major updates.',
      quote: 'patch and CI is green, just merge it. majors I want to read first',
      from: 'Claude Code · 14 Sep',
      options: ['Right', 'Wrong', 'Depends on ___', 'Skip'],
      hint: 'Reply with a number or in your own words. A short reason helps a lot.',
    },
  },
  work: {
    title: 'It works in your other repos, and stops where you would.',
    body: 'Ask for a change in another project and twin hands it to a headless worker in a git worktree, on its own branch. The files you have open stay as they are. What needs you waits above the prompt, drawn the same in Claude Desktop and in the terminal.',
    claims: [
      { title: 'It pushes only its own branch.', body: 'A pre-push hook lets the worker push `nok/<slug>` and refuses every other ref and every remote delete.' },
      { title: 'Production has no approve button.', body: 'Production has no gate, so no run can be approved to deploy. That step stays with you.' },
      {
        title: 'It checks again before it reports.',
        body: 'A worker that changed UI and clicked nothing, or changed code and tried no inputs, gets one check turn first. Commits are counted from `git log`, not from its report.',
      },
    ],
  },
  data: {
    title: 'Your data stays on your machine.',
    body: 'twin is a folder of TypeScript and Markdown that runs inside Claude Code. It has no account, no daemon, no database and no cloud of its own.',
    more: 'Where every file goes',
  },
  install: {
    title: 'Set it up in three steps.',
    body: 'Setup handles macOS, Linux and Windows, though Windows has not run on a real machine yet. pstack and Baton are optional, and twin uses them when they are there.',
    steps: [
      { title: 'Get the tools', body: 'Bun 1.3 or later, Claude Code signed in, and git.', code: 'bun --version\nclaude --version' },
      { title: 'Clone and run setup', body: 'setup asks your agent\'s name, links its mode skill, adds one SessionStart hook beside yours and schedules sync. Run it again any time and you get the same result.', code: setup },
      { title: 'Open it and type onboard', body: 'In Claude Desktop, open the Code tab and select the my-twin folder. In a terminal, run claude inside it. The Chat tab does not reach twin.', code: 'cd my-twin && claude\n> onboard' },
    ],
    guide: 'Step-by-step guide',
  },
  footer: {
    line: 'twin is developed in the open. Clone it, read it, change it.',
    docs: 'Docs',
    github: 'GitHub',
    other: 'ภาษาไทย',
  },
};

const th: HomeCopy = {
  meta: {
    title: 'twin: agent ของคุณเองใน Claude Code',
    description:
      'twin รู้ว่ามีงานอะไรรอคุณก่อนคุณพิมพ์คำแรก ตัดสินใจแบบที่คุณตัดสินใจ และขออนุญาตก่อนทำเรื่องที่คุณยังไม่ไว้ใจให้ทำ ทุกอย่างที่มันเรียนรู้เก็บเป็นไฟล์ในเครื่องของคุณ',
  },
  eyebrows: { flow: 'ระบบทำงานอย่างไร', brief: 'Brief', learn: 'ตัวตน', work: 'Dispatch', data: 'ข้อมูลของคุณ' },
  flow: {
    title: 'คุณสั่งครั้งเดียว กดปุ่มครั้งเดียว ที่เหลือ twin ทำ',
    body: 'งานหนึ่งชิ้นตลอดหนึ่งวัน collector กับ plan ตอนเช้าเตรียมงานไว้ก่อนคุณเปิด session twin ส่งงานให้ worker สั่งให้กลับไปคลิกทุกหน้าที่แก้ นับ commit เอง แล้วหยุดรอคุณแค่ตอน push พอ merge แล้วก็ปิดงานให้เอง',
    label: 'แผนภาพ swimlane ของงานหนึ่งชิ้น ข้ามคืน collector sync และ twin ทำ brief ตอนเช้าพร้อม plan ที่ร่างไว้ตอน 08:30 คุณสั่งเริ่ม twin ส่ง worker ไปทำใน worktree ของมัน worker build และ test twin เห็นว่าแก้ UI แต่ไม่ได้คลิก จึงสั่งตรวจอีกรอบ worker คลิกไล่ทุกหน้า twin นับ commit จาก git log แล้ววางการ์ด Approval ในแถบ คุณกดอนุมัติ pre-push hook ให้ผ่านแค่ branch ของงาน twin ปิดงานเมื่อ merge แล้ว คุณทำ 2 จาก 11 ขั้น',
    lanes: { you: 'คุณ', twin: 'twin', collectors: 'Collectors', worker: 'Worker', git: 'git' },
    phases: ['ข้ามคืน', 'คุณสั่ง', 'งานวิ่ง', 'ตรวจเอง', 'คุณตัดสิน', 'ส่งขึ้น'],
    nodes: [
      { id: 'sync', lane: 'collectors', col: 0, title: 'sync', detail: 'ปฏิทิน, repo, deps' },
      { id: 'brief', lane: 'twin', col: 0, title: 'brief ตอนเช้า', detail: 'plan ร่างไว้ตอน 08:30' },
      { id: 'ask', lane: 'you', col: 1, title: '"เริ่มเลย"', detail: 'บรรทัดเดียว' },
      { id: 'dispatch', lane: 'twin', col: 1, title: 'dispatch', detail: 'worktree, branch, port' },
      { id: 'work', lane: 'worker', col: 2, title: 'claude -p', detail: 'build และ test' },
      { id: 'check', lane: 'twin', col: 3, title: 'check turn', detail: 'ยังไม่ได้คลิก' },
      { id: 'click', lane: 'worker', col: 3, title: 'คลิกไล่ทุกหน้า', detail: 'ทุกหน้าที่แก้' },
      { id: 'card', lane: 'twin', col: 4, title: 'การ์ด Approval', detail: 'commit จาก git log' },
      { id: 'approve', lane: 'you', col: 4, title: 'Approve push', detail: 'คลิกเดียว' },
      { id: 'push', lane: 'git', col: 5, title: 'push nok/…', detail: 'pre-push: branch งานเท่านั้น' },
      { id: 'close', lane: 'twin', col: 5, title: 'ปิดงาน', detail: 'เมื่อ merge แล้ว' },
    ],
    edges: [
      ['sync', 'brief'],
      ['brief', 'ask'],
      ['ask', 'dispatch'],
      ['dispatch', 'work'],
      ['work', 'check'],
      ['check', 'click'],
      ['click', 'card'],
      ['card', 'approve'],
      ['approve', 'push'],
      ['push', 'close'],
    ],
    tally: {
      of: (mine, all) => `คุณทำ ${mine} จาก ${all} ขั้น`,
      note: 'ที่เหลือเดินเองภายใต้ autonomy ที่คุณให้ไว้ และหยุดรอคุณเฉพาะจุดที่กฎของคุณบอกว่าต้องถาม',
    },
  },
  hero: {
    kicker: 'ทำงานใน Claude Code · ทั้ง Desktop และเทอร์มินัล',
    title: 'agent ของคุณเอง\nใน Claude Code',
    lede: 'twin รู้ว่ามีงานอะไรรอคุณก่อนคุณพิมพ์คำแรก ตัดสินใจแบบที่คุณตัดสินใจ และขออนุญาตก่อนทำเรื่องที่คุณยังไม่ไว้ใจให้ทำ ทุกอย่างที่มันเรียนรู้เก็บเป็นไฟล์ในเครื่องของคุณ',
    docs: 'อ่านคู่มือ',
    github: 'ดูบน GitHub',
    needs: 'ต้องมี Bun 1.3 ขึ้นไป, Claude Code ที่ login แล้ว และ git',
    copy: 'คัดลอกคำสั่งติดตั้ง',
    copied: 'คัดลอกแล้ว',
  },
  terminal: {
    label: 'session ของ Claude Code ในโฟลเดอร์ my-twin brief โหลดตอนเริ่ม session แล้ว nok ตอบว่ามีอะไรค้าง และมีการ์ดรออนุมัติอยู่เหนือช่องพิมพ์',
    briefHead: '# nok · พุธ 28 ต.ค. 08:52',
    briefSection: '## ต้องดู (5 จาก 17 · ทั้งหมด: bun twin.ts todo)',
    briefItems: [
      '- ประชุม 10:30 Design review อีก 98 นาที',
      '- checkout-web · run fix-coupon-rounding: รออนุมัติ push',
      '- api-gateway · security advisory high 1 ตัว',
      '- billing-api · แก้ค้าง 4 ไฟล์ ไม่ได้ commit มา 6 วัน',
      '- todo: ต่ออายุโดเมน (due 2026-10-30)',
    ],
    prompt: 'มีอะไรค้าง',
    reply:
      '10:30 มี Design review ก่อนหน้านั้นมีเรื่องเดียวที่รอคุณ คือ fix-coupon-rounding ใน checkout-web ทำเสร็จและตรวจแล้ว รอคุณอนุมัติ push ส่วน advisory ของ api-gateway รอหลังประชุมได้',
    band: {
      kind: 'Approval',
      ask: 'Approve push for fix-coupon-rounding',
      meta: 'checkout-web · 3m ago',
      primary: 'Approve push',
      secondary: 'Report',
    },
    status: '1 waiting on you · 1 in progress',
  },
  brief: {
    title: 'เปิดคุยครั้งไหน ก็เริ่มจาก brief',
    body: 'collector อ่านปฏิทิน repo โน้ต และงานที่ส่งไปไว้ในเบื้องหลัง พอคุณเปิด session hook ตัวเดียวจะเรียงทุกอย่างที่เจอเป็นรายการสั้น ๆ คำตอบแรกจึงมาจากวันของคุณจริง ไม่ได้เริ่มจากศูนย์',
    more: 'collector ทุกตัว และวิธีเรียงลำดับ',
    label:
      'brief ตอนเริ่ม session มีคอลัมน์ซ้ายบอกว่าแต่ละบรรทัดมาจาก collector ตัวไหน calendar สำหรับ Design review 10:30 runs สำหรับงานที่รออนุมัติ push notes สำหรับการต่ออายุโดเมน disk สำหรับพื้นที่ว่าง projects สำหรับงานในแผนที่ค้าง commit ที่ยังไม่ push และไฟล์ที่ยังไม่ commit deps สำหรับ security advisory',
    caption: 'คอลัมน์ซ้ายบอกว่าแต่ละบรรทัดมาจาก collector ตัวไหน ใน brief จริงไม่มีคอลัมน์นี้',
  },
  learn: {
    title: 'มันเรียนรู้ว่าคุณตัดสินใจอย่างไร',
    body: [
      'วันแรกพิมพ์ `onboard` ถ้าคุณอนุญาต twin จะอ่านประวัติที่คุณเคยคุยกับ Claude แล้วเสนอกฎจากสิ่งที่คุณทำจริงทีละข้อ พร้อมข้อความที่คุณเคยพิมพ์เป็นหลักฐาน ถ้ามีประวัติน้อย มันจะถามจากสถานการณ์จริงที่เพิ่งเกิดแทน ครั้งละ 5 ข้อ',
      'อะไรที่มันทำเองได้ ตั้งแยกตามหมวดงาน ส่วนเส้นห้ามข้ามจะถามคุณตรง ๆ ไม่เดาเอง',
    ],
    card: {
      label:
        'หนึ่งรอบของ onboard nok เสนอกฎที่เจอในประวัติ Claude Code ของคุณ คืออัปเดต patch ที่ CI ผ่านคุณ merge เอง ส่วน minor กับ major รอให้คุณอ่าน changelog ก่อน บอกเหตุผลที่คิดแบบนั้น ยกข้อความที่คุณพิมพ์เมื่อ 14 ก.ย. และให้ตอบได้ 4 แบบ ถูก ผิด แล้วแต่ ข้าม',
      intro: 'จากประวัติที่คุณคุยกับ Claude Code ข้อนี้น่าจะเป็นกฎของคุณ',
      rule: 'อัปเดต patch ที่ CI ผ่าน คุณ merge เอง ส่วน minor กับ major รอให้คุณอ่าน changelog ก่อน',
      why: 'ที่คิดแบบนี้เพราะคุณพูดไว้ใน 3 session ช่วงเดือนกันยายน และขอ review เฉพาะตอนอัปเดต major',
      quote: 'patch แล้ว CI เขียวก็ merge เลย major ขอดูก่อน',
      from: 'Claude Code · 14 ก.ย.',
      options: ['ถูก', 'ผิด', 'แล้วแต่ ___', 'ข้าม'],
      hint: 'ตอบเลข หรือพิมพ์เอง ใส่เหตุผลสั้นๆ ได้จะดีมาก',
    },
  },
  work: {
    title: 'ทำงานใน repo อื่นให้ และหยุดตรงที่คุณจะหยุด',
    body: 'สั่งแก้อะไรในโปรเจกต์อื่น twin จะส่งให้ worker ทำใน git worktree บน branch ของมันเอง ไฟล์ที่คุณเปิดอยู่ไม่ถูกแตะ อะไรที่รอคุณจะขึ้นเหนือช่องพิมพ์ หน้าตาเหมือนกันทั้งใน Claude Desktop และในเทอร์มินัล',
    claims: [
      { title: 'push ได้แค่ branch ของตัวเอง', body: 'pre-push hook ยอมให้ worker push แค่ `nok/<slug>` ref อื่นและการลบบน remote ถูกปฏิเสธทั้งหมด' },
      { title: 'production ไม่มีปุ่มอนุมัติ', body: 'production ไม่มี gate จึงไม่มีงานไหนอนุมัติให้ขึ้นระบบจริงได้ ขั้นนั้นคุณทำเอง' },
      {
        title: 'ตรวจซ้ำก่อนรายงาน',
        body: 'worker ที่แก้ UI แต่ไม่ได้คลิก หรือแก้โค้ดแต่ไม่ได้ลอง input จะถูกส่งกลับไปตรวจอีกหนึ่งรอบก่อน และ commit นับจาก `git log` ไม่ใช่จากรายงาน',
      },
    ],
  },
  data: {
    title: 'ข้อมูลของคุณ อยู่ในเครื่องของคุณ',
    body: 'twin เป็นโฟลเดอร์ของ TypeScript กับ Markdown ที่ทำงานใน Claude Code ไม่มีบัญชี ไม่มี daemon ไม่มี database และไม่มี cloud ของตัวเอง',
    more: 'ไฟล์ไหนไปอยู่ที่ไหน',
  },
  install: {
    title: 'ติดตั้งใน 3 ขั้น',
    body: 'setup รองรับ macOS, Linux และ Windows แต่ Windows ยังไม่ได้ลองบนเครื่องจริง ไม่ต้องมี pstack หรือ Baton ก็ได้ ถ้ามี twin จะใช้ให้เอง',
    steps: [
      { title: 'เตรียมเครื่องมือ', body: 'Bun 1.3 ขึ้นไป, Claude Code ที่ login แล้ว และ git', code: 'bun --version\nclaude --version' },
      { title: 'clone แล้วรัน setup', body: 'setup ถามชื่อ agent ลิงก์ mode skill เพิ่ม SessionStart hook หนึ่งตัวโดยไม่แตะ hook เดิม และตั้งเวลา sync รันซ้ำกี่ครั้งผลก็เหมือนเดิม', code: setup },
      { title: 'เปิดคุย แล้วพิมพ์ onboard', body: 'ใน Claude Desktop เปิดแท็บ Code แล้วเลือกโฟลเดอร์ my-twin หรือใน terminal รัน claude ในโฟลเดอร์นั้น แท็บ Chat ไม่ได้ต่อกับ twin', code: 'cd my-twin && claude\n> onboard' },
    ],
    guide: 'คู่มือทีละขั้น',
  },
  footer: {
    line: 'twin พัฒนาแบบเปิด clone ไปอ่าน แก้ และใช้ได้เลย',
    docs: 'เอกสาร',
    github: 'GitHub',
    other: 'English',
  },
};

export const copy: Record<Locale, HomeCopy> = { en, th };
