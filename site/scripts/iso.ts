import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isoCss } from '../iso/kit/iso.ts';
import type { Lang, Size, Theme } from '../iso/ck.ts';
import { brief } from '../iso/scenes/brief.ts';
import { data } from '../iso/scenes/data.ts';
import { dispatch } from '../iso/scenes/dispatch.ts';
import { flow } from '../iso/scenes/flow.ts';
import { identity } from '../iso/scenes/identity.ts';

const builders = { flow, brief, identity, dispatch, data };
const out = 'public/iso';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const sizes: Record<string, { width: number; height: number }> = {};
for (const [id, build] of Object.entries(builders))
  for (const lang of ['en', 'th'] as Lang[])
    for (const theme of ['light', 'dark'] as Theme[])
      for (const size of ['compact', 'wide'] as Size[]) {
        const name = `${id}-${lang}-${theme}-${size === 'wide' ? 'lg' : 'sm'}`;
        const s = build({ size, theme, lang }, name);
        await writeFile(`${out}/${name}.html`, s.render());
        sizes[name] = { width: s.width, height: s.height };
      }

await writeFile('app/iso.generated.ts', `export const isoCss = ${JSON.stringify(isoCss)};\nexport const isoSizes: Record<string, { width: number; height: number }> = ${JSON.stringify(sizes)};\n`);
console.log(`iso: ${Object.keys(sizes).length} scenes in ${out}/`);
