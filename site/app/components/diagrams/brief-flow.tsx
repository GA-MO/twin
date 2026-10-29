import type { Locale } from '@/lib/i18n';
import { Rich } from '@/components/parts/rich';
import { TermWindow } from '@/components/parts/term';
import { Arrow, Diagram } from './figure';

const COLLECTORS = [
  { name: 'calendar', every: 10 },
  { name: 'projects', every: 10 },
  { name: 'journal', every: 30 },
  { name: 'disk', every: 60 },
  { name: 'deps', every: 1440 },
  { name: 'notes', every: 0 },
  { name: 'runs', every: 0 },
] as const;

export const BRIEF_SOURCES = ['calendar', 'projects', 'notes', 'runs', 'disk', 'deps'] as const;
export type BriefSource = (typeof BRIEF_SOURCES)[number];

type Line = { from?: BriefSource; text: string };

type Copy = {
  label: string;
  caption: string;
  collectors: { title: string; every: (minutes: number) => string; more: string; foot: string; writes: string };
  state: { title: string; files: { path: string; what: string }[] };
  hook: string;
  rank: { title: string; rules: string[]; cut: string };
  out: { brief: string; todo: string; todoWhat: string };
  sample: { title: string; head: string[]; section: string; items: Line[]; dropped: string; sections: Line[] };
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'How the brief is built. Collectors run as separate child processes on their own schedules and write files to state/<name>/ and a fragment to state/brief/<name>.json. At session start the SessionStart hook runs bun twin.ts brief, which ranks every attention item from every collector together, keeps at most 2 per project, shows the top 8 and cuts the whole brief to 4,500 characters. bun twin.ts todo prints the same ranking in full. Below is a sample brief.',
    caption: 'The brief and `todo` read the same fragments and rank them the same way, so they never disagree. The brief is only cut shorter.',
    collectors: {
      title: 'Collectors',
      every: (m) => (m === 0 ? 'every brief' : m >= 1440 ? 'daily' : m >= 60 ? `${m / 60} h` : `${m} min`),
      more: '+ 5 more in `collectors/`',
      foot: 'Each runs in its own child process, killed after 120 s. A failure keeps the last good result.',
      writes: 'writes',
    },
    state: {
      title: 'Files',
      files: [
        { path: 'state/<name>/', what: 'Detail, for when you ask' },
        { path: 'state/brief/<name>.json', what: 'Attention items with a score, and a short section' },
      ],
    },
    hook: 'SessionStart runs `bun twin.ts brief`',
    rank: {
      title: 'One ranking over every item',
      rules: ['Score, raised as a due date nears: +15 within 3 days, +30 within a day, +40 overdue', 'At most 2 items per project', 'Top 8 items'],
      cut: 'Then the last sections drop until it fits 4,500 characters.',
    },
    out: { brief: 'The brief, in the session before you type', todo: 'bun twin.ts todo', todoWhat: 'prints the whole ranking, same order, nothing cut' },
    sample: {
      title: '~/my-twin · SessionStart hook',
      head: ['# nok · Wed 28 Oct 08:52', 'off: inbox, radar'],
      section: '## Needs you (8 of 17 · all: bun twin.ts todo)',
      items: [
        { from: 'calendar', text: '- meeting 10:30 Design review in 98 min' },
        { from: 'runs', text: '- checkout-web · run fix-coupon-rounding asks to approve push · 3 commits' },
        { from: 'notes', text: '- todo: renew the domain (notes/2026-10-27-renew-domain.md) (due 2026-10-29)' },
        { from: 'disk', text: '- disk 18 GB free · Docker 41 GB · Downloads 12 GB' },
        { from: 'projects', text: '- billing-api · open: export as CSV (PLAN.md)' },
        { from: 'projects', text: '- api-gateway · 2 commits not pushed (nok/rate-limit)' },
        { from: 'projects', text: '- billing-api · 4 files uncommitted for 6 days' },
        { from: 'deps', text: '- security advisory high/critical in 1 project: api-gateway 1 (state/deps/)' },
      ],
      dropped: 'In the sample below, billing-api\'s third item, an old worktree, waits in todo.',
      sections: [
        { text: '## Meetings · 4m · state/calendar/' },
        { from: 'calendar', text: '- 10:30–11:30 Design review · 5 people' },
        { text: '## Work sent out · 1m · state/runs/' },
        { from: 'runs', text: '- checkout-web/fix-coupon-rounding · finished · needs-approval · 3 commits' },
      ],
    },
  },
  th: {
    label:
      'brief ถูกประกอบอย่างไร collector แต่ละตัวรันเป็น child process แยกกัน ตามรอบของตัวเอง เขียนไฟล์ลง state/<name>/ และเขียนชิ้นส่วนของ brief ลง state/brief/<name>.json พอเริ่ม session SessionStart hook รัน bun twin.ts brief ซึ่งเรียงทุกเรื่องจากทุก collector รวมกัน เก็บไม่เกิน 2 เรื่องต่อโปรเจกต์ แสดง 8 เรื่องแรก และตัดทั้ง brief ให้ไม่เกิน 4,500 ตัวอักษร ส่วน bun twin.ts todo พิมพ์ลำดับเดียวกันครบทุกเรื่อง ด้านล่างเป็นตัวอย่าง brief',
    caption: 'brief กับ `todo` อ่านชิ้นส่วนชุดเดียวกันและเรียงแบบเดียวกัน จึงไม่มีวันขัดกัน brief แค่ถูกตัดให้สั้นกว่า',
    collectors: {
      title: 'collector',
      every: (m) => (m === 0 ? 'ทุกครั้งที่ออก brief' : m >= 1440 ? 'วันละครั้ง' : m >= 60 ? `${m / 60} ชม.` : `${m} นาที`),
      more: '+ อีก 5 ตัวใน `collectors/`',
      foot: 'แต่ละตัวรันใน child process ของตัวเอง เกิน 120 วินาทีถูก kill ถ้าล้ม brief ใช้ผลล่าสุดที่ดีไว้',
      writes: 'เขียน',
    },
    state: {
      title: 'ไฟล์',
      files: [
        { path: 'state/<name>/', what: 'รายละเอียด ไว้เปิดดูเมื่อถาม' },
        { path: 'state/brief/<name>.json', what: 'เรื่องที่ต้องดูพร้อมคะแนน และ section สั้นๆ' },
      ],
    },
    hook: 'SessionStart รัน `bun twin.ts brief`',
    rank: {
      title: 'เรียงทุกเรื่องในลำดับเดียว',
      rules: ['ตามคะแนน และบวกเพิ่มเมื่อใกล้ due: +15 ภายใน 3 วัน +30 ภายในวันเดียว +40 เมื่อเลยกำหนด', 'ไม่เกิน 2 เรื่องต่อโปรเจกต์', 'แสดง 8 เรื่องแรก'],
      cut: 'แล้วตัด section ท้ายๆ ออกจนเหลือไม่เกิน 4,500 ตัวอักษร',
    },
    out: { brief: 'brief อยู่ใน session ก่อนคุณพิมพ์', todo: 'bun twin.ts todo', todoWhat: 'พิมพ์ลำดับเดียวกันครบทุกเรื่อง ไม่ตัด' },
    sample: {
      title: '~/my-twin · SessionStart hook',
      head: ['# nok · พ. 28 ต.ค. 08:52', 'ปิด: inbox, radar'],
      section: '## ต้องดู (8 จาก 17 · ทั้งหมด: bun twin.ts todo)',
      items: [
        { from: 'calendar', text: '- ประชุม 10:30 Design review อีก 98 นาที' },
        { from: 'runs', text: '- checkout-web · งาน fix-coupon-rounding ขออนุมัติ push · 3 commits' },
        { from: 'notes', text: '- todo: ต่ออายุโดเมน (notes/2026-10-27-renew-domain.md) (due 2026-10-29)' },
        { from: 'disk', text: '- disk ว่างเหลือ 18 GB · Docker 41 GB · Downloads 12 GB' },
        { from: 'projects', text: '- billing-api · ค้าง: export เป็น CSV (PLAN.md)' },
        { from: 'projects', text: '- api-gateway · 2 commit ยังไม่ push (nok/rate-limit)' },
        { from: 'projects', text: '- billing-api · แก้ค้าง 4 ไฟล์ ไม่ได้ commit มา 6 วัน' },
        { from: 'deps', text: '- security advisory high/critical ใน 1 project: api-gateway 1 (state/deps/)' },
      ],
      dropped: 'ในตัวอย่างด้านล่าง เรื่องที่สามของ billing-api คือ worktree ค้าง ไปรออยู่ใน todo',
      sections: [
        { text: '## ประชุม / นัด · 4m · state/calendar/' },
        { from: 'calendar', text: '- 10:30–11:30 Design review · 5 คน' },
        { text: '## งานที่ส่งไป · 1m · state/runs/' },
        { from: 'runs', text: '- checkout-web/fix-coupon-rounding · finished · needs-approval · 3 commits' },
      ],
    },
  },
};

