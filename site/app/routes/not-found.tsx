import type { Route } from './+types/not-found';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { Link, useLocation } from 'react-router';
import { baseOptions } from '@/lib/layout.shared';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Not found · twin' }];
}

export default function NotFound() {
  const th = useLocation().pathname.startsWith('/th');

  return (
    <HomeLayout {...baseOptions(th ? 'th' : 'en')}>
      <div className="p-4 flex flex-col items-center justify-center text-center flex-1 gap-3">
        <h1 className="font-display text-3xl font-semibold">404</h1>
        <p className="text-fd-muted-foreground">
          {th ? 'ไม่พบหน้านี้' : 'This page could not be found.'}
        </p>
        <Link
          className="text-sm bg-fd-primary text-fd-primary-foreground rounded-full font-medium px-4 py-2.5"
          to={th ? '/th/docs' : '/docs'}
        >
          {th ? 'ไปที่เอกสาร' : 'Back to docs'}
        </Link>
      </div>
    </HomeLayout>
  );
}
