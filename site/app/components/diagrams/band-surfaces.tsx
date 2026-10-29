import type { Locale } from '@/lib/i18n';
import { DeskBand, TermBand, type BandCard } from '@/components/parts/band';
import { Diagram } from './figure';

type Copy = {
  label: string;
  caption: string;
  desktop: { title: string; note: string };
  terminal: { title: string; note: string };
  question: string;
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'The status band for the same two runs, drawn in Claude Desktop and in a terminal. Both show an Approval card for fix-coupon-rounding in checkout-web with Approve push and Report, then a Question card for booking-site with Answer and Report, inside a rainbow frame, and below it the status line: nok, 2 waiting on you, 1 in progress. Desktop gives each card two rows and adds an Open button; the terminal fits each card on one row.',
    caption: 'One model draws both. The cards, their order, their words and their buttons come from the same code, so the two cannot drift.',
    desktop: { title: 'Claude Desktop', note: 'Two rows per card: the kind and project, then the ask beside its buttons.' },
    terminal: { title: 'Terminal', note: 'One row per card, to save rows. The status line sits under the frame.' },
    question: 'Keep the old About copy or use the client’s new one?',
  },
  th: {
    label:
      'แถบสถานะของงานสองชิ้นเดียวกัน วาดใน Claude Desktop และในเทอร์มินัล ทั้งสองแสดงการ์ด Approval ของ fix-coupon-rounding ใน checkout-web พร้อมปุ่ม Approve push และ Report ตามด้วยการ์ด Question ของ booking-site พร้อมปุ่ม Answer และ Report อยู่ในกรอบสีรุ้ง และบรรทัดสถานะด้านล่างว่า nok, 2 waiting on you, 1 in progress บน Desktop การ์ดหนึ่งใบมีสองแถวและมีปุ่ม Open ส่วนในเทอร์มินัลการ์ดหนึ่งใบอยู่ในแถวเดียว',
    caption: 'ทั้งสองวาดจาก model เดียวกัน การ์ด ลำดับ ข้อความ และปุ่มมาจากโค้ดชุดเดียว จึงไม่มีทางต่างกัน',
    desktop: { title: 'Claude Desktop', note: 'การ์ดละสองแถว แถวแรกคือชนิดและโปรเจกต์ แถวสองคือคำถามกับปุ่ม' },
    terminal: { title: 'เทอร์มินัล', note: 'การ์ดละแถวเดียวเพื่อประหยัดแถว บรรทัดสถานะอยู่ใต้กรอบ' },
    question: 'หน้า About ใช้ข้อความเดิมหรือข้อความใหม่จากลูกค้า?',
  },
};

const facts = ['2 waiting on you', '1 in progress'];

const cards = (question: string): BandCard[] => [
  { tone: 'approve', label: 'Approval', ask: 'Approve push for fix-coupon-rounding', meta: 'checkout-web · 3m ago', buttons: ['Approve push', 'Report'] },
  { tone: 'question', label: 'Question', ask: question, meta: 'booking-site · 12m ago', buttons: ['Answer', 'Report'] },
];

export function BandSurfaces({ lang }: { lang: Locale }) {
  const c = copy[lang];
  const runs = cards(c.question);
  return (
    <Diagram label={c.label} caption={c.caption} className="dg-surfaces">
      <section className="dg-surface">
        <p className="dg-surface-title">{c.desktop.title}</p>
        <div className="dg-desk" aria-hidden>
          <div className="dg-desk-chat">
            <span />
            <span />
          </div>
          <div className="term band-desk">
            <DeskBand cards={runs} name="nok" facts={facts} open="Open" />
          </div>
          <div className="dg-desk-input">
            <span className="term-cursor" />
          </div>
        </div>
        <p className="dg-surface-note">{c.desktop.note}</p>
      </section>
      <section className="dg-surface">
        <p className="dg-surface-title">{c.terminal.title}</p>
        <div className="term dg-term-surface" aria-hidden>
          <div className="term-body">
            <TermBand cards={runs} name="nok" facts={facts} />
            <div className="term-input">
              <span className="term-dim">&gt;</span>
              <span className="term-cursor" />
            </div>
          </div>
        </div>
        <p className="dg-surface-note">{c.terminal.note}</p>
      </section>
    </Diagram>
  );
}
