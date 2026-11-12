import { blue, clean, ease, esc, figure, geo, motion, pal, scene, settle, tile, type Variant } from '../ck.ts';
import { copy } from '../copy.ts';

export function identity(v: Variant, name: string) {
  const c = copy[v.lang];
  const p = pal(v.theme);
  const wide = v.size === 'wide';
  const g = geo(v.size, wide ? 1 : 0.55);
  const s = wide ? scene(name, 1240, 520, [620, 300], p, g.P(0, 0, -2), 880) : scene(name, 390, 560, [195, 236], p, g.P(0, 0, -2), 560);
  const m = motion(s, wide ? [620, 22] : [195, 8]);
  const YOU = g.P(-230, 230);
  const TWIN = g.P(120, -120);
  const chatRaw = [0, 1, 2].map((k) => [-190 + k * 70, 80] as const);
  const LAYERS = c.identity.layers.map((nm, k) => ({ id: ['rules', 'lines', 'auto'][k]!, name: nm, count: c.identity.counts[k]!, z: [74, 112, 150][k]! }));

  chatRaw.forEach((r, k) => {
    const pts = clean([g.P(r[0] + 30, r[1], -8), g.P(120, r[1], -8), g.P(120, -120 + 60, -8)]);
    s.wire({ id: `w-c${k}`, points: pts, stroke: p.wire, width: 1.1, joins: [`c${k}`, 'twin'] });
    s.pulse({ id: `p-c${k}`, wire: `w-c${k}`, color: '#4fb3ff', length: 0.2 });
  });
  s.wire({ id: 'w-you', points: clean([g.P(-230 + 52, 230, -8), g.P(120, 230, -8), g.P(120, -120 + 60, -8)]), stroke: 'rgb(217 119 6 / .4)', width: 1.1, joins: ['you', 'twin'] });
  s.pulse({ id: 'p-you', wire: 'w-you', color: '#d97706', length: 0.2 });

  figure(s, g, p, 'you', c.you, YOU);
  chatRaw.forEach((r, k) => tile(s, g, p, `c${k}`, g.P(...r), 'chat', c.identity.days[k]!, 60, 14, true));
  figure(s, g, p, 'twin', c.twin, TWIN, 120, 30);
  LAYERS.forEach((l) => {
    s.group(`layer-${l.id}`, () => {
      s.face({ id: `${l.id}-f`, at: [TWIN[0], TWIN[1], g.S(l.z)], size: [g.S(120), g.S(120)], radius: g.S(24), fill: v.theme === 'dark' ? 'rgb(24 27 34 / .85)' : 'rgb(255 255 255 / .82)', stroke: 'rgb(79 179 255 / .55)' });
      s.text({ id: `${l.id}-t`, at: wide ? [TWIN[0] + g.S(40), TWIN[1], g.S(l.z)] : [TWIN[0], TWIN[1] - g.S(40), g.S(l.z)], text: l.name, size: g.t(11), color: p.topText, weight: 600, on: 'top', along: wide ? 'y' : 'x', anchor: 'middle' });
    });
    s.face({ id: `${l.id}-lit`, at: [TWIN[0], TWIN[1], g.S(l.z)], size: [g.S(120), g.S(120)], radius: g.S(24), fill: 'rgb(79 179 255 / .28)', stroke: blue });
  });
  s.face({ id: 'newrule', at: [TWIN[0], TWIN[1], g.S(86)], size: [g.S(80), g.S(80)], radius: g.S(14), fill: '#fff8e1', stroke: '#d97706' });

  LAYERS.forEach((l) => {
    const [x, y] = s.project([TWIN[0] + g.S(60), TWIN[1] - g.S(60), g.S(l.z)]);
    const at: [number, number] = wide ? [x + 14, y] : [195, 452 + LAYERS.indexOf(l) * 30];
    s.label({ id: `c-${l.id}`, at: { screen: at }, html: `<span class="m">${esc(l.name)}</span> ${esc(l.count)}`, size: 13, anchor: wide ? 'left' : 'top' });
    if (l.id === 'rules') s.label({ id: `c2-${l.id}`, at: { screen: at }, html: `<span class="m">${esc(l.name)}</span> <b class="tw">${esc(c.identity.after)}</b>`, size: 13, anchor: wide ? 'left' : 'top', className: 'a' });
  });
  const [tx, ty] = s.project([TWIN[0], TWIN[1], g.S(30)]);
  s.label({ id: 'proposal', at: { screen: wide ? [470, 92] : [195, ty + 50] }, variant: 'card', size: 13, anchor: 'top', html: `<div class="m" style="margin-bottom:.35em">${c.twin} · ${esc(c.identity.from)}</div><div>${esc(c.identity.rule)}</div><div class="m" style="margin-top:.35em">${esc(c.identity.quote)}</div>` });
  void tx;
  const [yx, yy] = s.project([YOU[0], YOU[1], g.S(26)]);
  s.label({ id: 'right', at: { screen: wide ? [yx, yy - 74] : [yx + 46, yy] }, html: `<b class="you">${c.you}</b> ${esc(c.identity.answer)}`, size: 14, anchor: wide ? 'bottom' : 'left', className: 'w' });

  s.dropIn('you', 0.1);
  chatRaw.forEach((_, k) => s.dropIn(`c${k}`, 0.2 + k * 0.07));
  s.dropIn('twin', 0.4);
  LAYERS.forEach((l, k) => {
    s.intro(`layer-${l.id}`, 'opacity', 0.6 + k * 0.1, 0.3, 0, 1, ease.out);
    s.intro(`c-${l.id}`, 'opacity', 0.7 + k * 0.1, 0.3, 0, 1, ease.out);
  });
  s.introUntil(1.1);

  m.status(c.identity.status);
  const L = 14;
  s.loop(L, 11.2);
  s.set('you-glow', 'opacity', 0, 0);
  m.say(0, 0.1);
  let last = 0;
  chatRaw.forEach((_, k) => {
    const t = 0.4 + k * 0.35;
    m.flash(`c${k}-glow`, t, 0.2);
    s.travel(`p-c${k}`, t + 0.1, m.dur(`w-c${k}`));
    last = t + 0.1 + m.dur(`w-c${k}`);
  });
  m.flash('twin-glow', last, 0.4);
  m.say(1, last + 0.2);
  m.pop('proposal', last + 0.3, 7.6);
  const ask = last + 2.3;
  m.say(2, ask);
  m.pop('right', ask + 0.1, ask + 1.6);
  m.tug('you', ask + 0.1, '0 5px');
  s.travel('p-you', ask + 0.3, m.dur('w-you'));
  const lands = ask + 0.3 + m.dur('w-you');
  m.say(3, lands + 0.2);
  s.at('newrule', 'opacity', lands + 0.3, 0.15, 0, 1, ease.linear);
  s.at('newrule', 'translate', lands + 0.3, 0.7, `0 ${-g.S(160)}px`, '0 0', 'cubic-bezier(.55,0,.75,.3)');
  s.at('newrule', 'opacity', lands + 1.0, 0.25, 1, 0, ease.linear);
  m.flash('rules-lit', lands + 1.0, 0.3);
  s.at('layer-rules', 'translate', lands + 1.0, 0.2, '0 0', '0 4px', ease.out).at('layer-rules', 'translate', lands + 1.2, 0.5, '0 4px', '0 0', settle);
  s.at('c-rules', 'opacity', lands + 1.05, 0.15, 1, 0, ease.linear);
  m.pop('c2-rules', lands + 1.1, L - 0.6);
  s.at('c-rules', 'opacity', L - 0.5, 0.3, 0, 1, ease.linear);
  const load = lands + 2.2;
  m.say(4, load);
  ['lines', 'auto'].forEach((id, k) => m.flash(`${id}-lit`, load + 0.2 + k * 0.25, 0.4));
  m.flash('twin-glow', load + 0.9, 0.3);
  m.end(L - 0.4);
  return s;
}
