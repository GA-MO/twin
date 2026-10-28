import { cp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const client = 'build/client';
const out = 'dist';
const base = 'twin';

await rm(out, { recursive: true, force: true });
await cp(join(client, base), out, { recursive: true });
for (const entry of await readdir(client)) {
  if (entry === base) continue;
  if (entry === 'index.html') await cp(join(client, entry), join(out, '404.html'));
  else await cp(join(client, entry), join(out, entry), { recursive: true });
}
await writeFile(join(out, '.nojekyll'), '');
console.log(`pages: ${out}/ ready, served at /${base}/`);
