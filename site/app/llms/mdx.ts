import type { Route } from './+types/mdx';
import { docsLlms, source } from '@/lib/source';
import { toLocale } from '@/lib/i18n';

export async function loader({ params }: Route.LoaderArgs) {
  const locale = toLocale(params.lang);
  const slugs = params['*'].split('/').filter((v) => v.length > 0);
  slugs.pop();
  const page = locale && source.getPage(slugs, locale);
  if (!page) return new Response('not found', { status: 404 });
  return new Response(await docsLlms.page(page), {
    headers: { 'Content-Type': 'text/markdown' },
  });
}
