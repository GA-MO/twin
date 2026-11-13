import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.env.HOME, '.claude/skills/iso/scripts/node_modules/'));
const { chromium } = require('playwright');
const dir = 'public/iso';
const files = readdirSync(dir).filter((f) => f.endsWith('.html'));
const css = readFileSync('app/iso.generated.ts', 'utf8').match(/isoCss = (".*?");\n/s)[1];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('https://fonts.googleapis.com/css2?family=Inter&family=IBM+Plex+Mono&family=IBM+Plex+Sans+Thai').catch(() => {});
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=block">';
const bad = [];
let checked = 0;
for (const f of files) {
  await page.setContent(`${fonts}<style>${JSON.parse(css)}</style><div style="width:1240px">${readFileSync(join(dir, f), 'utf8')}</div>`);
  await page.evaluate(() => document.fonts.ready);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[class*="fit-w"]')].map((el) => {
      const room = Number(el.getAttribute('class').match(/fit-w(\d+)/)[1]);
      const text = el.querySelector('text') ?? el;
      return { text: text.textContent, room, need: Math.ceil(text.getComputedTextLength()) };
    }),
  );
  checked += found.length;
  for (const t of found) if (t.need > t.room) bad.push(`${f}: "${t.text}" needs ${t.need}, its box gives ${t.room}`);
}
await browser.close();
if (bad.length) {
  console.error(`iso-fit: ${bad.length} of ${checked} box labels are longer than their box:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log(`iso-fit: all ${checked} box labels fit their box`);
