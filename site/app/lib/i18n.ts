import { defineI18n } from 'fumadocs-core/i18n';

export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'th'],
  hideLocale: 'default-locale',
  parser: 'dot',
});

export type Locale = (typeof i18n.languages)[number];

export function toLocale(value: string | undefined): Locale | undefined {
  if (value === undefined) return i18n.defaultLanguage;
  return i18n.languages.find((lang) => lang === value);
}

export function localePrefix(locale: Locale): string {
  return locale === i18n.defaultLanguage ? '' : `/${locale}`;
}
