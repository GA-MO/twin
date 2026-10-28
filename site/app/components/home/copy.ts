import type { Locale } from '@/lib/i18n';

type Need = 'macos' | 'codeFolder' | 'consent';

type Source = { name: string; every: number; start: 'on' | 'off'; needs?: Need };

export const SOURCES = [
  { name: 'calendar', every: 10, start: 'off', needs: 'macos' },
  { name: 'projects', every: 10, start: 'on', needs: 'codeFolder' },
  { name: 'notes', every: 1, start: 'on' },
  { name: 'runs', every: 1, start: 'on' },
  { name: 'journal', every: 30, start: 'on' },
  { name: 'deps', every: 1440, start: 'off', needs: 'codeFolder' },
  { name: 'disk', every: 60, start: 'on' },
  { name: 'inbox', every: 10, start: 'off', needs: 'macos' },
  { name: 'radar', every: 1440, start: 'off' },
  { name: 'history', every: 1440, start: 'on', needs: 'consent' },
] as const satisfies readonly Source[];

type SourceName = (typeof SOURCES)[number]['name'];

export const LEVELS = ['observe', 'ask', 'draft', 'tell', 'silent'] as const;
export type Level = (typeof LEVELS)[number];
export const START_LEVEL: Level = 'ask';

export type Actor = 'you' | 'agent' | 'worker' | 'git';

export type BandTone = 'approve' | 'question' | 'ship' | 'stuck';

type Step = { title: string; body: string; code?: string };

