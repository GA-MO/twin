import type { Locale } from '@/lib/i18n';
import { LevelScale, type LevelCopy } from '@/components/parts/levels';
import { Diagram } from './figure';

type Move = 'up' | 'down' | 'alone';

type Copy = {
  label: string;
  redLines: string;
  startNote: string;
  levels: LevelCopy;
  moves: Record<Move, string>;
};

const MOVES = ['up', 'down', 'alone'] as const satisfies readonly Move[];

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'The autonomy ladder, set per category of decision. observe: watches only. ask: asks you every time. draft: prepares it, you send it. tell: acts, then tells you. silent: acts without reporting. Every category starts at ask. A level moves up only when you say so, and drops one step after a serious mistake in that category. Red lines sit above every level and beat all of them.',
    redLines: 'Red lines beat every level, for every category',
    startNote: 'Every category starts here',
    levels: {
      observe: { name: 'Watch', desc: 'Watches only' },
      ask: { name: 'Ask', desc: 'Asks you every time' },
      draft: { name: 'Draft', desc: 'Prepares it, you send it' },
      tell: { name: 'Do and tell', desc: 'Acts, then tells you' },
      silent: { name: 'Silent', desc: 'Acts without reporting' },
    },
    moves: {
      up: 'Up only on your word',
      down: 'Down one step after a serious mistake in that category',
      alone: 'Each category moves alone. A ceiling, when set, caps it.',
    },
  },
  th: {
    label:
      'บันไดระดับการทำแทน ตั้งแยกตามหมวดการตัดสินใจ observe ดูและจดไว้ ยังไม่เสนอ ask ถามคุณทุกครั้งก่อนทำ draft เตรียมไว้ คุณแค่กดส่ง tell ทำเลย แล้วสรุปให้รู้ silent ทำเองโดยไม่รายงาน ทุกหมวดเริ่มที่ ask ระดับขึ้นได้เฉพาะเมื่อคุณบอก และลดลงหนึ่งขั้นหลังพลาดหนักในหมวดนั้น เส้นห้ามอยู่เหนือทุกระดับและชนะทุกระดับ',
    redLines: 'เส้นห้ามชนะทุกระดับ ในทุกหมวด',
    startNote: 'ทุกหมวดเริ่มที่นี่',
    levels: {
      observe: { name: 'ดูเงียบ', desc: 'ดูและจดไว้ ยังไม่เสนอ' },
      ask: { name: 'ถามก่อน', desc: 'ถามคุณทุกครั้งก่อนทำ' },
      draft: { name: 'ร่างให้', desc: 'เตรียมไว้ คุณแค่กดส่ง' },
      tell: { name: 'ทำแล้วบอก', desc: 'ทำเลย แล้วสรุปให้รู้' },
      silent: { name: 'ทำเงียบ', desc: 'ทำเองโดยไม่รายงาน' },
    },
    moves: {
      up: 'ขึ้นได้เฉพาะเมื่อคุณบอก',
      down: 'ลงหนึ่งขั้น หลังพลาดหนักในหมวดนั้น',
      alone: 'แต่ละหมวดขยับแยกกัน ถ้าตั้งเพดานไว้ จะไม่เกินเพดานนั้น',
    },
  },
};

export function AutonomyLadder({ lang, vertical }: { lang: Locale; vertical?: boolean }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} className={vertical ? 'dg-ladder-vertical' : undefined}>
      <p className="dg-redline">{c.redLines}</p>
      <LevelScale levels={c.levels} startNote={c.startNote} showIds vertical={vertical} />
      <ul className="dg-moves">
        {MOVES.map((m) => (
          <li key={m} className={`dg-move is-${m}`}>
            <span className="dg-move-icon" />
            {c.moves[m]}
          </li>
        ))}
      </ul>
    </Diagram>
  );
}
