import type { Route } from './+types/home';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { Link } from 'react-router';
import { baseOptions } from '@/lib/layout.shared';
import { toLocale } from '@/lib/i18n';

export function loader({ params }: Route.LoaderArgs) {
  const locale = toLocale(params.lang);
  if (!locale) throw new Response('Not found', { status: 404 });
  return { locale };
}

export function meta({}: Route.MetaArgs) {
  return [{ title: 'twin' }];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData;
  return (
    <HomeLayout {...baseOptions(locale)}>
      <div className="p-4 flex flex-col items-center justify-center text-center flex-1">
        <h1 className="text-xl font-bold mb-2">twin</h1>
        <Link to={locale === 'th' ? '/th/docs' : '/docs'}>Docs</Link>
      </div>
    </HomeLayout>
  );
}
