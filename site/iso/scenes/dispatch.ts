import { blue, blueRamp, clean, ease, esc, figure, geo, goldRamp, gradient, motion, pal, scene, settle, type Variant, type Vec3 } from '../ck.ts';
import { copy } from '../copy.ts';

export function dispatch(v: Variant, name: string) {
  const c = copy[v.lang];
  const p = pal(v.theme);
  const wide = v.size === 'wide';
  const g = geo(v.size, wide ? 1 : 0.55);
  const s = wide ? scene(name, 1240, 500, [600, 240], p, g.P(0, 0, -2), 880) : scene(name, 390, 520, [207, 196], p, g.P(0, 0, -2), 560);
  const m = motion(s, wide ? [620, 22] : [195, 8]);
  const list = (i: number): [number, number] => [195, 360 + i * 32];
  const RX = -40;
  const GATE = 150;
  const REPOS = [
    { id: 'shop', name: 'shop-web', y: -130, branch: 'gamo/fix-coupon' },
    { id: 'api', name: 'api', y: 0, branch: 'gamo/rate-limit' },
    { id: 'docs', name: 'docs', y: 130, branch: 'gamo/new-guide' },
  ];
  const TWIN = g.P(-250, 0);
  const ORIGIN = g.P(300, 0);
  const at = (x: number, y: number, z = 0): Vec3 => g.P(x, y, z);

  REPOS.forEach((r) => {
    const into = r.y === 0 ? [at(-198, 0, -8), at(RX - 45, 0, -8)] : [at(-198, Math.sign(r.y) * 30, -8), at(-150, Math.sign(r.y) * 30, -8), at(-150, r.y, -8), at(RX - 45, r.y, -8)];
    s.wire({ id: `w-${r.id}`, points: clean(into), stroke: p.wire, width: 1.1, joins: ['twin', r.id] });
    s.pulse({ id: `p-${r.id}`, wire: `w-${r.id}`, color: blue, length: 0.18 });
    const out = r.y === 0 ? [at(RX + 45, 0, -8), at(250, 0, -8)] : [at(RX + 45, r.y, -8), at(GATE - 30, r.y, -8), at(GATE - 30, Math.sign(r.y) * 30, -8), at(250, Math.sign(r.y) * 30, -8)];
    s.wire({ id: `o-${r.id}`, points: clean(out), stroke: p.wire, width: 1.1, joins: [r.id, 'origin'] });
    s.pulse({ id: `po-${r.id}`, wire: `o-${r.id}`, color: blue, length: 0.18 });
  });
  s.wire({ id: 'w-main', points: [at(RX + 45, -130, -8), at(GATE - 30, -130, -8)], stroke: 'none', joins: ['shop', 'gate'] });
  s.pulse({ id: 'p-main', wire: 'w-main', color: '#d97706', length: 0.3 });

  figure(s, g, p, 'twin', c.twin, TWIN);
  REPOS.forEach((r) => {
    const c0 = at(RX, r.y);
    s.group(r.id, () => {
      s.slab({ id: `${r.id}-slab`, at: [c0[0], c0[1], g.S(16)], size: [g.S(90), g.S(90)], height: g.S(16), radius: g.S(16), top: p.top, side: gradient(s, p.silver), grain: 0.05, edge: 'rgb(255 255 255 / .5)', outline: p.line });
      s.text({ id: `${r.id}-name`, at: [c0[0], c0[1] + g.S(45), g.S(8)], text: r.name, size: g.t(10), color: p.sideText, weight: 500, on: 'left', anchor: 'middle' });
    });
    s.group(`${r.id}-wt`, () => {
      s.slab({ id: `${r.id}-wt-slab`, at: [c0[0], c0[1], g.S(26)], size: [g.S(62), g.S(62)], height: g.S(10), radius: g.S(10), top: v.theme === 'dark' ? '#16263d' : '#f2f8ff', side: gradient(s, blueRamp), grain: 0.05, edge: 'rgb(255 255 255 / .5)', outline: p.line });
      s.text({ id: `${r.id}-wt-t`, at: [c0[0], c0[1], g.S(26)], text: c.dispatch.worktree, size: g.t(8), color: p.topText, on: 'top', along: wide ? 'y' : 'x', anchor: 'middle' });
    });
  });
  const gate = at(GATE, -130);
  s.group('gate', () => {
    s.slab({ id: 'gate-slab', at: [gate[0], gate[1], g.S(54)], size: wide ? [g.S(16), g.S(96)] : [g.S(96), g.S(16)], height: g.S(54), radius: g.S(5), top: '#fde68a', side: gradient(s, goldRamp), grain: 0.04, edge: 'rgb(255 255 255 / .5)', outline: p.line });
  });
  s.group('origin', () => {
    s.slab({ id: 'origin-slab', at: [ORIGIN[0], ORIGIN[1], g.S(22)], size: [g.S(100), g.S(100)], height: g.S(22), radius: g.S(18), top: p.top, side: gradient(s, p.steel), grain: 0.05, edge: 'rgb(255 255 255 / .5)', outline: p.line });
    s.text({ id: 'origin-t', at: [ORIGIN[0], ORIGIN[1], g.S(22)], text: c.dispatch.origin, size: g.t(11), color: p.sideText, on: 'top', along: wide ? 'y' : 'x', anchor: 'middle' });
  });
  s.face({ id: 'origin-glow', at: [ORIGIN[0], ORIGIN[1], g.S(22)], size: [g.S(100), g.S(100)], radius: g.S(18), fill: 'rgb(79 179 255 / .3)' });

  REPOS.forEach((r, i) => {
    const [x, y] = s.project(at(RX - 45, r.y + 45, 26));
    s.label({ id: `b-${r.id}`, at: { screen: wide ? [x - 8, y + 10] : list(i) }, html: `<span class="m">${esc(r.branch)}</span>`, size: 13, anchor: wide ? 'right' : 'top' });
  });
  const [gx, gy] = s.project([gate[0], gate[1], g.S(60)]);
  s.label({ id: 'refused', at: { screen: wide ? [gx, gy - 46] : list(1) }, html: `<b class="you">main</b> ${esc(c.dispatch.main)}`, size: 13, anchor: wide ? 'bottom' : 'top', className: 'w' });
  const [ox, oy] = s.project([ORIGIN[0], ORIGIN[1], g.S(22)]);
  s.label({ id: 'pushed', at: { screen: wide ? [ox + 70, oy] : list(0) }, html: `<b class="tw">${esc(c.dispatch.branches)}</b> ${esc(c.dispatch.pushed)}`, size: 13, anchor: wide ? 'left' : 'top', className: 'a' });
  s.label({ id: 'prod', at: { screen: wide ? [ox + 70, oy + 40] : list(2) }, html: `<span class="m">${esc(c.dispatch.prod)}</span> ${esc(c.dispatch.noButton)}`, size: 13, anchor: wide ? 'left' : 'top' });

  s.dropIn('twin', 0.1);
  REPOS.forEach((r, i) => s.dropIn(r.id, 0.25 + i * 0.08));
  s.dropIn('gate', 0.5);
  s.dropIn('origin', 0.6);
  s.introUntil(1.1);

  m.status(c.dispatch.status);
  const L = 13;
  s.loop(L, 11.4);
  s.set('twin-glow', 'opacity', 0, 0);
  REPOS.forEach((r) => s.set(`${r.id}-wt`, 'opacity', 0, 0));
  m.say(0, 0.1);
  let built = 0;
  REPOS.forEach((r, i) => {
    const t = 0.3 + i * 0.45;
    s.travel(`p-${r.id}`, t, m.dur(`w-${r.id}`));
    const t2 = t + m.dur(`w-${r.id}`);
    s.at(`${r.id}-wt`, 'opacity', t2, 0.15, 0, 1, ease.linear);
    s.at(`${r.id}-wt`, 'translate', t2, 0.5, `0 ${-g.S(40)}px`, '0 0', 'cubic-bezier(.3,1.4,.5,1)');
    s.at(`${r.id}-wt`, 'opacity', L - 0.6, 0.4, 1, 0, ease.linear);
    m.pop(`b-${r.id}`, t2 + 0.2, wide ? L - 0.6 : 3.6);
    built = Math.max(built, t2 + 0.6);
  });
  m.say(1, built + 0.6);
  let pushed = 0;
  REPOS.forEach((r, i) => {
    const t = built + 0.9 + i * 0.4;
    s.travel(`po-${r.id}`, t, m.dur(`o-${r.id}`));
    pushed = Math.max(pushed, t + m.dur(`o-${r.id}`));
  });
  m.flash('origin-glow', pushed, 0.3);
  m.pop('pushed', pushed + 0.1, L - 0.6);
  const tryMain = pushed + 1.0;
  m.say(2, tryMain);
  s.travel('p-main', tryMain, m.dur('w-main'));
  const hit = tryMain + m.dur('w-main');
  s.at('gate', 'translate', hit, 0.12, '0 0', '0 -4px', ease.out).at('gate', 'translate', hit + 0.12, 0.5, '0 -4px', '0 0', settle);
  m.pop('refused', hit + 0.05, L - 0.6);
  m.pop('prod', hit + 0.8, L - 0.6);
  m.end(L - 0.4);
  return s;
}
