import { join, normalize } from 'node:path';

const root = 'dist';
const base = '/twin';
const port = Number(process.env.PORT ?? 4173);

async function find(pathname: string) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|$))+/, '');
  for (const candidate of [rel, join(rel, 'index.html'), `${rel}.html`]) {
    const file = Bun.file(join(root, candidate));
    if ((await file.exists()) && !candidate.endsWith('/')) return file;
  }
  return undefined;
}

Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === '/' || pathname === base) return Response.redirect(`${base}/`, 302);
    if (!pathname.startsWith(`${base}/`)) return new Response('not found', { status: 404 });
    const file = await find(pathname.slice(base.length));
    if (file) return new Response(file);
    return new Response(Bun.file(join(root, '404.html')), { status: 404 });
  },
});
console.log(`http://localhost:${port}${base}/`);
