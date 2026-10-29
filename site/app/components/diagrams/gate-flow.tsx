import type { Locale } from '@/lib/i18n';
import { Rich } from '@/components/parts/rich';
import { Arrow, Diagram } from './figure';

const LANES = ['test', 'fixtures', 'replay'] as const;
type Lane = (typeof LANES)[number];

type Copy = {
  label: string;
  caption: string;
  commit: string;
  other: string;
  clean: { title: string; detail: string };
  statics: { title: string; items: string[] };
  parallel: string;
  lanes: Record<Lane, { title: string; detail: string }>;
  decides: string;
  shown: string;
  block: { title: string; detail: string };
  pass: { title: string; detail: string };
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'The commit gate for improve: commits. A commit-msg hook lets every other message through without starting bun. For improve: commits it refuses while any file is unstaged or untracked, then runs static checks in under a second, then in parallel runs bun test, the two fast fixtures against HEAD\'s result when their files changed, and replay once per situation, which is shown and never decides. It blocks on deterministic breakage, naming the item. A passing verdict is cached and reused by the hook, eval and an amend that changes nothing; a refusal is never kept.',
    caption: 'The gate blocks only what it can check for certain. Replay runs beside it as evidence for you, never as a vote.',
    commit: 'git commit -m "improve: …"',
    other: 'Any other message passes. The hook filters it in shell, so bun never starts.',
    clean: { title: 'Clean tree', detail: 'Refuses while any file is unstaged or untracked, so it checks exactly what is committed.' },
    statics: {
      title: 'Static checks, under a second',
      items: [
        'A key rule missing from the contract',
        'A fixture brief that `parseBrief` refuses',
        'A sample or stored report the schema no longer reads',
        'An identity file with parse problems',
        'An evals file staged with what it measures',
      ],
    },
    parallel: 'Then in parallel',
    lanes: {
      test: { title: '`bun test`', detail: 'The whole suite.' },
      fixtures: { title: 'Fast fixtures', detail: '`split-bill` and `static-path`, only when their files changed, against HEAD\'s own result. One confirming rerun.' },
      replay: { title: 'Replay', detail: 'Once per situation.' },
    },
    decides: 'decides',
    shown: 'shown, never decides',
    block: { title: 'Block', detail: 'Names the item. A refusal is never kept, so any fix reruns the check.' },
    pass: { title: 'Pass', detail: 'The verdict is kept under a hash of the index and your files. The hook, `eval` and an amend that changes nothing reuse it.' },
  },
  th: {
    label:
      'gate ของ commit ที่ขึ้นต้นด้วย improve: commit-msg hook ปล่อยข้อความอื่นผ่านไปเลยโดยไม่เริ่ม bun สำหรับ commit improve: มันปฏิเสธถ้ายังมีไฟล์ที่ไม่ได้ stage หรือไม่ได้ track แล้วตรวจแบบ static ในเวลาไม่ถึงวินาที จากนั้นรันพร้อมกัน คือ bun test, fixture เร็วสองตัวเทียบกับผลของ HEAD เมื่อไฟล์ที่มันอ่านเปลี่ยน และ replay ครั้งเดียวต่อสถานการณ์ ซึ่งแสดงผลแต่ไม่ได้ตัดสิน มันกันเฉพาะสิ่งที่พังแน่นอน พร้อมบอกชื่อรายการ ผลที่ผ่านถูกเก็บไว้ให้ hook, eval และ amend ที่ไม่ได้เปลี่ยนอะไรใช้ซ้ำ ส่วนผลที่ไม่ผ่านไม่เคยถูกเก็บ',
    caption: 'gate กันเฉพาะสิ่งที่ตรวจได้แน่นอน replay รันข้างๆ เป็นหลักฐานให้คุณดู ไม่ได้มีสิทธิ์ตัดสิน',
    commit: 'git commit -m "improve: …"',
    other: 'ข้อความอื่นผ่านไปเลย hook กรองด้วย shell จึงไม่เริ่ม bun',
    clean: { title: 'ไฟล์ต้องครบ', detail: 'ปฏิเสธถ้ายังมีไฟล์ที่ไม่ได้ stage หรือไม่ได้ track สิ่งที่ตรวจจึงตรงกับสิ่งที่ commit' },
    statics: {
      title: 'ตรวจแบบ static ไม่ถึงวินาที',
      items: [
        'กฎสำคัญหายไปจากสัญญาของ worker',
        'brief ของ fixture ที่ `parseBrief` ปฏิเสธ',
        'รายงานตัวอย่างหรือรายงานที่เก็บไว้ ที่ schema อ่านไม่ได้แล้ว',
        'ไฟล์ตัวตนที่อ่านไม่ได้',
        'ไฟล์ evals ถูก stage มาพร้อมสิ่งที่มันวัด',
      ],
    },
    parallel: 'แล้วรันพร้อมกัน',
    lanes: {
      test: { title: '`bun test`', detail: 'ทั้งชุด' },
      fixtures: { title: 'fixture เร็ว', detail: '`split-bill` และ `static-path` เฉพาะเมื่อไฟล์ที่มันอ่านเปลี่ยน เทียบกับผลของ HEAD เอง รันซ้ำยืนยันหนึ่งครั้ง' },
      replay: { title: 'replay', detail: 'ครั้งเดียวต่อสถานการณ์' },
    },
    decides: 'ตัดสิน',
    shown: 'แสดงผล ไม่ได้ตัดสิน',
    block: { title: 'ไม่ผ่าน', detail: 'บอกชื่อรายการ ผลที่ไม่ผ่านไม่เคยถูกเก็บ แก้อะไรก็ตรวจใหม่' },
    pass: { title: 'ผ่าน', detail: 'ผลถูกเก็บไว้ใต้ hash ของ index และไฟล์ของคุณ hook, `eval` และ amend ที่ไม่ได้เปลี่ยนอะไรใช้ซ้ำได้' },
  },
};

