import type { Locale } from './i18n';

export const appName = 'twin';
export const basePath = '/twin';
export const siteUrl = `https://ga-mo.github.io${basePath}`;
export const docsRoute = '/docs';

export const gitConfig = {
  user: 'GA-MO',
  repo: 'twin',
  branch: 'main',
};

export const repoUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

export function withBase(path: string): string {
  return `${basePath}${path}`;
}

export function getPageMarkdownUrl(page: { slugs: string[]; locale: Locale }) {
  return ['/llms.mdx', page.locale, 'docs', ...page.slugs, 'content.md'].join('/');
}

export function getPageImageUrl(page: { slugs: string[] }) {
  return ['/og/docs', ...page.slugs, 'image.webp'].join('/');
}
