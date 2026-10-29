import type { Locale } from '@/lib/i18n';
import { DeskBoard, type Board } from '@/components/parts/board';
import { approveCard, questionCard } from '@/components/parts/runs';
import { Diagram } from './figure';

type Copy = {
  label: string;
  caption: string;
  approveDetail: string;
  session: string;
  doing: string;
  builder: { task: string; status: string };
  reviewer: string;
  merged: string;
};

const copy: Record<Locale, Copy> = {
  en: {
    label:
      'The /twin panel in Claude Desktop, open beside the chat where /twin was typed. Its heading says 2 waiting on you, 1 in progress, 1 agent working. Then the Approval card for fix-coupon-rounding in checkout-web with Approve push and Report, and the Question card from booking-site with Answer and Report. Under Waiting in other sessions, faq-schema in help-center is ready to ship and waits in the session named morning plan in a terminal, with Take here and Report. Under In progress, mobile-nav in marketing-site has a pulsing green dot and 1 of 2 agents working: a builder fixing the menu overlap, and a reviewer that finished 4 minutes ago. At the bottom, 1 done: dark-mode-toggle, merged 2 hours ago.',
    caption: 'The band and this panel draw one model, so a card has the same words and buttons in both. In a terminal, `/twin` draws the same sections in text, in the same order.',
    approveDetail: 'Tests pass. 3 commits ready on nok/fix-coupon-rounding.',
    session: 'morning plan',
    doing: 'Checking the menu at 375px in Chrome',
    builder: { task: 'Fix the menu overlap', status: 'Editing Header.tsx' },
    reviewer: 'Review the diff',
    merged: 'Merged and closed',
  },
  th: {
    label:
      'แผง /twin ใน Claude Desktop เปิดอยู่ข้างแชตที่พิมพ์ /twin หัวแผงบอกว่า 2 waiting on you, 1 in progress, 1 agent working ถัดมาคือการ์ด Approval ของ fix-coupon-rounding ใน checkout-web พร้อมปุ่ม Approve push และ Report กับการ์ด Question จาก booking-site พร้อมปุ่ม Answer และ Report ใต้หัวข้อ Waiting in other sessions มี faq-schema ใน help-center ที่พร้อม ship รออยู่ในหน้าต่างคุยชื่อแผนเช้าในเทอร์มินัล พร้อมปุ่ม Take here และ Report ใต้หัวข้อ In progress มี mobile-nav ใน marketing-site ที่มีจุดเขียวกะพริบ และ 1 of 2 agents working คือ builder ที่กำลังแก้เมนูซ้อนกัน กับ reviewer ที่เสร็จไปเมื่อ 4 นาทีก่อน ล่างสุดคือ 1 done ได้แก่ dark-mode-toggle ที่ merge แล้วเมื่อ 2 ชั่วโมงก่อน',
    caption: 'แถบสถานะกับแผงนี้วาดจาก model เดียวกัน การ์ดใบเดียวกันจึงมีข้อความและปุ่มเหมือนกันทั้งสองที่ ในเทอร์มินัล `/twin` วาดส่วนเดียวกันนี้เป็นตัวอักษร เรียงลำดับเดียวกัน',
    approveDetail: 'เทสต์ผ่าน มี 3 commit รอ push บน nok/fix-coupon-rounding',
    session: 'แผนเช้า',
    doing: 'กำลังเช็กเมนูที่ 375px ใน Chrome',
    builder: { task: 'แก้เมนูซ้อนกัน', status: 'กำลังแก้ Header.tsx' },
    reviewer: 'รีวิว diff ก่อนรายงาน',
    merged: 'merge แล้ว ปิดงาน',
  },
};

function board(lang: Locale, c: Copy): Board {
  return {
    title: '2 waiting on you',
    summary: '1 in progress · 1 agent working',
    decide: [{ ...approveCard, detail: c.approveDetail }, questionCard(lang)],
    elsewhere: [
      { tone: 'ship', label: 'Ready to ship', ask: 'faq-schema is ready to ship', meta: 'help-center · 25m ago', detail: `Waiting in ‘${c.session}’ in a terminal`, buttons: ['Take here', 'Report'] },
    ],
    moving: [
      {
        slug: 'mobile-nav',
        project: 'marketing-site',
        age: '1m ago',
        doing: c.doing,
        agentsLine: '1 of 2 agents working',
        agents: [
          { description: c.builder.task, status: c.builder.status, role: 'builder', isRunning: true },
          { description: c.reviewer, status: 'done 4m ago', role: 'reviewer', isRunning: false },
        ],
        more: 'Show less',
      },
    ],
    footer: '1 done',
    rest: [{ slug: 'dark-mode-toggle', detail: c.merged, age: '2h ago' }],
  };
}

export function TwinPanel({ lang, withCaption = true }: { lang: Locale; withCaption?: boolean }) {
  const c = copy[lang];
  return (
    <Diagram label={c.label} caption={withCaption ? c.caption : undefined} className="dg-panel">
      <div className="dg-panel-window" aria-hidden>
        <div className="dg-panel-chat">
          <div className="dg-panel-turns">
            <span className="dg-panel-you">/twin</span>
            <span className="dg-panel-reply">Opened the nok pane</span>
          </div>
          <div className="dg-desk-input">
            <span className="term-cursor" />
          </div>
        </div>
        <DeskBoard board={board(lang, c)} name="nok" />
      </div>
    </Diagram>
  );
}
