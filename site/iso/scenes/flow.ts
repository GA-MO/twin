import { blue, clean, ease, esc, figure, geo, merge, motion, n, pal, scene, slideOut, tile, type Variant, type Vec3 } from '../ck.ts';
import { copy } from '../copy.ts';

export function flow(v: Variant, name: string) {
  const c = copy[v.lang];
  const p = pal(v.theme);
  const wide = v.size === 'wide';
  const g = geo(v.size, wide ? 1 : 0.55);
  const s = wide ? scene(name, 1240, 470, [560, 236], p, g.P(20, -20, -2), 840) : scene(name, 390, 590, [195, 252], p, g.P(20, -20, -2), 520);
  const m = motion(s, wide ? [620, 22] : [195, 8]);
  const SIZE = 104;
  const H = 26;
  const WS = 76;
  const YOU = g.P(-210, 210);
  const TWIN = g.P(0, 0);
  const wAt = (k: number) => g.P(235 + k * 90, -235 + k * 90);
  const W = c.flow.workers.map((w, i) => ({ ...w, at: wAt(i - 1.5), raw: [235 + (i - 1.5) * 90, -235 + (i - 1.5) * 90] as const }));

  W.forEach((w) => {
    const pts = clean([g.P(SIZE / 2, 0, -8), g.P(w.raw[0], 0, -8), g.P(w.raw[0], w.raw[1] + WS / 2, -8)]);
    s.wire({ id: `w-${w.id}`, points: pts, stroke: p.wire, width: 1.1, joins: ['twin', w.id] });
    s.wire({ id: `r-${w.id}`, points: [...pts].reverse(), stroke: 'none', joins: [w.id, 'twin'] });
    s.pulse({ id: `q-${w.id}`, wire: `r-${w.id}`, color: '#94a3b8', length: 0.16 });
    s.pulse({ id: `a-${w.id}`, wire: `w-${w.id}`, color: blue, length: 0.16 });
  });
  const youPts = clean([g.P(0, SIZE / 2, -8), g.P(0, 210, -8), g.P(-210 + SIZE / 2, 210, -8)]);
  s.wire({ id: 'w-you', points: youPts, stroke: 'rgb(217 119 6 / .4)', width: 1.1, joins: ['twin', 'you'] });
  s.wire({ id: 'r-you', points: [...youPts].reverse(), stroke: 'none', joins: ['you', 'twin'] });
  s.pulse({ id: 'p-you', wire: 'w-you', color: '#d97706', length: 0.2 });
  s.pulse({ id: 'p-ok', wire: 'r-you', color: '#d97706', length: 0.2 });

  const drawWorker = (w: (typeof W)[number]) => {
    tile(s, g, p, w.id, w.at, w.id, w.name, WS, 18);
    s.face({ id: `${w.id}-scan`, at: [w.at[0], w.at[1], g.S(18)], size: [g.S(WS), g.S(WS)], radius: g.S(14), stroke: blue, fill: 'rgb(79 179 255 / .16)' });
    s.svg(`${w.id}-ok`, s.plane([w.at[0] + g.S(WS / 2 - 12), w.at[1] - g.S(WS / 2 - 12), g.S(18)], `<g transform="scale(${n(Math.max(g.k, 0.7))})"><circle r="8" fill="${blue}"/><path d="M-3.6 0l2.4 2.6 4.8-5.2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`));
  };
  const back = wide ? W.slice(0, 2) : W.slice(2);
  const front = wide ? W.slice(2) : W.slice(0, 2);
  back.forEach(drawWorker);
  figure(s, g, p, 'twin', c.twin, TWIN, SIZE, H);
  [0, 1, 2, 3].forEach((i) => s.face({ id: `ghost-${i}`, at: [YOU[0], YOU[1], g.S(H)], size: [g.S(SIZE), g.S(SIZE)], radius: g.S(22), stroke: 'rgb(26 115 217 / .6)', dash: '4 3' }));
  figure(s, g, p, 'you', c.you, YOU, SIZE, H);
  front.forEach(drawWorker);

  const [yx, yy] = s.project([YOU[0], YOU[1], g.S(H)]);
  const youPill = wide ? { at: [yx, yy - 78] as [number, number], anchor: 'bottom' as const } : { at: [195, 40] as [number, number], anchor: 'top' as const };
  s.label({ id: 'cmd', at: { screen: youPill.at }, html: `<b class="you">${c.you}</b> ${esc(c.flow.cmd)}`, size: 14, anchor: youPill.anchor });
  s.label({ id: 'ask-you', at: { screen: youPill.at }, html: `<b class="tw">${c.twin}</b> ${esc(c.flow.askYou)}`, size: 14, anchor: youPill.anchor });
  s.label({ id: 'ok-you', at: { screen: youPill.at }, html: `<b class="you">${c.you}</b> ${esc(c.flow.ok)}`, size: 14, anchor: youPill.anchor });
  W.forEach((w, i) => {
    const [x, y] = s.project([w.at[0] + g.S(WS / 2), w.at[1] - g.S(WS / 2), g.S(18)]);
    const at: [number, number] = wide ? [x + 16, y + 4] : [195, 444 + i * 34];
    const anchor = wide ? ('left' as const) : ('top' as const);
    s.label({ id: `ask-${w.id}`, at: { screen: at }, html: `<b>${esc(w.name)}</b> ${esc(w.q)}`, size: 13, anchor, className: 'q' });
    s.label({ id: `ans-${w.id}`, at: { screen: at }, html: `<b class="tw">${c.twin}</b> ${esc(w.a)}`, size: 13, anchor, className: 'a' });
  });
  m.status(c.flow.status);

  s.dropIn('you', 0.1);
  W.forEach((w, i) => s.dropIn(w.id, 0.35 + i * 0.08));
  s.introUntil(1.0);

  const L = 16;
  s.loop(L, 13.0);
  const away = s.offset(TWIN, YOU);
  s.set('twin', 'translate', 0, away);
  s.at('twin', 'opacity', 0, 0.01, 0, 0, ease.linear);

  m.say(0, 0.1);
  m.pop('cmd', 0.2, 1.4);
  m.flash('you-glow', 0.3, 0.3);
  m.say(1, 1.2);
  [0, 1, 2, 3].forEach((i) => {
    const t = 1.25 + i * 0.22;
    s.at(`ghost-${i}`, 'opacity', t, 0.1, 0, 1 - 0.22 * i, ease.linear);
    s.at(`ghost-${i}`, 'translate', t, 1.2, '0 0', s.offset(YOU, TWIN), ease.io);
    s.at(`ghost-${i}`, 'opacity', t + 1.1, 0.2, 1 - 0.22 * i, 0, ease.linear);
    s.at(`ghost-${i}`, 'translate', t + 1.32, 0.01, s.offset(YOU, TWIN), '0 0', ease.linear);
  });
  s.at('twin', 'opacity', 1.3, 0.15, 0, 1, ease.linear);
  s.at('twin', 'translate', 1.3, 1.25, away, '0 0', slideOut);
  m.flash('twin-glow', 2.6, 0.3);

  m.say(2, 3.0);
  const reviewAt: number[] = [];
  W.forEach((w, i) => {
    const start = 3.2 + i * 1.05;
    m.tug(w.id, start);
    s.travel(`q-${w.id}`, start + 0.1, m.dur(`r-${w.id}`));
    const thinks = start + 0.1 + m.dur(`r-${w.id}`);
    m.flash('twin-glow', thinks, 0.1);
    s.travel(`a-${w.id}`, thinks + 0.2, m.dur(`w-${w.id}`));
    const home = thinks + 0.2 + m.dur(`w-${w.id}`);
    m.pop(`ask-${w.id}`, start, home - 0.1);
    m.pop(`ans-${w.id}`, home + 0.15, home + 1.5);
    reviewAt.push(home + 1.6);
  });
  m.say(3, reviewAt[0]! - 0.3);
  W.forEach((w, i) => {
    const r = reviewAt[0]! + i * 0.35;
    s.pivot(`${w.id}-scan`, [w.at[0], w.at[1], g.S(18)]);
    s.at(`${w.id}-scan`, 'opacity', r, 0.15, 0, 1, ease.linear);
    s.at(`${w.id}-scan`, 'scale', r, 0.5, 0.7, 1, ease.out);
    s.at(`${w.id}-scan`, 'opacity', r + 0.5, 0.3, 1, 0, ease.linear);
    s.at(`${w.id}-ok`, 'opacity', r + 0.45, 0.15, 0, 1, ease.linear);
    s.at(`${w.id}-ok`, 'scale', r + 0.45, 0.35, 0.3, 1, 'cubic-bezier(.3,1.4,.5,1)');
    s.at(`${w.id}-ok`, 'opacity', L - 0.8, 0.4, 1, 0, ease.linear);
  });
  const toYou = reviewAt[0]! + 1.8;
  m.say(4, toYou);
  s.travel('p-you', toYou, m.dur('w-you'));
  const arrive = toYou + m.dur('w-you');
  s.at('you-glow', 'opacity', arrive, 0.12, 0, 1, ease.linear);
  m.pop('ask-you', arrive, arrive + 1.1);
  const ok = arrive + 1.2;
  m.tug('you', ok, '0 5px');
  m.pop('ok-you', ok, ok + 0.9);
  s.at('you-glow', 'opacity', ok + 0.3, 0.4, 1, 0, ease.linear);
  s.travel('p-ok', ok + 0.2, m.dur('r-you'));
  m.flash('twin-glow', ok + 0.2 + m.dur('r-you'), 0.2);
  const done = ok + 1.5;
  m.say(5, done);
  s.at('twin', 'translate', done + 0.3, 0.85, '0 0', away, merge);
  s.at('twin', 'opacity', done + 1.05, 0.12, 1, 0, ease.linear);
  m.end(L - 0.4);
  return s;
}

export type { Vec3 };
