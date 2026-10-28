import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { uiTranslations } from 'fumadocs-ui/i18n';
import { i18n, type Locale } from './i18n';
import { repoUrl } from './shared';
import { Wordmark } from '@/components/wordmark';

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    en: { displayName: 'English' },
    th: {
      displayName: 'ไทย',
      'Search(search trigger)': 'ค้นหา',
      'Search(search dialog)': 'ค้นหาเอกสาร',
      'No results found(search dialog)': 'ไม่พบผลลัพธ์',
      'On this page(table of contents)': 'ในหน้านี้',
      'No Headings(table of contents)': 'ไม่มีหัวข้อ',
      'Next Page(pagination)': 'หน้าถัดไป',
      'Previous Page(pagination)': 'หน้าก่อนหน้า',
      'Edit on GitHub(edit page)': 'แก้ไขบน GitHub',
      'Last updated on(page footer)': 'แก้ไขล่าสุด',
      'Copy Markdown(page actions)': 'คัดลอก Markdown',
      'Copied Markdown(page actions)': 'คัดลอกแล้ว',
      'Open(page actions)': 'เปิดใน',
      'Language(language switcher)': 'ภาษา',
      'Choose a language(language switcher)': 'เลือกภาษา',
      'Theme(site menu)': 'ธีม',
      'Page Not Found(404 not found page)': 'ไม่พบหน้านี้',
      'Back to Home(404 not found page)': 'กลับหน้าแรก',
    },
  });

export function baseOptions(locale: Locale): BaseLayoutProps {
  return {
    i18n,
    nav: {
      title: <Wordmark />,
      url: locale === 'th' ? '/th' : '/',
    },
    githubUrl: repoUrl,
    links: [
      {
        text: locale === 'th' ? 'เอกสาร' : 'Docs',
        url: locale === 'th' ? '/th/docs' : '/docs',
        active: 'nested-url',
      },
    ],
  };
}
