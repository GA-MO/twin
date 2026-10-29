import type { Route } from './+types/home';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { localePrefix, toLocale } from '@/lib/i18n';
import { siteUrl } from '@/lib/shared';
import { copy } from '@/components/home/copy';
import { Brief, Data, Footer, Hero, HowItWorks, Install, Learn, Work } from '@/components/home/sections';
import '../home.css';

export function loader({ params }: Route.LoaderArgs) {
  const locale = toLocale(params.lang);
  if (!locale) throw new Response('Not found', { status: 404 });
  return { locale };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const { title, description } = copy[loaderData?.locale ?? 'en'].meta;
  const image = `${siteUrl}/og/docs/image.webp`;
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData;
  const c = copy[locale];
  const docs = `${localePrefix(locale)}/docs`;
  const other = locale === 'th' ? '/' : '/th';
  return (
    <HomeLayout {...baseOptions(locale)}>
      <main className="flex-1">
        <Hero c={c} docs={docs} />
        <HowItWorks c={c.flow} eyebrow={c.eyebrows.flow} />
        <Brief c={c.brief} eyebrow={c.eyebrows.brief} lang={locale} docs={docs} />
        <Learn c={c.learn} eyebrow={c.eyebrows.learn} lang={locale} />
        <Work c={c.work} eyebrow={c.eyebrows.work} lang={locale} docs={docs} />
        <Data c={c.data} eyebrow={c.eyebrows.data} lang={locale} docs={docs} />
        <Install c={c.install} docs={docs} />
      </main>
      <Footer c={c.footer} docs={docs} other={other} />
    </HomeLayout>
  );
}
