import type { Locale } from '@/lib/i18n';
import type { BandCard } from './band';

const question: Record<Locale, string> = {
  en: 'Keep the old About copy or use the client’s new one?',
  th: 'หน้า About ใช้ข้อความเดิมหรือข้อความใหม่จากลูกค้า?',
};

export const bandFacts = ['2 waiting on you', '1 in progress', '1 waiting in other sessions'];

export const approveCard: BandCard = { tone: 'approve', label: 'Approval', ask: 'Approve push for fix-coupon-rounding', meta: 'checkout-web · 3m ago', buttons: ['Approve push', 'Report'] };

export const questionCard = (lang: Locale): BandCard => ({ tone: 'question', label: 'Question', ask: question[lang], meta: 'booking-site · 12m ago', buttons: ['Answer', 'Report'] });

export const bandCards = (lang: Locale) => [approveCard, questionCard(lang)];