export type HomeCopy = {
  meta: { title: string; description: string };
  hero: {
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
  brief: {
    title: string;
    body: string;
    head: { source: string; gives: string; every: string; start: string };
    gives: Record<SourceName, string>;
    needs: Record<Need, string>;
    on: string;
    off: string;
    every: (minutes: number) => string;
    foot: string;
  };
  learn: {
    title: string;
    body: string[];
    scaleLabel: string;
    startNote: string;
    levels: Record<Level, { name: string; desc: string }>;
    fileNote: string;
    file: string;
  };
  band: {
    title: string;
    body: string;
    label: string;
    cards: { kind: BandTone; ask: string; meta: string; buttons: string[] }[];
    status: string[];
    caption: string;
    head: { card: string; when: string; buttons: string };
    kinds: { tone: BandTone; when: string; buttons: string[] }[];
    names: Record<BandTone, string>;
    facts: string[];
  };
  dispatch: {
    title: string;
    body: string;
    actors: Record<Actor, string>;
    steps: { actor: Actor; text: string; code?: string }[];
    facts: string[];
  };
  data: {
    title: string;
    body: string;
    keptTitle: string;
    kept: string[];
    neverTitle: string;
    never: string[];
    note: string;
  };
  install: { title: string; body: string; steps: Step[]; guide: string };
  footer: { line: string; docs: string; github: string; other: string };
};

const autonomyFile = (name: string, why: string, source: string, criteria: [string, string]) =>
  JSON.stringify(
    {
      id: 'release-approval',
      name,
      level: 'ask',
      why,
      source,
      criteria,
      ceiling: 'draft',
      ledger: { predicted: 0, correct: 0 },
    },
    null,
    2,
  );

const clone = 'git clone https://github.com/GA-MO/twin my-twin';
const setup = 'git clone https://github.com/GA-MO/twin \\\n  my-twin\ncd my-twin\nbun install\nbun twin.ts setup';
export const oneLine = `${clone} && cd my-twin && bun install && bun twin.ts setup`;

const en: HomeCopy = {
  meta: {
    title: 'twin: your own agent inside Claude Code',
    description:
      'twin knows what is waiting for you before you type, decides the way you decide, and asks before it does anything you have not trusted it with. Everything it learns stays in files on your machine.',
  },
  hero: {
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
    body: 'Collectors read your sources in the background. When you open a session, a SessionStart hook ranks everything they found into one short list, so the first answer comes from your day instead of an empty context.',
    head: { source: 'Source', gives: 'What it adds', every: 'Refresh', start: 'Default' },
    gives: {
      calendar: 'Meetings for the next 7 days, and a line when one is about to start.',
      projects: 'Branch, uncommitted files, unpushed commits, stale worktrees and unfinished plan items, for every repo in your code folder.',
      notes: 'Your todos, ideas and decisions, raised again when they come due.',
      runs: 'Work sent to other repos, and which of it waits on you.',
      journal: 'Your prompts and commit subjects per project, per day. Extracted, never summarized by a model.',
      deps: 'High and critical security advisories, and major versions behind, in the repos you touch.',
      disk: 'Free space, and what is taking it.',
      inbox: 'Ideas you share from your phone into Apple Notes.',
      radar: 'AI and tech news ranked for you. The only collector that calls a model, once a day, after you say what you follow.',
      history: 'Your own past messages to Claude. Read only after you say yes, with secret-shaped strings redacted.',
    },
    needs: { macos: 'needs macOS', codeFolder: 'needs a code folder', consent: 'after you consent' },
    on: 'On',
    off: 'Off',
    every: (m) => (m >= 1440 ? 'daily' : m >= 60 ? `${m / 60} h` : `${m} min`),
    foot: 'Each collector runs in its own process with a hard timeout and keeps its last good result when a source fails. `bun twin.ts todo` prints the full ranking the brief is cut from. A new source is one file in `collectors/`.',
  },
  learn: {
    title: 'It learns how you decide.',
    body: [
      'Type `onboard` on day one. twin asks before it reads your past Claude conversations. With enough history it proposes rules from what you actually did, each with its quote, and you answer right, wrong, or depends. With little history it asks real situations, five at a time, and you can stop whenever you like.',
      'Every rule keeps its reason and its source. Red lines are asked directly, never guessed. After onboarding it asks one to three questions a day about whatever it knows least.',
    ],
    scaleLabel: 'Autonomy is set per category of work',
    startNote: 'Every category starts here',
    levels: {
      observe: { name: 'Watch', desc: 'Notes it, suggests nothing' },
      ask: { name: 'Ask', desc: 'Asks you every time' },
      draft: { name: 'Draft', desc: 'Prepares it, you press send' },
      tell: { name: 'Do and tell', desc: 'Does it, then reports' },
      silent: { name: 'Silent', desc: 'Does it, no report' },
    },
    fileNote: 'A level moves up only on your word, and drops a step after a serious mistake in that category. Red lines beat any level.',
    file: autonomyFile(
      'Approve a release',
      'A bug once reached a large client and cost a penalty',
      'onboard interview, 2026-10-12',
      ['Small client, QA passed: draft the approval', 'Large client or payments: owner reviews everything'],
    ),
  },
  band: {
    title: 'What waits on you sits above the prompt.',
    body: 'A band above the message box shows each run that needs you, with the button that settles it. It looks and works the same in Claude Desktop and in the terminal, because both draw one shared model: the same cards, in the same order, with the same buttons and words.',
    label: 'The status band: an Approval card and a Question card inside a rainbow frame, and a status line that reads nok, 2 waiting on you, 1 in progress.',
    cards: [
      { kind: 'approve', ask: 'Approve push for fix-coupon-rounding', meta: 'checkout-web · 3m ago', buttons: ['Approve push', 'Report'] },
      { kind: 'question', ask: 'Keep the old About copy or use the client’s new one?', meta: 'booking-site · 12m ago', buttons: ['Answer', 'Report'] },
    ],
    status: ['2 waiting on you', '1 in progress'],
    caption: 'Desktop draws the ask beside its buttons. The terminal fits each card on one row.',
    head: { card: 'Card', when: 'When it shows', buttons: 'Buttons' },
    kinds: [
      { tone: 'approve', when: 'The run is done and asks for a gate, such as a push.', buttons: ['Approve push', 'Report'] },
      { tone: 'question', when: 'The worker needs an answer to go on. Answer fills the message box, so the reply is yours.', buttons: ['Answer', 'Report'] },
      { tone: 'ship', when: 'The run has commits that are not pushed yet.', buttons: ['Ship UAT', 'Close'] },
      { tone: 'stuck', when: 'The worker stopped, is blocked, or left no readable report.', buttons: ['Report'] },
    ],
    names: { approve: 'Approval', question: 'Question', ship: 'Ready to ship', stuck: 'Needs attention' },
    facts: [
      'The rainbow frames what waits on you. With nothing waiting, it frames the status line alone.',
      'A pressed button turns into "Sent: … Waiting for nok", so nothing goes twice.',
      '`/twin` opens the panel: what waits on you, what waits in other sessions, what is in progress with each subagent, and what is done.',
    ],
  },
  dispatch: {
    title: 'It works in your other repos without touching your checkout.',
    body: 'Ask for a change in another project and twin hands it to a headless worker in a git worktree of that repo. You keep talking to it meanwhile. Nothing reaches main until you press the button.',
    actors: { you: 'You', agent: 'nok', worker: 'worker', git: 'git hook' },
    steps: [
      { actor: 'you', text: '"Fix the coupon rounding in checkout-web. Wait for me before it goes to main."' },
      {
        actor: 'agent',
        text: 'Opens a worktree on its own branch, copies the root .env files, and gives it a free port.',
        code: 'checkout-web/.claude/worktrees/nok-fix-coupon-rounding',
      },
      { actor: 'worker', text: 'A `claude -p` worker does the job there. The files you have open in checkout-web stay as they are.' },
      { actor: 'agent', text: 'The worker says done, but it changed UI files and clicked nothing. nok sends it one check turn before believing the report.' },
      { actor: 'agent', text: 'Counts the commits from `git log`, not from the worker\'s claim, and puts Approve push above your prompt.' },
      { actor: 'git', text: 'You press it. The worktree\'s pre-push hook allows `nok/fix-coupon-rounding` and refuses every other ref and every remote delete.' },
    ],
    facts: [
      'Production has no gate, so no button can approve a deploy.',
      'Three worker turns run at once by default. You can raise it to 20.',
      'A worker cannot ask mid-task. Take over any time with `claude --resume` in its worktree.',
    ],
  },
  data: {
    title: 'Your data stays on your machine.',
    body: 'twin is a folder of TypeScript and Markdown that runs inside Claude Code. It has no account and no cloud of its own.',
    keptTitle: 'What it keeps, and where',
    kept: [
      'Who you are, your rules, notes and journal live in `profile/`, `notes/` and `journal/`. They are gitignored, so pulling a new engine never touches them.',
      'Every hour, sync snapshots them into a local ref, `refs/twin/backup`, not a branch. It leaves the machine only if you add a remote named `backup`.',
      'API keys and tokens go to Keychain, Credential Manager or libsecret. Never to a file.',
      'Withdrawing consent for your chat history deletes what was collected.',
    ],
    neverTitle: 'What it does not do',
    never: [
      'No daemon, no database, no embeddings. Your OS scheduler runs sync every 10 minutes.',
      'No writes into another repo, except a worker on its own `nok/*` branch.',
      'No deploys to production, at any autonomy level.',
      'No background model calls, except the news radar you turn on and the morning plan drafts.',
    ],
    note: 'What you type in a session still goes to Claude, as in any Claude Code session.',
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
  hero: {
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
    body: 'collector แต่ละตัวอ่านข้อมูลของคุณไว้ในเบื้องหลัง พอคุณเปิดคุย SessionStart hook จะเรียงทุกอย่างที่เจอเป็นรายการสั้นรายการเดียว คำตอบแรกจึงมาจากวันของคุณจริง ไม่ได้เริ่มจากศูนย์',
    head: { source: 'แหล่ง', gives: 'ใส่อะไรลง brief', every: 'รอบ', start: 'เริ่มต้น' },
    gives: {
      calendar: 'ประชุมและนัด 7 วันข้างหน้า และเตือนเมื่อใกล้ถึงเวลา',
      projects: 'branch ไฟล์ที่แก้ค้าง commit ที่ยังไม่ push worktree ที่ค้าง และงานในแผนที่ยังไม่เสร็จ ของทุก repo ในโฟลเดอร์ code',
      notes: 'todo ไอเดีย และเรื่องที่ตัดสินใจไว้ ยกขึ้นมาเตือนเมื่อถึงกำหนด',
      runs: 'งานที่ส่งไปทำใน repo อื่น และงานไหนรอคุณอยู่',
      journal: 'สิ่งที่คุณพิมพ์และ commit ในแต่ละโปรเจกต์ต่อวัน ดึงมาตรง ๆ ไม่ให้ model สรุป',
      deps: 'security advisory ระดับ high และ critical และ major version ที่ตามหลัง ใน repo ที่คุณทำอยู่',
      disk: 'พื้นที่ว่าง และอะไรกินพื้นที่อยู่',
      inbox: 'ไอเดียที่คุณแชร์จากมือถือเข้า Apple Notes',
      radar: 'ข่าว AI และเทคที่เรียงตามเรื่องที่คุณสนใจ เป็นตัวเดียวที่เรียก model วันละครั้ง หลังคุณบอกว่าติดตามเรื่องอะไร',
      history: 'ข้อความเก่าที่คุณเคยคุยกับ Claude อ่านเมื่อคุณอนุญาตเท่านั้น และตัดสิ่งที่หน้าตาเหมือนรหัสลับออก',
    },
    needs: { macos: 'ต้องใช้ macOS', codeFolder: 'ต้องมีโฟลเดอร์ code', consent: 'เมื่อคุณอนุญาต' },
    on: 'เปิด',
    off: 'ปิด',
    every: (m) => (m >= 1440 ? 'วันละครั้ง' : m >= 60 ? `${m / 60} ชม.` : `${m} นาที`),
    foot: 'collector แต่ละตัวทำงานใน process ของตัวเอง มีเวลาจำกัด และถ้าแหล่งไหนล้มจะเก็บผลล่าสุดที่ดีไว้ `bun twin.ts todo` แสดงรายการเต็มที่ brief ตัดมา จะเพิ่มแหล่งใหม่ก็แค่เพิ่มไฟล์เดียวใน `collectors/`',
  },
  learn: {
    title: 'มันเรียนรู้ว่าคุณตัดสินใจอย่างไร',
    body: [
      'วันแรกพิมพ์ `onboard` twin จะขออนุญาตก่อนอ่านประวัติที่คุณเคยคุยกับ Claude ถ้ามีประวัติเยอะ มันจะเดากฎจากสิ่งที่คุณทำจริง พร้อมยกข้อความที่คุณเคยพิมพ์มาให้ดู แล้วให้คุณตอบว่า ถูก ผิด หรือแล้วแต่ ถ้ามีน้อย มันจะถามเป็นสถานการณ์จริงครั้งละ 5 ข้อ หยุดได้ทุกเมื่อ',
      'ทุกกฎจดเหตุผลและที่มาไว้ด้วย เส้นห้ามข้ามจะถามคุณตรง ๆ ไม่เดาเอง หลัง onboard มันจะถามเพิ่มวันละ 1-3 ข้อ ในเรื่องที่ยังรู้จักคุณน้อยที่สุด',
    ],
    scaleLabel: 'ระดับการทำแทน ตั้งแยกตามหมวดงาน',
    startNote: 'ทุกหมวดเริ่มที่นี่',
    levels: {
      observe: { name: 'ดูเงียบ', desc: 'ดูและจดไว้ ยังไม่เสนอ' },
      ask: { name: 'ถามก่อน', desc: 'ถามคุณทุกครั้งก่อนทำ' },
      draft: { name: 'ร่างให้', desc: 'เตรียมไว้ คุณแค่กดส่ง' },
      tell: { name: 'ทำแล้วบอก', desc: 'ทำเลย แล้วสรุปให้รู้' },
      silent: { name: 'ทำเงียบ', desc: 'ทำเองโดยไม่รายงาน' },
    },
    fileNote: 'ระดับขยับขึ้นเมื่อคุณบอกเท่านั้น และลดลงหนึ่งขั้นถ้าทำพลาดหนักในหมวดนั้น เส้นห้ามข้ามชนะทุกระดับ',
    file: autonomyFile(
      'อนุมัติ release',
      'เคยมีบั๊กหลุดไปถึงลูกค้าใหญ่จนโดนปรับ',
      'onboard interview, 2026-10-12',
      ['ลูกค้าเล็ก QA ผ่าน: ร่างข้อความอนุมัติไว้ให้', 'ลูกค้าใหญ่หรือเรื่องเงิน: เจ้าของดูเองทั้งหมด'],
    ),
  },
  band: {
    title: 'งานที่รอคุณอยู่เหนือช่องพิมพ์',
    body: 'แถบเหนือช่องพิมพ์แสดงทุกงานที่รอคุณ พร้อมปุ่มที่ปิดเรื่องนั้นได้ในคลิกเดียว หน้าตาและการทำงานเหมือนกันทั้งใน Claude Desktop และในเทอร์มินัล เพราะทั้งสองวาดจาก model เดียวกัน การ์ดเหมือนกัน เรียงเหมือนกัน ปุ่มและข้อความเหมือนกัน',
    label: 'แถบสถานะงาน มีการ์ด Approval กับ Question อยู่ในกรอบสีรุ้ง และบรรทัดสถานะว่า nok, 2 waiting on you, 1 in progress',
    cards: [
      { kind: 'approve', ask: 'Approve push for fix-coupon-rounding', meta: 'checkout-web · 3m ago', buttons: ['Approve push', 'Report'] },
      { kind: 'question', ask: 'หน้า About ใช้ข้อความเดิมหรือข้อความใหม่จากลูกค้า?', meta: 'booking-site · 12m ago', buttons: ['Answer', 'Report'] },
    ],
    status: ['2 waiting on you', '1 in progress'],
    caption: 'บน Desktop ปุ่มอยู่ข้างคำถาม ส่วนในเทอร์มินัลการ์ดแต่ละใบอยู่ในแถวเดียว',
    head: { card: 'การ์ด', when: 'ขึ้นเมื่อ', buttons: 'ปุ่ม' },
    kinds: [
      { tone: 'approve', when: 'งานเสร็จแล้วและขออนุมัติ เช่น push', buttons: ['Approve push', 'Report'] },
      { tone: 'question', when: 'worker ต้องได้คำตอบก่อนทำต่อ Answer ใส่ข้อความตั้งต้นในช่องพิมพ์ คำตอบจึงเป็นของคุณเอง', buttons: ['Answer', 'Report'] },
      { tone: 'ship', when: 'งานมี commit ที่ยังไม่ได้ push', buttons: ['Ship UAT', 'Close'] },
      { tone: 'stuck', when: 'worker หยุดกลางทาง ติดอยู่ หรือไม่มีรายงานที่อ่านได้', buttons: ['Report'] },
    ],
    names: { approve: 'Approval', question: 'Question', ship: 'Ready to ship', stuck: 'Needs attention' },
    facts: [
      'กรอบสีรุ้งล้อมสิ่งที่รอคุณ ถ้าไม่มีอะไรรอ กรอบจะล้อมแค่บรรทัดสถานะ',
      'กดปุ่มแล้วปุ่มจะกลายเป็น "Sent: … Waiting for nok" จึงไม่ส่งซ้ำ',
      '`/twin` เปิดแผงด้านข้าง เรียงงานที่รอคุณ งานที่รออยู่ในหน้าต่างอื่น งานที่กำลังทำพร้อม subagent แต่ละตัว และงานที่เสร็จแล้ว',
    ],
  },
  dispatch: {
    title: 'ทำงานใน repo อื่นได้ โดยไม่แตะไฟล์ที่คุณเปิดอยู่',
    body: 'สั่งแก้อะไรในโปรเจกต์อื่น twin จะส่งให้ worker ทำใน git worktree ของ repo นั้น ระหว่างนั้นคุณคุยเรื่องอื่นต่อได้ ไม่มีอะไรเข้า main จนกว่าคุณจะกดปุ่ม',
    actors: { you: 'คุณ', agent: 'nok', worker: 'worker', git: 'git hook' },
    steps: [
      { actor: 'you', text: '"ไปแก้เรื่องปัดเศษคูปองใน checkout-web แล้วรอผมก่อนเข้า main"' },
      {
        actor: 'agent',
        text: 'เปิด worktree บน branch ของตัวเอง คัดลอกไฟล์ .env ที่ root และหา port ว่างให้',
        code: 'checkout-web/.claude/worktrees/nok-fix-coupon-rounding',
      },
      { actor: 'worker', text: 'worker แบบ `claude -p` ทำงานในนั้น ไฟล์ที่คุณเปิดค้างใน checkout-web ไม่ถูกแตะ' },
      { actor: 'agent', text: 'worker บอกว่าเสร็จ แต่แก้ไฟล์ UI โดยไม่ได้กดลองเลย nok จึงส่งกลับไปตรวจอีกหนึ่งรอบก่อนเชื่อรายงาน' },
      { actor: 'agent', text: 'นับ commit จาก `git log` ไม่ใช่จากที่ worker บอก แล้วขึ้นปุ่ม Approve push เหนือช่องพิมพ์' },
      { actor: 'git', text: 'คุณกด pre-push hook ของ worktree นั้นยอมให้ push แค่ `nok/fix-coupon-rounding` ref อื่นและการลบบน remote ถูกปฏิเสธทั้งหมด' },
    ],
    facts: [
      'production ไม่มีปุ่มอนุมัติ ขึ้นระบบจริงคุณต้องทำเอง',
      'worker ทำพร้อมกันได้ 3 งานเป็นค่าเริ่มต้น ปรับได้ถึง 20',
      'worker ถามกลางงานไม่ได้ อยากเข้าไปทำต่อเอง ใช้ `claude --resume` ใน worktree นั้น',
    ],
  },
  data: {
    title: 'ข้อมูลของคุณ อยู่ในเครื่องของคุณ',
    body: 'twin เป็นโฟลเดอร์ของ TypeScript กับ Markdown ที่ทำงานใน Claude Code ไม่มีบัญชี และไม่มี cloud ของตัวเอง',
    keptTitle: 'เก็บอะไร ไว้ที่ไหน',
    kept: [
      'ตัวตน กฎ โน้ต และบันทึกประจำวันของคุณอยู่ใน `profile/` `notes/` และ `journal/` ซึ่งไม่ถูก commit อัปเดต twin เวอร์ชันใหม่จึงไม่แตะของพวกนี้',
      'ทุกชั่วโมง sync เก็บ snapshot ไว้ใน ref ในเครื่องชื่อ `refs/twin/backup` (ไม่ใช่ branch) จะออกนอกเครื่องก็ต่อเมื่อคุณเพิ่ม remote ชื่อ `backup` เอง',
      'API key และ token เก็บใน Keychain, Credential Manager หรือ libsecret ไม่เขียนลงไฟล์',
      'ถอนความยินยอมเรื่องประวัติแชตเมื่อไหร่ ข้อมูลที่เก็บไว้ถูกลบ',
    ],
    neverTitle: 'สิ่งที่ไม่ทำ',
    never: [
      'ไม่มี daemon ไม่มี database ไม่มี embeddings ตัวตั้งเวลาของ OS เรียก sync ทุก 10 นาที',
      'ไม่เขียนลง repo อื่น ยกเว้น worker บน branch `nok/*` ของตัวเอง',
      'ไม่ขึ้น production ให้ ไม่ว่าจะให้สิทธิ์ระดับไหน',
      'ไม่เรียก model ในเบื้องหลัง ยกเว้น radar ข่าวที่คุณเปิดเอง และแผนงานตอนเช้า',
    ],
    note: 'สิ่งที่คุณพิมพ์คุยยังส่งไปที่ Claude ตามปกติ เหมือน session Claude Code ทั่วไป',
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
