import type { Locale } from '@/lib/i18n';
import { DeskBand, TermBand } from '@/components/parts/band';
import { bandCards, bandFacts } from '@/components/parts/runs';
import { Diagram } from './figure';

type Copy = {
  label: string;
  caption: string;
  desktop: { title: string; note: string };
  terminal: { title: string; note: string };
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'The status band for the same two runs, drawn in Claude Desktop and in a terminal. Both show an Approval card for fix-coupon-rounding in checkout-web with Approve push and Report, then a Question card for booking-site with Answer and Report, inside a rainbow frame, and below it the status line: nok, 2 waiting on you, 1 in progress, 1 waiting in other sessions. Desktop gives each card two rows and adds an Open button; the terminal fits each card on one row.',
    caption: 'One model draws both. The cards, their order, their words and their buttons come from the same code, so the two cannot drift.',
    desktop: { title: 'Claude Desktop', note: 'Two rows per card: the kind and project, then the ask beside its buttons.' },
    terminal: { title: 'Terminal', note: 'One row per card, to save rows. The status line sits under the frame.' },
  },
  th: {
    label:
      'แถบสถานะของงานสองชิ้นเดียวกัน วาดใน Claude Desktop และในเทอร์มินัล ทั้งสองแสดงการ์ด Approval ของ fix-coupon-rounding ใน checkout-web พร้อมปุ่ม Approve push และ Report ตามด้วยการ์ด Question ของ booking-site พร้อมปุ่ม Answer และ Report อยู่ในกรอบสีรุ้ง และบรรทัดสถานะด้านล่างว่า nok, 2 waiting on you, 1 in progress, 1 waiting in other sessions บน Desktop การ์ดหนึ่งใบมีสองแถวและมีปุ่ม Open ส่วนในเทอร์มินัลการ์ดหนึ่งใบอยู่ในแถวเดียว',
    caption: 'ทั้งสองวาดจาก model เดียวกัน การ์ด ลำดับ ข้อความ และปุ่มมาจากโค้ดชุดเดียว จึงไม่มีทางต่างกัน',
    desktop: { title: 'Claude Desktop', note: 'การ์ดละสองแถว แถวแรกคือชนิดและโปรเจกต์ แถวสองคือคำถามกับปุ่ม' },
    terminal: { title: 'เทอร์มินัล', note: 'การ์ดละแถวเดียวเพื่อประหยัดแถว บรรทัดสถานะอยู่ใต้กรอบ' },
  },
};

export function BandSurfaces({ lang }: { lang: Locale }) {
  const c = copy[lang];
  const runs = bandCards(lang);
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
            <DeskBand cards={runs} name="nok" facts={bandFacts} open="Open" />
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
            <TermBand cards={runs} name="nok" facts={bandFacts} />
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