export function GateFlow({ lang }: { lang: Locale }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} caption={c.caption}>
      <div className="dg-gate-commit">
        <code className="chip-code">{c.commit}</code>
        <span>{c.other}</span>
      </div>
      <Arrow />
      <section className="dg-stage">
        <p className="dg-stage-title">{c.clean.title}</p>
        <p className="dg-detail">{c.clean.detail}</p>
      </section>
      <Arrow />
      <section className="dg-stage">
        <p className="dg-stage-title">{c.statics.title}</p>
        <ul className="dg-list">
          {c.statics.items.map((item) => (
            <li key={item}>
              <Rich text={item} />
            </li>
          ))}
        </ul>
      </section>
      <Arrow label={c.parallel} />
      <div className="dg-lanes">
        {LANES.map((lane) => (
          <section key={lane} className={lane === 'replay' ? 'dg-stage dg-lane is-shown' : 'dg-stage dg-lane'}>
            <p className="dg-stage-title">
              <Rich text={c.lanes[lane].title} />
            </p>
            <p className="dg-detail">
              <Rich text={c.lanes[lane].detail} />
            </p>
            <p className={lane === 'replay' ? 'dg-lane-role' : 'dg-lane-role is-decides'}>{lane === 'replay' ? c.shown : c.decides}</p>
          </section>
        ))}
      </div>
      <Arrow />
      <div className="dg-verdicts">
        <section className="dg-verdict is-block">
          <p className="dg-stage-title">{c.block.title}</p>
          <p className="dg-detail">
            <Rich text={c.block.detail} />
          </p>
        </section>
        <section className="dg-verdict is-pass">
          <p className="dg-stage-title">{c.pass.title}</p>
          <p className="dg-detail">
            <Rich text={c.pass.detail} />
          </p>
        </section>
      </div>
    </Diagram>
  );
}
