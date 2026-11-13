import { blue, ease, esc, figure, fit, fitHeight, fitSize, geo, gradient, icons, motion, n, pal, scene, settle, tile, type Variant } from '../ck.ts';
import { copy } from '../copy.ts';

export function data(v: Variant, name: string) {
  const c = copy[v.lang];
  const p = pal(v.theme);
  const wide = v.size === 'wide';
  const g = geo(v.size, wide ? 1 : 0.52);
  const s = wide ? scene(name, 1240, 500, [470, 300], p, g.P(0, 0, -2), 880) : scene(name, 390, 560, [205, 210], p, g.P(0, 0, -2), 560);
  const m = motion(s, wide ? [620, 22] : [195, 8]);
  const list = (i: number): [number, number] => [195, 420 + i * 32];
  const YOU = g.P(-120, 90);
  const TWIN = g.P(40, -70);
  const ENGINE = g.P(330, -330);
  const BACKUP = g.P(40, -360);
  const LEAK = wide ? g.P(400, 70) : g.P(424, -193);

  const BZ = fitSize(g, c.data.backup, 86, 9);
  const BH = fitHeight(g, 18, 9);
  const EZ = fitSize(g, c.data.engine, 92, 9, 0.2);
  s.frame({ id: 'machine', at: [g.P(-30, 0)[0], g.P(-30, 0)[1], g.S(56)], size: [g.S(360), g.S(360)], height: g.S(66), radius: g.S(40), stroke: p.frame, fill: p.frameFill, dash: '5 5' });
  s.wire({ id: 'w-engine', points: [g.P(330, -330 + EZ / g.k / 2, -8), g.P(330, -70, -8), g.P(92, -70, -8)], stroke: p.wire, width: 1.1, joins: ['engine', 'twin'] });
  s.pulse({ id: 'p-engine', wire: 'w-engine', color: blue, length: 0.2 });
  s.wire({ id: 'w-backup', points: [g.P(40, -122, -8), g.P(40, -360 + BZ / g.k / 2, -8)], stroke: p.wire, width: 1.1, joins: ['twin', 'backup'] });
  s.pulse({ id: 'p-backup', wire: 'w-backup', color: blue, length: 0.2 });
  s.wire({ id: 'w-notes', points: [g.P(-120, -110, -8), g.P(40, -110, -8), g.P(40, -122, -8)], stroke: p.wire, width: 1.1, joins: ['notes', 'twin'] });
  s.wire({ id: 'w-journal', points: [g.P(60, 120, -8), g.P(40, 120, -8), g.P(40, -18, -8)], stroke: p.wire, width: 1.1, joins: ['journal', 'twin'] });

  s.group('backup', () => {
    s.slab({ id: 'backup-slab', at: [BACKUP[0], BACKUP[1], BH], size: [BZ, BZ], height: BH, radius: BZ * 0.18, top: p.top, side: gradient(s, p.silver), grain: 0.05, edge: 'rgb(255 255 255 / .5)', outline: p.line, content: `<g transform="scale(${n(g.k)})">${icons(p).cloudUp}</g>` });
    s.text({ id: 'backup-t', at: [BACKUP[0], BACKUP[1] + BZ / 2, BH / 2], text: c.data.backup, size: g.t(9), color: p.sideText, on: 'left', anchor: 'middle', className: fit(BZ, BZ * 0.18) });
  });
  tile(s, g, p, 'notes', g.P(-120, -110), 'notes', c.data.notes, 66, 14, true);
  tile(s, g, p, 'journal', g.P(60, 120), 'docs', c.data.journal, 66, 14, true);
  figure(s, g, p, 'twin', c.twin, TWIN);
  figure(s, g, p, 'you', c.you, YOU, 96, 22);
  s.group('engine', () => {
    s.slab({ id: 'engine-slab', at: [ENGINE[0], ENGINE[1], g.S(22)], size: [EZ, EZ], height: g.S(22), radius: EZ * 0.2, top: p.top, side: gradient(s, p.steel), grain: 0.05, edge: 'rgb(255 255 255 / .5)', outline: p.line });
    s.text({ id: 'engine-t', at: [ENGINE[0], ENGINE[1], g.S(22)], text: c.data.engine, size: g.t(9), color: p.sideText, on: 'top', along: wide ? 'y' : 'x', anchor: 'middle', className: fit(EZ, EZ * 0.2) });
  });
  s.group('cloud', () => {
    s.slab({ id: 'cloud-slab', at: [LEAK[0], LEAK[1], g.S(14)], size: [g.S(86), g.S(86)], height: g.S(14), radius: g.S(16), top: p.top, side: gradient(s, p.silver), grain: 0.03, edge: 'rgb(255 255 255 / .4)', outline: p.line, content: `<g transform="scale(${n(g.k)})">${icons(p).noCloud}</g>` });
  });

  const [mx, my] = s.project(g.P(150, 150));
  s.label({ id: 'mach', at: { screen: wide ? [mx, my + 24] : list(3) }, html: `<span class="m">${esc(c.data.machine)}</span>`, size: 13, anchor: 'top' });
  const [ex, ey] = s.project([ENGINE[0], ENGINE[1], g.S(22)]);
  s.label({ id: 'pull', at: { screen: wide ? [ex, ey + 52] : list(0) }, html: `<b class="tw">git pull</b> ${esc(c.data.pull)}`, size: 13, anchor: 'top', className: 'a' });
  const [bx, by] = s.project([BACKUP[0], BACKUP[1], BH]);
  s.label({ id: 'bk', at: { screen: wide ? [bx + 58, by - 10] : list(1) }, html: `<b class="tw">${esc(c.data.hourly)}</b> ${esc(c.data.backupNote)}`, size: 13, anchor: wide ? 'left' : 'top', className: 'a' });
  const [cx, cy] = s.project([LEAK[0], LEAK[1], g.S(14)]);
  s.label({ id: 'none', at: { screen: wide ? [cx + 56, cy] : list(2) }, html: `<span class="m">${esc(c.data.none)}</span>`, size: 13, anchor: wide ? 'left' : 'top' });

  s.intro('machine', 'opacity', 0.1, 0.5, 0, 1, ease.out);
  s.dropIn('twin', 0.2);
  s.dropIn('you', 0.3);
  s.dropIn('notes', 0.35);
  s.dropIn('journal', 0.42);
  s.dropIn('engine', 0.5);
  s.dropIn('backup', 0.55);
  s.dropIn('cloud', 0.6);
  s.intro('mach', 'opacity', 0.8, 0.3, 0, 1, ease.out);
  s.introUntil(1.1);

  m.status(c.data.status);
  const L = 12;
  s.loop(L, 10.2);
  s.set('you-glow', 'opacity', 0, 0);
  m.say(0, 0.1);
  m.flash('notes-glow', 0.4, 0.3);
  m.flash('journal-glow', 0.7, 0.3);
  m.flash('twin-glow', 1.1, 0.3);
  m.say(1, 2.0);
  s.travel('p-engine', 2.2, m.dur('w-engine'));
  const up = 2.2 + m.dur('w-engine');
  m.tug('twin', up, '0 4px');
  m.pop('pull', up, L - 0.6);
  m.say(2, up + 1.2);
  s.travel('p-backup', up + 1.4, m.dur('w-backup'));
  const bk = up + 1.4 + m.dur('w-backup');
  m.tug('backup', bk);
  m.pop('bk', bk, L - 0.6);
  m.say(3, bk + 1.2);
  m.pop('none', bk + 1.6, L - 0.6);
  s.at('machine', 'opacity', bk + 1.8, 0.15, 1, 0.5, ease.linear).at('machine', 'opacity', bk + 1.95, 0.4, 0.5, 1, settle);
  m.end(L - 0.4);
  return s;
}
