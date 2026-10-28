import { route, type RouteConfig } from '@react-router/dev/routes';

export default [
  route('api/search', 'routes/search.ts'),
  route('og/docs/*', 'routes/og.docs.tsx'),
  route('llms.txt', 'llms/index.ts'),
  route('llms-full.txt', 'llms/full.ts'),
  route('llms.mdx/:lang/docs/*', 'llms/mdx.ts'),
  route(':lang?/docs/*', 'routes/docs.tsx'),
  route(':lang?', 'routes/home.tsx'),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
