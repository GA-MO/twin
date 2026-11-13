import { clean, esc, figure, geo, motion, pal, scene, tile, tileSize, type Variant } from '../ck.ts';
import { copy } from '../copy.ts';

export function brief(v: Variant, name: string) {
  const c = copy[v.lang];
  const p = pal(v.theme);
  const wide = v.size === 'wide';
  const g = geo(v.size, wide ? 1 : 0.55);
  const s = wide ? scene(name, 1240, 480, [600, 250], p, g.P(20, -20, -2), 880) : scene(name, 390, 600, [190, 262], p, g.P(20, -20, -2), 560);
  const m = motion(s, wide ? [620, 22] : [195, 8]);
  const pitch = Math.max(62, ...c.brief.sources.map((x) => tileSize(g, x.name, 62) / g.k + (wide ? 8 : 2)));
  const raw = (k: number) => [-200 + (k - 2) * pitch, 200 + (k - 2) * pitch] as const;
  const SRC = c.brief.sources.map((x, k) => ({ ...x, raw: raw(k), at: g.P(...raw(k)) }));
  const TWIN = g.P(20, -20);
  const YOU = g.P(250, -250);

  SRC.forEach((x) => {
    const pts = clean([g.P(x.raw[0] + tileSize(g, x.name, 62) / g.k / 2, x.raw[1], -8), g.P(20, x.raw[1], -8), g.P(20, -20 + 52, -8)]);
    s.wire({ id: `w-${x.id}`, points: pts, stroke: p.wire, width: 1.1, joins: [x.id, 'twin'] });
    s.pulse({ id: `p-${x.id}`, wire: `w-${x.id}`, color: '#4fb3ff', length: 0.18 });
  });
  s.wire({ id: 'w-you', points: clean([g.P(72, -20, -8), g.P(250, -20, -8), g.P(250, -250 + 52, -8)]), stroke: 'rgb(217 119 6 / .4)', width: 1.1, joins: ['twin', 'you'] });
  s.pulse({ id: 'p-you', wire: 'w-you', color: '#d97706', length: 0.22 });

  figure(s, g, p, 'you', c.you, YOU);
  figure(s, g, p, 'twin', c.twin, TWIN);
  (wide ? SRC : [...SRC].reverse()).forEach((x) => tile(s, g, p, x.id, x.at, x.id, x.name, 62, 16, true));

  SRC.forEach((x) => {
    const [px, py] = s.project([x.at[0], x.at[1], g.S(16)]);
    s.label({ id: `n-${x.id}`, at: { screen: wide ? [px - 56, py - 8] : [195, 46] }, html: `<span class="m">${esc(x.name)}</span> ${esc(x.note)}`, size: 13, anchor: wide ? 'right' : 'top' });
  });
  const [tx, ty] = s.project([TWIN[0], TWIN[1], g.S(26)]);
  s.label({ id: 'found', at: { screen: wide ? [tx, ty - 74] : [tx, ty + 34] }, html: `<b class="tw">${c.twin}</b> ${esc(c.brief.found)}`, size: 13, anchor: wide ? 'bottom' : 'top', className: 'a' });
  const [yx, yy] = s.project([YOU[0], YOU[1], g.S(26)]);
  s.label({ id: 'brief', at: { screen: [yx, yy + 34] }, variant: 'card', size: 13, anchor: 'top', html: `<div class="m" style="margin-bottom:.4em">${esc(c.brief.head)}</div>${c.brief.lines.map((l) => `<div>· ${esc(l)}</div>`).join('')}` });

  SRC.forEach((x, i) => s.dropIn(x.id, 0.1 + i * 0.06));
  s.dropIn('twin', 0.4);
  s.dropIn('you', 0.5);
  s.introUntil(1.0);

  m.status(c.brief.status);
  const L = 12;
  s.loop(L, 10.0);
  s.set('you-glow', 'opacity', 0, 0);
  m.say(0, 0.1);
  let last = 0;
  SRC.forEach((x, k) => {
    const t = 0.4 + k * 0.42;
    m.flash(`${x.id}-glow`, t, 0.2);
    m.tug(x.id, t);
    m.pop(`n-${x.id}`, t, wide ? 6.2 + k * 0.05 : t + 0.42 + (k === SRC.length - 1 ? 0.6 : 0));
    s.travel(`p-${x.id}`, t + 0.15, m.dur(`w-${x.id}`));
    last = Math.max(last, t + 0.15 + m.dur(`w-${x.id}`));
  });
  m.say(1, last + 0.1);
  m.flash('twin-glow', last, 0.6);
  m.pop('found', last + 0.2, L - 0.6);
  m.tug('twin', last + 0.2, '0 4px');
  const go = last + 1.4;
  m.say(2, go);
  s.travel('p-you', go, m.dur('w-you'));
  const at = go + m.dur('w-you');
  m.flash('you-glow', at, 0.4);
  m.pop('brief', at + 0.1, L - 0.5);
  s.typeIn('brief', at + 0.1, 1.0, 20);
  m.end(L - 0.4);
  return s;
}
