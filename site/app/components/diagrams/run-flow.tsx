import type { Locale } from '@/lib/i18n';
import { Rich } from '@/components/parts/rich';
import { Diagram } from './figure';

type Actor = 'you' | 'twin' | 'worker';
type Mode = 'you' | 'alone' | 'when';

const STEPS = [
  { id: 'ask', actor: 'you', mode: 'you' },
  { id: 'brief', actor: 'twin', mode: 'alone' },
  { id: 'worktree', actor: 'twin', mode: 'alone' },
  { id: 'work', actor: 'worker', mode: 'alone' },
  { id: 'check', actor: 'twin', mode: 'when' },
  { id: 'report', actor: 'twin', mode: 'alone' },
  { id: 'gate', actor: 'you', mode: 'you' },
  { id: 'land', actor: 'worker', mode: 'alone' },
  { id: 'close', actor: 'twin', mode: 'alone' },
] as const satisfies readonly { id: string; actor: Actor; mode: Mode }[];

type StepId = (typeof STEPS)[number]['id'];

type Copy = {
  label: string;
  caption: string;
  actors: Record<Actor, string>;
  modes: Record<Mode, string>;
  waits: string;
  steps: Record<StepId, { title: string; detail: string; code?: string[] }>;
  when: string[];
  refused: { title: string; items: string[] };
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'The life of one run. You ask. nok writes a brief, opens a worktree on the branch nok/fix-coupon-rounding, and a headless claude -p worker builds it while the pre-push hook refuses any other branch, remote deletes, and production has no gate at all. A check turn runs only when UI changed with nothing clicked or code changed with no inputs tried. The report counts commits from git log. The run waits for you at the push gate. With your approval, the worker lands it for that one turn, and nok closes the run once the branch is merged.',
    caption: 'Two steps are yours: the ask and the push gate. Everything else runs on its own, inside the rails.',
    actors: { you: 'You', twin: 'nok', worker: 'worker' },
    modes: { you: 'You act', alone: 'Runs on its own', when: 'Only when needed' },
    waits: 'waits on you',
    steps: {
      ask: { title: 'Asks', detail: '"Fix the coupon rounding in checkout-web."' },
      brief: { title: 'Writes a brief', detail: 'Kind, size, goal, limits, and what done means. Never how to do it.' },
      worktree: {
        title: 'Opens a worktree',
        detail: 'From `origin/develop`, with the root `.env` files copied and a free port.',
        code: ['checkout-web/.claude/worktrees/nok-fix-coupon-rounding', 'branch nok/fix-coupon-rounding'],
      },
      work: { title: 'A headless worker builds it', detail: '`claude -p` in the worktree. You keep talking to nok meanwhile.' },
      check: { title: 'Check turn', detail: 'One more turn before you hear back, when the worker said done and:' },
      report: { title: 'Report', detail: '`done`, `needs-approval`, `needs-input` or `blocked`. Commits are counted from `git log`, not from the worker.' },
      gate: { title: 'Push gate', detail: 'You say "ok push" or press Approve push. The approval holds for one turn.' },
      land: { title: 'Lands it', detail: 'For that turn the hook steps aside. The worker follows the landing steps in the project\'s `CLAUDE.md` and reports the SHA.' },
      close: { title: 'Closes the run', detail: 'Once the branch is merged into `develop`, `uat`, `sit` or `main`, without asking. The morning `daily` job does it too.' },
    },
    when: ['UI files changed and the report lists no clicks', 'Code changed and the report lists no inputs tried'],
    refused: {
      title: 'Refused while it works',
      items: [
        'Pushing any branch but its own, such as `develop`, `uat` or `main`',
        'Deleting a branch on the remote',
        'Production: there is no gate, so no approval reaches it',
      ],
    },
  },
  th: {
    label:
      'เส้นทางของงานหนึ่งชิ้น คุณสั่ง nok เขียน brief เปิด worktree บน branch nok/fix-coupon-rounding แล้ว worker แบบ claude -p ทำงาน ระหว่างนั้น pre-push hook ปฏิเสธ branch อื่นและการลบ branch บน remote ส่วน production ไม่มี gate เลย turn ตรวจเกิดเฉพาะเมื่อแก้ UI แต่ไม่ได้กด หรือแก้โค้ดแต่ไม่ได้ลอง input รายงานนับ commit จาก git log งานรอคุณที่ gate ของการ push พอคุณอนุมัติ worker ลงงานใน turn นั้น และ nok ปิดงานเมื่อ branch ถูก merge',
    caption: 'มีสองขั้นที่เป็นของคุณ คือตอนสั่งงานกับตอนอนุมัติ push ที่เหลือเดินเองภายในราวกั้น',
    actors: { you: 'คุณ', twin: 'nok', worker: 'worker' },
    modes: { you: 'คุณลงมือ', alone: 'เดินเอง ไม่ต้องรอคุณ', when: 'เฉพาะบางกรณี' },
    waits: 'รอคุณ',
    steps: {
      ask: { title: 'สั่งงาน', detail: '"ไปแก้เรื่องปัดเศษคูปองใน checkout-web"' },
      brief: { title: 'เขียน brief', detail: 'ชนิดงาน ขนาด เป้าหมาย ข้อจำกัด และเสร็จเมื่อไหร่ ไม่บอกวิธีทำ' },
      worktree: {
        title: 'เปิด worktree',
        detail: 'แตกจาก `origin/develop` คัดลอกไฟล์ `.env` ที่ root และหา port ว่างให้',
        code: ['checkout-web/.claude/worktrees/nok-fix-coupon-rounding', 'branch nok/fix-coupon-rounding'],
      },
      work: { title: 'worker ทำงานแบบไม่มีหน้าจอ', detail: '`claude -p` ใน worktree นั้น ระหว่างนี้คุณคุยกับ nok เรื่องอื่นได้' },
      check: { title: 'turn ตรวจ', detail: 'worker บอกว่าเสร็จ แต่ได้อีกหนึ่ง turn ก่อนรายงานถึงคุณ เมื่อ' },
      report: { title: 'รายงาน', detail: '`done` `needs-approval` `needs-input` หรือ `blocked` นับ commit จาก `git log` ไม่ใช่จากที่ worker บอก' },
      gate: { title: 'gate ของการ push', detail: 'คุณพิมพ์ "ok push" หรือกด Approve push การอนุมัติมีผลแค่ turn เดียว' },
      land: { title: 'ลงงาน', detail: 'ใน turn นั้น hook หลีกทางให้ worker ทำขั้นตอนลงงานตาม `CLAUDE.md` ของโปรเจกต์ แล้วรายงาน SHA' },
      close: { title: 'ปิดงาน', detail: 'เมื่อ branch ถูก merge เข้า `develop` `uat` `sit` หรือ `main` ปิดได้โดยไม่ต้องถาม งาน `daily` ตอนเช้าก็ปิดให้' },
    },
    when: ['แก้ไฟล์ UI แต่รายงานไม่มีการกด', 'แก้โค้ดแต่รายงานไม่มี input ที่ลอง'],
    refused: {
      title: 'ถูกปฏิเสธระหว่างทำงาน',
      items: ['push branch อื่นที่ไม่ใช่ของตัวเอง เช่น `develop` `uat` หรือ `main`', 'ลบ branch บน remote', 'production: ไม่มี gate จึงไม่มีการอนุมัติไหนไปถึง'],
    },
  },
};

