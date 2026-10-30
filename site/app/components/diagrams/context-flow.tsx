import type { Locale } from '@/lib/i18n';
import { Rich } from '@/components/parts/rich';
import { Arrow, Diagram } from './figure';

const LANES = ['memory', 'messages', 'skills'] as const;
type Lane = (typeof LANES)[number];

type Step = { title: string; detail: string };

type Copy = {
  label: string;
  caption: string;
  open: Step;
  hooks: Step;
  work: Step;
  compaction: string;
  lanes: Record<Lane, Step & { role: string }>;
  again: Step;
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'What reaches the agent, and when. When a session opens, Claude Code reads CLAUDE.md first, which imports the rendered mode in full. Then the SessionStart hooks run: the brief, and the mode hook, which rewrites state/mode.md and tells the session to read it only when it changed. While you work, skills load when a task calls for them, and the guard and push gates hold in code. When the context fills, compaction keeps CLAUDE.md, turns the messages into a summary, and drops the skills that were loaded. The hook then runs again and tells the session to invoke those skills again.',
    caption: 'Only what CLAUDE.md imports, or what code enforces, holds through every session and every compaction. Everything else has to be loaded again.',
    open: { title: 'Claude Code reads CLAUDE.md', detail: 'Your mode, rules, red lines and autonomy arrive in full through `@state/mode.md`.' },
    hooks: { title: 'SessionStart hooks run', detail: 'The brief. The mode hook rewrites `state/mode.md` and, only if it changed after step 1 or its import was just added, tells this session to read it now.' },
    work: { title: 'You work', detail: 'Skills load when a task calls for them: `dispatch`, `improve`, poteto-mode. The guard hook and the push gate hold in code, never in context.' },
    compaction: 'context fills: compaction',
    lanes: {
      memory: { title: 'CLAUDE.md', detail: 'The mode stays in full.', role: 'kept' },
      messages: { title: 'Messages', detail: 'They become one summary.', role: 'summarized' },
      skills: { title: 'Skills', detail: 'Skills loaded before are gone.', role: 'dropped' },
    },
    again: { title: 'The hook runs again', detail: 'It tells the session to invoke again, before its next tool call, each skill the task still runs under.' },
  },
  th: {
    label:
      'อะไรเข้าถึง agent และเมื่อไหร่ ตอนเปิด session Claude Code อ่าน CLAUDE.md ก่อน ซึ่ง import mode ที่ render แล้วเข้ามาครบ จากนั้น SessionStart hook ทำงาน คือ brief และ mode hook ที่เขียน state/mode.md ใหม่ และบอก session ให้อ่านเฉพาะเมื่อมันเปลี่ยน ระหว่างทำงาน skill โหลดเมื่องานต้องใช้ ส่วน guard และ push gate บังคับด้วยโค้ด เมื่อ context เต็ม compaction เก็บ CLAUDE.md ไว้ เปลี่ยนข้อความเป็นสรุป และทิ้ง skill ที่โหลดไว้ แล้ว hook ทำงานอีกครั้งเพื่อบอกให้เรียก skill เหล่านั้นใหม่',
    caption: 'สิ่งที่ CLAUDE.md import หรือที่โค้ดบังคับเท่านั้นที่อยู่ครบทุก session และทุกครั้งที่ compact ที่เหลือต้องโหลดใหม่',
    open: { title: 'Claude Code อ่าน CLAUDE.md', detail: 'mode กฎ เส้นห้าม และระดับการทำแทนของคุณเข้ามาครบผ่าน `@state/mode.md`' },
    hooks: { title: 'SessionStart hook ทำงาน', detail: 'brief และ mode hook ที่เขียน `state/mode.md` ใหม่ ถ้ามันเปลี่ยนหลังขั้นที่ 1 หรือเพิ่งเพิ่มบรรทัด import จึงบอก session นี้ให้อ่านทันที' },
    work: { title: 'คุณทำงาน', detail: 'skill โหลดเมื่องานต้องใช้ เช่น `dispatch`, `improve`, poteto-mode ส่วน guard hook และ push gate บังคับด้วยโค้ด ไม่ได้อยู่ใน context' },
    compaction: 'context เต็ม: compaction',
    lanes: {
      memory: { title: 'CLAUDE.md', detail: 'mode อยู่ครบเหมือนเดิม', role: 'อยู่' },
      messages: { title: 'ข้อความ', detail: 'กลายเป็นสรุปก้อนเดียว', role: 'ถูกสรุป' },
      skills: { title: 'skill', detail: 'skill ที่โหลดไว้หายไป', role: 'หาย' },
    },
    again: { title: 'hook ทำงานอีกครั้ง', detail: 'บอก session ให้เรียก skill ที่งานยังต้องใช้ใหม่ ก่อน tool call ถัดไป' },
  },
};

function Stage({ step }: { step: Step }) {
  return (
    <section className="dg-stage">
      <p className="dg-stage-title">{step.title}</p>
      <p className="dg-detail">
        <Rich text={step.detail} />
      </p>
    </section>
  );
}

export function ContextFlow({ lang }: { lang: Locale }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} caption={c.caption}>
      <Stage step={c.open} />
      <Arrow />
      <Stage step={c.hooks} />
      <Arrow />
      <Stage step={c.work} />
      <Arrow label={c.compaction} />
      <div className="dg-lanes">
        {LANES.map((lane) => (
          <section key={lane} className={lane === 'memory' ? 'dg-stage dg-lane' : 'dg-stage dg-lane is-shown'}>
            <p className="dg-stage-title">{c.lanes[lane].title}</p>
            <p className="dg-detail">{c.lanes[lane].detail}</p>
            <p className={lane === 'memory' ? 'dg-lane-role is-decides' : 'dg-lane-role'}>{c.lanes[lane].role}</p>
          </section>
        ))}
      </div>
      <Arrow />
      <Stage step={c.again} />
    </Diagram>
  );
}
