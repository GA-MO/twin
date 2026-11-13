import { Scene, ease, type Material, type SidePaint, type Vec2, type Vec3 } from './kit/iso.ts';

export { ease, Scene };
export type { Vec2, Vec3 };

export type Size = 'wide' | 'compact';
export type Theme = 'light' | 'dark';
export type Lang = 'en' | 'th';
export type Variant = { size: Size; theme: Theme; lang: Lang };
export type Ramp = readonly [string, string, string, string];

export const blue = '#1a73d9';
export const amber = '#d97706';
export const blueRamp: Ramp = ['#0b3a6b', '#1a73d9', '#4fb3ff', '#cfe6ff'];
export const goldRamp: Ramp = ['#7c2d12', '#d97706', '#fbbf24', '#fef3c7'];
export const settle = 'cubic-bezier(.39,.08,.04,.91)';
export const pull = 'cubic-bezier(.41,.27,.05,.79)';
export const springy = 'cubic-bezier(.3,1.4,.5,1)';
export const slideOut = 'cubic-bezier(.38,.08,0,.97)';
export const merge = 'cubic-bezier(.52,.18,.25,1)';
export const fonts = { sans: "'Inter', 'IBM Plex Sans Thai', system-ui, sans-serif", mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace" };

const palettes = {
  light: {
    top: '#ffffff',
    silver: ['#9aa3b2', '#c9d0db', '#e6eaf0', '#fafbfc'] as Ramp,
    steel: ['#3f3f46', '#71717a', '#d4d4d8', '#fafafa'] as Ramp,
    line: 'rgb(13 14 18 / .16)',
    wire: 'rgb(13 14 18 / .17)',
    dot: 'rgb(13 14 18 / .13)',
    sideText: '#3f3f46',
    topText: '#0b3a6b',
    iconInk: '#52617a',
    iconPaper: '#ffffff',
    iconLine: '#c8cdd6',
    frame: 'rgb(26 115 217 / .35)',
    frameFill: 'rgb(79 179 255 / .04)',
    label: { bg: '#ffffff', border: 'rgb(13 14 18 / .12)', ink: '#0d0e12', radius: 8 },
  },
  dark: {
    top: '#181b22',
    silver: ['#0c0e13', '#1d2029', '#323745', '#6b7385'] as Ramp,
    steel: ['#0c0e13', '#272a33', '#4b505e', '#a3a8b4'] as Ramp,
    line: 'rgb(255 255 255 / .1)',
    wire: 'rgb(255 255 255 / .18)',
    dot: 'rgb(255 255 255 / .1)',
    sideText: '#c9ccd4',
    topText: '#cfe6ff',
    iconInk: '#aab3c5',
    iconPaper: '#232733',
    iconLine: '#3a4050',
    frame: 'rgb(79 179 255 / .4)',
    frameFill: 'rgb(79 179 255 / .05)',
    label: { bg: '#14161c', border: 'rgb(255 255 255 / .13)', ink: '#eceef3', radius: 8 },
  },
};
export type Palette = (typeof palettes)[Theme];

export const n = (v: number) => Number(v.toFixed(2));

const defs = new WeakMap<Scene, Map<string, string>>();

export function gradient(s: Scene, ramp: Ramp): Material {
  const id = `grad-${ramp.join('').replace(/[^a-z0-9]/gi, '')}`;
  const made = defs.get(s) ?? new Map<string, string>();
  defs.set(s, made);
  const paint: SidePaint = (_, a, t, band) => {
    const key = `${id}-${Math.round(band.y0)}-${Math.round(band.y1)}`;
    let url = made.get(key);
    if (!url) {
      url = s.def(key, `<linearGradient id="$ID" gradientUnits="userSpaceOnUse" x1="0" y1="${n(band.y0)}" x2="0" y2="${n(band.y1)}"><stop offset="0" stop-color="${ramp[3]}"/><stop offset=".05" stop-color="${ramp[2]}"/><stop offset=".5" stop-color="${ramp[1]}"/><stop offset="1" stop-color="${ramp[0]}"/></linearGradient>`);
      made.set(key, url);
    }
    return `<rect x="${n(a.x)}" y="${n(a.y)}" width="${n(a.width)}" height="${n(a.height)}" fill="${url}" transform="${t}"/>`;
  };
  return { kind: 'custom', paint };
}

export type Geo = {
  k: number;
  wide: boolean;
  P: (x: number, y: number, z?: number) => Vec3;
  S: (v: number) => number;
  t: (v: number) => number;
};

export function geo(size: Size, k: number): Geo {
  const wide = size === 'wide';
  return {
    k,
    wide,
    P: (x, y, z = 0) => (wide ? [x * k, y * k, z * k] : [-y * k, x * k, z * k]),
    S: (v) => v * k,
    t: (v) => n(v * Math.max(k, 0.78)),
  };
}

export function scene(name: string, width: number, height: number, origin: Vec2, pal: Palette, floor: Vec3, span: number) {
  const s = new Scene({ name, width, height, origin, font: fonts.sans, mono: fonts.mono, label: pal.label });
  const dots = s.def('dots', `<pattern id="$ID" patternUnits="userSpaceOnUse" width="18" height="18"><circle cx="9" cy="9" r="1" fill="${pal.dot}"/></pattern>`);
  const fade = s.def('fade', '<radialGradient id="$ID"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>');
  const mask = s.def('fade-mask', `<mask id="$ID" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="${fade}"/></mask>`);
  s.svg('floor', s.plane(floor, `<rect x="${-span / 2}" y="${-span / 2}" width="${span}" height="${span}" fill="${dots}" mask="${mask}"/>`));
  return s;
}

const MARK = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
export const textWidth = (text: string, size: number) => [...text].reduce((w, ch) => w + (MARK.test(ch) ? 0 : 0.6 * size), 0);

export const fit = (face: number, radius: number) => `fit-w${Math.floor(face - radius)}`;

export function fitSize(g: Geo, name: string, raw: number, font = 10, frac = 0.18) {
  const fs = g.t(font);
  return Math.max(g.S(raw), (textWidth(name, fs) + 0.6 * fs) / (1 - frac));
}

export const fitHeight = (g: Geo, raw: number, font = 10) => Math.max(g.S(raw), g.t(font) * 1.5);

export const person = (color: string, k: number) => `<g transform="scale(${n(k)})"><circle cx="0" cy="-10" r="9" fill="${color}"/><path d="M-17 18c0-11 8-17 17-17s17 6 17 17z" fill="${color}"/></g>`;

export function figure(s: Scene, g: Geo, pal: Palette, who: 'you' | 'twin', name: string, at: Vec3, size = 104, h = 26) {
  const warm = who === 'you';
  const z = fitSize(g, name, size, 11, 0.21);
  const hh = fitHeight(g, h, 11);
  s.group(who, () => {
    s.slab({ id: `${who}-slab`, at: [at[0], at[1], hh], size: [z, z], height: hh, radius: z * 0.21, top: pal.top, side: gradient(s, warm ? goldRamp : blueRamp), grain: 0.05, edge: 'rgb(255 255 255 / .55)', outline: pal.line, content: person(warm ? '#fbbf24' : '#4fb3ff', g.k) });
    s.text({ id: `${who}-name`, at: [at[0], at[1] + z / 2, hh / 2], text: name, size: g.t(11), color: '#ffffff', weight: 600, on: 'left', anchor: 'middle', className: fit(z, z * 0.21) });
  });
  s.face({ id: `${who}-glow`, at: [at[0], at[1], hh], size: [z, z], radius: z * 0.21, fill: warm ? 'rgb(251 191 36 / .4)' : 'rgb(79 179 255 / .35)' });
}

export function icons(pal: Palette): Record<string, string> {
  const paper = pal.iconPaper;
  const ln = pal.iconLine;
  return {
    docs: `<rect x="-16" y="-20" width="32" height="40" rx="4" fill="${paper}" stroke="${ln}"/><rect x="-10" y="-12" width="20" height="3" rx="1.5" fill="#9aa3b2"/><rect x="-10" y="-4" width="16" height="3" rx="1.5" fill="${ln}"/><rect x="-10" y="4" width="18" height="3" rx="1.5" fill="${ln}"/>`,
    design: `<rect x="-22" y="-16" width="44" height="32" rx="4" fill="${paper}" stroke="${ln}"/><rect x="-16" y="-10" width="14" height="10" rx="2" fill="#4fb3ff" opacity=".5"/><rect x="2" y="-10" width="14" height="4" rx="2" fill="${ln}"/><rect x="-16" y="4" width="32" height="6" rx="2" fill="#4fb3ff" opacity=".25"/>`,
    code: `<text x="0" y="6" text-anchor="middle" font-family="${fonts.mono}" font-size="18" fill="${pal.iconInk}">&lt;/&gt;</text>`,
    tests: '<rect x="-18" y="2" width="8" height="12" rx="2" fill="#9cc8ff"/><rect x="-4" y="-8" width="8" height="22" rx="2" fill="#4fb3ff"/><rect x="10" y="-14" width="8" height="28" rx="2" fill="#1a73d9"/>',
    calendar: `<rect x="-18" y="-16" width="36" height="34" rx="5" fill="${paper}" stroke="${ln}"/><rect x="-18" y="-16" width="36" height="9" rx="4" fill="#4fb3ff"/><circle cx="-8" cy="4" r="2.5" fill="#9aa3b2"/><circle cx="0" cy="4" r="2.5" fill="#9aa3b2"/><circle cx="8" cy="4" r="2.5" fill="#1a73d9"/><circle cx="-8" cy="11" r="2.5" fill="${ln}"/>`,
    repos: `<circle cx="-10" cy="-12" r="4.5" fill="none" stroke="${pal.iconInk}" stroke-width="2.4"/><circle cx="-10" cy="12" r="4.5" fill="none" stroke="${pal.iconInk}" stroke-width="2.4"/><circle cx="10" cy="-2" r="4.5" fill="none" stroke="#4fb3ff" stroke-width="2.4"/><path d="M-10 -7.5v15M-10 4c0-6 20-2 20-6" fill="none" stroke="${pal.iconInk}" stroke-width="2.4"/>`,
    notes: '<rect x="-16" y="-18" width="32" height="36" rx="3" fill="#fff8db" stroke="#e5c66a"/><rect x="-10" y="-10" width="20" height="3" rx="1.5" fill="#d4b45a"/><rect x="-10" y="-2" width="16" height="3" rx="1.5" fill="#e9d18b"/>',
    runs: '<rect x="-20" y="-16" width="40" height="32" rx="5" fill="#16171b" stroke="#3a3c44"/><path d="M-13 -6l5 4-5 4" stroke="#4fb3ff" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="-4" y="1" width="14" height="3" rx="1.5" fill="#9aa3b2"/>',
    deps: `<path d="M0 -20l17 8v13c0 10-8 16-17 19-9-3-17-9-17-19v-13z" fill="${paper}" stroke="${ln}"/><path d="M-7 1l5 5 9-10" stroke="#4fb3ff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    chat: '<rect x="-20" y="-16" width="34" height="20" rx="8" fill="#9aa3b2" opacity=".45"/><rect x="-12" y="0" width="34" height="18" rx="8" fill="#fbbf24"/>',
    cloudUp: '<path d="M-14 6a10 10 0 0 1 2-19 13 13 0 0 1 25 3 8 8 0 0 1-1 16z" fill="#4fb3ff" fill-opacity=".18" stroke="#4fb3ff"/><path d="M0 2v12M-5 7l5-5 5 5" stroke="#1a73d9" stroke-width="2" fill="none" stroke-linecap="round"/>',
    noCloud: `<path d="M-18 8a12 12 0 0 1 3-23 15 15 0 0 1 29 4 9 9 0 0 1-1 19z" fill="none" stroke="${ln}" stroke-dasharray="3 3"/><path d="M-9 -4l18 14M9 -4l-18 14" stroke="${ln}" stroke-width="2"/>`,
  };
}

export const tileSize = (g: Geo, name: string, size = 76) => fitSize(g, name, size);

export function tile(s: Scene, g: Geo, pal: Palette, id: string, at: Vec3, icon: string, name: string, size = 76, h = 18, glow = false) {
  const z = fitSize(g, name, size);
  const hh = fitHeight(g, h);
  s.group(id, () => {
    s.slab({ id: `${id}-slab`, at: [at[0], at[1], hh], size: [z, z], height: hh, radius: z * 0.18, top: pal.top, side: gradient(s, pal.silver), grain: 0.05, edge: 'rgb(255 255 255 / .5)', outline: pal.line, content: `<g transform="scale(${n(g.k * Math.min(1, size / 76))})">${icons(pal)[icon] ?? ''}</g>` });
    s.text({ id: `${id}-name`, at: [at[0], at[1] + z / 2, hh / 2], text: name, size: g.t(10), color: pal.sideText, weight: 500, on: 'left', anchor: 'middle', className: fit(z, z * 0.18) });
  });
  if (glow) s.face({ id: `${id}-glow`, at: [at[0], at[1], hh], size: [z, z], radius: z * 0.18, fill: 'rgb(79 179 255 / .3)' });
}

export const clean = (pts: Vec3[]) => pts.filter((q, i, a) => i === 0 || q[0] !== a[i - 1]![0] || q[1] !== a[i - 1]![1] || q[2] !== a[i - 1]![2]);

export function motion(s: Scene, statusAt: Vec2) {
  let shown = -1;
  const dur = (w: string) => Math.max(0.3, s.wireLength(w) / 320);
  return {
    dur,
    status(lines: readonly string[]) {
      lines.forEach((t, i) => s.label({ id: `st-${i}`, at: { screen: statusAt }, text: t, size: 15, anchor: 'top', className: 'iso-st' }));
    },
    say(i: number, t: number) {
      if (shown >= 0) s.at(`st-${shown}`, 'opacity', t, 0.2, 1, 0, ease.linear);
      s.at(`st-${i}`, 'opacity', t + 0.05, 0.25, 0, 1, ease.out);
      s.at(`st-${i}`, 'translate', t + 0.05, 0.4, '0 6px', '0 0', ease.out);
      shown = i;
    },
    end(t: number) {
      if (shown >= 0) s.at(`st-${shown}`, 'opacity', t, 0.3, 1, 0, ease.linear);
    },
    pop(id: string, t: number, until: number) {
      s.at(id, 'opacity', t, 0.2, 0, 1, ease.out);
      s.at(id, 'translate', t, 0.35, '0 6px', '0 0', springy);
      s.at(id, 'opacity', until, 0.2, 1, 0, ease.linear);
    },
    flash(id: string, t: number, hold = 0.15) {
      s.at(id, 'opacity', t, 0.1, 0, 1, ease.linear).at(id, 'opacity', t + 0.1 + hold, 0.45, 1, 0, ease.linear);
    },
    tug(id: string, t: number, by = '0 -7px') {
      s.at(id, 'translate', t, 0.25, '0 0', by, pull).at(id, 'translate', t + 0.25, 0.6, by, '0 0', settle);
    },
  };
}

export const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const pal = (theme: Theme): Palette => palettes[theme];
