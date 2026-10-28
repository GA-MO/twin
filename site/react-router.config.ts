import type { Config } from '@react-router/dev/config';
import { glob } from 'node:fs/promises';

const locales = ['en', 'th'];

function parseEntry(entry: string) {
  const parts = entry.replace(/\.mdx$/, '').split('.');
  const locale = parts.length > 1 && locales.includes(parts.at(-1)!) ? parts.pop()! : 'en';
  const slugs = parts.join('.').split('/');
  if (slugs.at(-1) === 'index') slugs.pop();
  return { locale, slugs };
}

export default {
  ssr: false,
  basename: '/twin/',
  async prerender() {
    const paths = new Set<string>(['/', '/th', '/api/search', '/llms.txt', '/llms-full.txt']);

    for await (const entry of glob('**/*.mdx', { cwd: 'content/docs' })) {
      const { locale, slugs } = parseEntry(entry);
      const prefix = locale === 'en' ? '' : `/${locale}`;
      paths.add(`${prefix}/docs${slugs.map((slug) => `/${slug}`).join('')}`);
      paths.add(['/llms.mdx', locale, 'docs', ...slugs, 'content.md'].join('/'));
      if (locale === 'en') paths.add(['/og/docs', ...slugs, 'image.webp'].join('/'));
    }

    return [...paths];
  },
} satisfies Config;
