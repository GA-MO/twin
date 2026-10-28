import type { Route } from './+types/docs';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { docs, source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { useMDXComponents } from '@/components/mdx';
import { use } from 'react';
import { toLocale } from '@/lib/i18n';
import { appName, getPageImageUrl, getPageMarkdownUrl, gitConfig, siteUrl, withBase } from '@/lib/shared';

export async function loader({ params }: Route.LoaderArgs) {
  const locale = toLocale(params.lang);
  const slugs = params['*'].split('/').filter((v) => v.length > 0);
  const page = locale && source.getPage(slugs, locale);
  if (!locale || !page) throw new Response('Not found', { status: 404 });

  return {
    locale,
    path: page.path,
    markdownUrl: getPageMarkdownUrl({ slugs: page.slugs, locale }),
    imagePath: getPageImageUrl(page),
    pageTree: await source.serializePageTree(source.getPageTree(locale)),
  };
}

function Content({
  path,
  markdownUrl,
  imagePath,
}: {
  path: string;
  markdownUrl: string;
  imagePath: string;
}) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`unknown page: ${path}`);

  const { toc } = use(page.load());
  const Mdx = page.body;

  return (
    <DocsPage toc={toc}>
      <title>{`${page.title} · ${appName}`}</title>
      <meta name="description" content={page.description} />
      <meta property="og:title" content={page.title} />
      <meta property="og:description" content={page.description} />
      <meta property="og:image" content={`${siteUrl}${imagePath}`} />
      <meta name="twitter:card" content="summary_large_image" />
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
        <MarkdownCopyButton markdownUrl={withBase(markdownUrl)} />
        <ViewOptionsPopover
          markdownUrl={`${siteUrl}${markdownUrl}`}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/site/content/docs/${path}`}
        />
      </div>
      <DocsBody>
        <Mdx components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const { locale, pageTree, path, markdownUrl, imagePath } = useFumadocsLoader(loaderData);

  return (
    <DocsLayout {...baseOptions(locale)} tree={pageTree}>
      <Content path={path} markdownUrl={markdownUrl} imagePath={imagePath} />
    </DocsLayout>
  );
}