const MODES = ['you', 'alone', 'when'] as const satisfies readonly Mode[];

export function RunFlow({ lang }: { lang: Locale }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} caption={c.caption}>
      <div className="dg-legend">
        {MODES.map((m) => (
          <span key={m} className="dg-legend-item">
            <span className={`dg-mark is-${m}`} />
            {c.modes[m]}
          </span>
        ))}
      </div>
      <ol className="dg-steps">
        {STEPS.map((s) => {
          const step = c.steps[s.id];
          return (
            <li key={s.id} className={`dg-step is-${s.mode}`}>
              <span className={`dg-mark is-${s.mode}`} />
              <div className="min-w-0">
                <div className={`dg-card is-${s.actor} ${s.id === 'gate' ? 'dg-rainbow' : ''} ${s.mode === 'when' ? 'is-when' : ''}`}>
                  <div className="dg-card-head">
                    <span className="dg-actor">{c.actors[s.actor]}</span>
                    <span className="dg-title">{step.title}</span>
                    {s.id === 'gate' && <span className="dg-tag">{c.waits}</span>}
                  </div>
                  <p className="dg-detail">
                    <Rich text={step.detail} />
                  </p>
                  {s.id === 'check' && (
                    <ul className="dg-list">
                      {c.when.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                  {step.code && (
                    <div className="dg-codes">
                      {step.code.map((line) => (
                        <code key={line} className="chip-code">
                          {line}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
                {s.id === 'work' && (
                  <div className="dg-refused">
                    <p className="dg-refused-title">{c.refused.title}</p>
                    <ul>
                      {c.refused.items.map((item) => (
                        <li key={item}>
                          <Rich text={item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Diagram>
  );
}