function Row({ line, sources, className }: { line: Line; sources: boolean; className?: string }) {
  if (!sources) return <div className={className}>{line.text}</div>;
  return (
    <div className={className ? `brief-src-row ${className}` : 'brief-src-row'}>
      <span className="brief-src">{line.from}</span>
      <span>{line.text}</span>
    </div>
  );
}

export function BriefSample({ lang, label, sources = false, className }: { lang: Locale; label?: string; sources?: boolean; className?: string }) {
  const s = copy[lang].sample;
  return (
    <TermWindow title={s.title} label={label ?? copy[lang].out.brief} className={className}>
      <div className={sources ? 'term-brief dg-term-brief brief-sources' : 'term-brief dg-term-brief'}>
        {s.head.map((text, i) => (
          <Row key={text} line={{ text }} sources={sources} className={i === 0 ? 'term-strong' : 'term-dim'} />
        ))}
        <Row line={{ text: s.section }} sources={sources} className="term-strong dg-term-gap" />
        {s.items.map((line) => (
          <Row key={line.text} line={line} sources={sources} />
        ))}
        {s.sections.map((line) => (
          <Row key={line.text} line={line} sources={sources} className={line.from ? undefined : 'term-strong dg-term-gap'} />
        ))}
        <Row line={{ text: '…' }} sources={sources} className="term-dim" />
      </div>
    </TermWindow>
  );
}

