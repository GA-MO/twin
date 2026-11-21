import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const client = 'build/client';
const out = 'dist';
const base = 'twin';
const moved: Record<string, string> = { 'docs/quick-start': 'docs/install', 'th/docs/quick-start': 'th/docs/install' };

await rm(out, { recursive: true, force: true });
await cp(join(client, base), out, { recursive: true });
for (const entry of await readdir(client)) {
  if (entry === base) continue;
  if (entry === 'index.html') await cp(join(client, entry), join(out, '404.html'));
  else await cp(join(client, entry), join(out, entry), { recursive: true });
}
await writeFile(join(out, '.nojekyll'), '');
for (const [from, to] of Object.entries(moved)) {
  const url = `/${base}/${to}/`;
  await mkdir(join(out, from), { recursive: true });
  await writeFile(join(out, from, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Moved</title><link rel="canonical" href="${url}"><meta http-equiv="refresh" content="0; url=${url}"><a href="${url}">${url}</a>\n`);
}
await cp('../install.sh', join(out, 'install.sh'));
await writeFile(join(out, 'install.ps1'), '& ([scriptblock]::Create((Invoke-RestMethod https://raw.githubusercontent.com/GA-MO/twin/main/install.ps1))) @args\n');
console.log(`pages: ${out}/ ready, served at /${base}/`);