export function BriefFlow({ lang }: { lang: Locale }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} caption={c.caption}>
      <div className="dg-pipe">
        <section className="dg-stage">
          <p className="dg-stage-title">{c.collectors.title}</p>
          <ul className="dg-rows">
            {COLLECTORS.map((col) => (
              <li key={col.name}>
                <code>{col.name}</code>
                <span>{c.collectors.every(col.every)}</span>
              </li>
            ))}
          </ul>
          <p className="dg-stage-foot">
            <Rich text={c.collectors.more} />
          </p>
          <p className="dg-stage-foot">{c.collectors.foot}</p>
        </section>
        <Arrow label={c.collectors.writes} />
        <section className="dg-stage">
          <p className="dg-stage-title">{c.state.title}</p>
          {c.state.files.map((f) => (
            <div key={f.path} className="dg-file">
              <code className="chip-code">{f.path}</code>
              <span>{f.what}</span>
            </div>
          ))}
        </section>
        <Arrow />
        <section className="dg-stage dg-stage-twin">
          <p className="dg-stage-kicker">
            <Rich text={c.hook} />
          </p>
          <p className="dg-stage-title">{c.rank.title}</p>
          <ul className="dg-list">
            {c.rank.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="dg-stage-foot">{c.sample.dropped}</p>
          <p className="dg-stage-foot">{c.rank.cut}</p>
          <p className="dg-todo">
            <code className="chip-code">{c.out.todo}</code>
            <span>{c.out.todoWhat}</span>
          </p>
        </section>
      </div>
      <Arrow label={c.out.brief} />
      <BriefSample lang={lang} className="dg-term" />
    </Diagram>
  );
}
