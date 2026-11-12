import { schedule, type Timed, type Wiring } from './wiring.ts';

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export const ISO_X = Math.SQRT1_2;
export const ISO_Y = Math.SQRT1_2 * Math.tan(Math.PI / 6);

export interface SideArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SidePaint = (face: 'left' | 'right', area: SideArea, transform: string, band: { y0: number; y1: number }) => string;

export type Material =
  | { kind: 'flat'; color: string }
  | { kind: 'marble'; colors: readonly [string, string, string, ...string[]]; streak?: 'fine' | 'wide' }
  | { kind: 'custom'; paint: SidePaint; corner?: 'bend' | 'fade'; opacity?: number }
  | { kind: 'image'; href: string; right?: string; corner?: 'bend' | 'fade'; opacity?: number };

export type AnimatedProp =
  | 'opacity'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'strokeDashoffset'
  | 'filter'
  | 'fill'
  | 'stroke'
  | 'color'
  | 'backgroundColor'
  | 'borderColor'
  | 'boxShadow'
  | 'clipPath';

export interface SlabOptions {
  id: string;
  at: Vec3;
  size: Vec2;
  height: number;
  radius?: number;
  top: string;
  side: Material;
  edge?: string;
  grain?: number;
  shadow?: boolean;
  translucent?: boolean;
  className?: string;
  content?: string;
  hover?: HoverOptions;
  outline?: string;
  shade?: boolean;
}

export interface HoverOptions {
  lift?: number;
  top?: string;
  side?: Material;
  edge?: string;
  label?: string;
  guides?: string;
  on?: number;
  off?: number;
  onEase?: string;
  offEase?: string;
}

export interface PrismOptions {
  id: string;
  at: Vec3;
  size: Vec2;
  height: number;
  reach?: number;
  radius?: number;
  top: string;
  side: string | readonly [string, string];
  stroke?: string;
  capStroke?: string;
  strokeWidth?: number;
  dash?: string;
  content?: string;
  className?: string;
}

export interface TurntableOptions {
  id: string;
  at: Vec3;
  size: Vec2;
  height: number;
  radius?: number;
  top: string;
  side: string | readonly string[];
  edge?: string;
  layers?: number;
  grain?: number;
  content?: string;
  className?: string;
}

export type Plane = 'top' | 'left' | 'right';

export interface TextOptions {
  id: string;
  at: Vec3 | { screen: Vec2 };
  text: string;
  size?: number;
  color?: string;
  weight?: number;
  font?: 'mono' | 'sans';
  anchor?: 'start' | 'middle' | 'end';
  on?: 'screen' | Plane;
  along?: 'x' | 'y';
  tracking?: number;
  pill?: { fill: string; stroke?: string; padX?: number; padY?: number; radius?: number };
  className?: string;
}

export interface PanelOptions {
  id: string;
  at: Vec3;
  size: Vec2;
  thickness: number;
  facing: 'left' | 'right';
  radius?: number;
  front: string;
  side: string;
  edge?: string;
  content?: string;
  className?: string;
}

export interface FrameOptions {
  id: string;
  at: Vec3;
  size: Vec2;
  height: number;
  radius?: number;
  stroke: string;
  dash?: string;
  width?: number;
  back?: boolean;
  edges?: readonly ('left' | 'right' | 'front' | 'back')[];
  bottom?: boolean;
  fill?: string;
  className?: string;
}

export interface FaceOptions {
  id: string;
  at: Vec3;
  size: Vec2;
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
  className?: string;
  content?: string;
}

export interface WireOptions {
  id: string;
  points: readonly Vec3[];
  stroke: string;
  width?: number;
  corner?: number;
  dash?: string;
  hidden?: boolean;
  joins?: readonly (string | readonly string[])[];
  className?: string;
}

export interface Link {
  wire: string;
  ends: string[][];
  pulses: string[];
  loose: boolean;
}

export interface PulseOptions {
  id: string;
  wire: string;
  color: string;
  length?: number;
  width?: number;
  glow?: boolean;
}

export interface LabelOptions {
  id: string;
  at: Vec3 | { screen: Vec2 };
  text?: string;
  html?: string;
  variant?: 'pill' | 'plain' | 'card';
  size?: number;
  anchor?: 'center' | 'left' | 'right' | 'top' | 'bottom';
  className?: string;
}

export interface SceneOptions {
  name: string;
  width: number;
  height: number;
  origin?: Vec2;
  font?: string;
  mono?: string;
  label?: { bg: string; border: string; ink: string; radius?: number };
  ratio?: number;
}

type NumericProp = 'opacity' | 'strokeDashoffset' | 'scale';
export type ValueOf<P extends AnimatedProp> = P extends NumericProp ? number | string : string;

interface Segment {
  target: string;
  prop: AnimatedProp;
  start: number;
  dur: number;
  from: string | number;
  to: string | number;
  easing: string;
}

export interface Track {
  target: string;
  prop: AnimatedProp;
  keyframes: Array<Record<string, string | number>>;
  duration: number;
  delay: number;
  repeat: boolean;
  fill: 'both' | 'backwards' | 'none';
}

export interface MotionSpec {
  intro: number;
  loop: number;
  still: number;
  tracks: Track[];
}

export interface ExportOptions {
  title?: string;
  color?: string;
  background?: string;
  radius?: number;
}

export interface SceneSize {
  name: string;
  width: number;
  height: number;
}

export const ease = {
  io: 'cubic-bezier(.37,0,.63,1)',
  out: 'cubic-bezier(.22,1,.36,1)',
  outBack: 'cubic-bezier(.34,1.56,.64,1)',
  in: 'cubic-bezier(.5,0,.75,0)',
  linear: 'linear',
  drop: 'cubic-bezier(.5,.95,.7,1)',
  settle: 'cubic-bezier(.35,.2,.45,1)',
} as const;

const fmt = (n: number) => {
  if (!Number.isFinite(n)) throw new Error(`iso: got a non-finite number (${n}) in the drawing`);
  return Number(n.toFixed(2)).toString();
};
const fmt4 = (n: number) => Number(n.toFixed(5)).toString();
const attr = (v: Record<string, string | number | undefined>) =>
  Object.entries(v)
    .filter((e): e is [string, string | number] => e[1] !== undefined)
    .map(([k, x]) => `${k}="${typeof x === 'number' ? fmt(x) : escAttr(x)}"`)
    .join(' ');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');
const cls = (c: string | undefined) => (c ? ` class="${escAttr(c)}"` : '');
const ms = (t: number) => Math.round(t * 1000) / 1000;
const frac = (x: number) => Math.round(x * 1e5) / 1e5;
const kebab = /^[a-z][a-z0-9-]*$/;

function rgb(c: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (!m?.[1]) throw new Error(`iso: colour must be #rrggbb, got "${c}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function convexHull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list: readonly Vec2[]) => {
    const out: Vec2[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      if (out.length === 1 && out[0]![0] === q[0] && out[0]![1] === q[1]) continue;
      out.push(q);
    }
    return out.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  return hull.length ? hull : sorted.slice(0, 1);
}

function sweptRoundRect(w: number, h: number, r: number, from: Vec2, to: Vec2): string {
  const [x, y] = [w / 2 - r, h / 2 - r];
  const corners: Vec2[] = [[-x, -y], [x, -y], [x, y], [-x, y]];
  const hull = convexHull([from, to].flatMap(([du, dv]) => corners.map(([a, b]): Vec2 => [a + du, b + dv])));
  const p = (v: Vec2) => `${fmt(v[0])} ${fmt(v[1])}`;
  const at = (v: Vec2, n: Vec2): Vec2 => [v[0] + r * n[0], v[1] + r * n[1]];
  const arc = (v: Vec2, n: Vec2) => `A${fmt(r)} ${fmt(r)} 0 0 1 ${p(at(v, n))}`;
  const [c] = hull;
  if (hull.length === 1 && c) return `M${p(at(c, [1, 0]))}${arc(c, [0, 1])}${arc(c, [-1, 0])}${arc(c, [0, -1])}${arc(c, [1, 0])}Z`;
  const edges = hull.map((a, i) => {
    const b = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return { a, b, dir, n: [dir[1], -dir[0]] as const };
  });
  return `M${p(at(edges[0]!.a, edges[0]!.n))}${edges
    .map((e, i) => {
      const next = edges[(i + 1) % edges.length]!;
      const sum: Vec2 = [e.n[0] + next.n[0], e.n[1] + next.n[1]];
      const len = Math.hypot(sum[0], sum[1]);
      const mid: Vec2 = len > 1e-9 ? [sum[0] / len, sum[1] / len] : e.dir;
      return `L${p(at(e.b, e.n))}${arc(e.b, mid)}${arc(e.b, next.n)}`;
    })
    .join('')}Z`;
}

export class Scene {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly origin: Vec2;
  readonly ratio: number;
  private readonly iy: number;
  private readonly opts: SceneOptions;
  private readonly defs = new Map<string, string>();
  private readonly layers: string[] = [];
  private readonly labels: string[] = [];
  private readonly wires = new Map<string, { d: string; length: number; points: readonly Vec3[]; joins: readonly (string | readonly string[])[] | undefined; width: number; dashed: boolean }>();
  private readonly parents = new Map<string, string>();
  private readonly labelIds = new Set<string>();
  private readonly pulses = new Map<string, { wire: string; length: number }>();
  private readonly segments: { phase: 'intro' | 'loop'; seg: Segment }[] = [];
  private readonly ids = new Set<string>();
  private readonly hovers: { slab: string; label: string | undefined; on: number; off: number; onEase: string; offEase: string }[] = [];
  private readonly pivots = new Map<string, Vec2>();
  private readonly prisms = new Map<string, { rest: number; reach: number; slant: number }>();
  private readonly prismClips = new Map<string, string>();
  private readonly hiddenWires = new Set<string>();
  private readonly ambients: { target: string; prop: AnimatedProp; period: number; values: (string | number)[]; easing: string }[] = [];
  private readonly turntables = new Map<string, string[]>();
  private readonly solids: { id: string; x: readonly [number, number]; y: readonly [number, number]; z: readonly [number, number] }[] = [];
  private readonly sideTexts: { id: string; at: Vec3; on: 'left' | 'right'; size: number }[] = [];
  private introLength = 0;
  private loopLength = 0;
  private stillAt = 0;

  constructor(opts: SceneOptions) {
    if (!kebab.test(opts.name)) throw new Error(`iso: scene name "${opts.name}" must be lower-case kebab`);
    if (!(opts.width > 0 && opts.height > 0)) throw new Error(`iso: scene ${opts.name} needs a positive width and height`);
    this.opts = opts;
    this.name = opts.name;
    this.width = opts.width;
    this.height = opts.height;
    this.origin = opts.origin ?? [opts.width / 2, opts.height / 2];
    this.ratio = opts.ratio ?? Math.tan(Math.PI / 6);
    if (!(this.ratio > 0.2 && this.ratio < 1)) throw new Error(`iso: scene ${opts.name} ratio ${this.ratio} must be between 0.2 and 1 (true isometric is 0.577)`);
    this.iy = ISO_X * this.ratio;
  }

  project([x, y, z]: Vec3): Vec2 {
    return [this.origin[0] + (x - y) * ISO_X, this.origin[1] + (x + y) * this.iy - z];
  }

  ref(id: string): string {
    return `${this.name}_${id}`;
  }

  private claim(id: string): string {
    if (!kebab.test(id)) throw new Error(`iso: id "${id}" must be lower-case kebab`);
    if (this.ids.has(id)) throw new Error(`iso: id "${id}" used twice in scene ${this.name}`);
    this.ids.add(id);
    return this.ref(id);
  }

  private material(m: Extract<Material, { kind: 'marble' }>): string {
    const key = `${this.name}_iso_marble-${m.colors.join('').replace(/#/g, '')}-${m.streak ?? 'fine'}`;
    if (!this.defs.has(key)) {
      const c = m.colors.map(rgb);
      const last = c.length - 1;
      const order = [0, 1, 2, last, 1, 0, 2, 1, 0, last, 1, 0].map(i => c[Math.min(i, last)]!);
      const table = (ch: 0 | 1 | 2) => order.map(v => fmt(v[ch] / 255)).join(' ');
      const freq = m.streak === 'wide' ? '.005 .035' : '.006 .07';
      this.defs.set(
        key,
        `<filter id="${key}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="11"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues="${table(0)}"/><feFuncG type="table" tableValues="${table(1)}"/><feFuncB type="table" tableValues="${table(2)}"/><feFuncA type="discrete" tableValues="1"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>`,
      );
    }
    return `url(#${key})`;
  }

  private grain(amount: number): string {
    const key = `${this.name}_iso_grain-${Math.round(amount * 100)}`;
    if (!this.defs.has(key)) {
      this.defs.set(
        key,
        `<filter id="${key}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/><feColorMatrix values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1" result="g"/><feComposite in="SourceGraphic" in2="g" operator="arithmetic" k2="1" k3="${fmt(amount)}" k4="${fmt(-amount / 2)}"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
      );
    }
    return `url(#${key})`;
  }

  blur(amount: number): string {
    const key = `${this.name}_iso_blur-${Math.round(amount * 10)}`;
    if (!this.defs.has(key)) this.defs.set(key, `<filter id="${key}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${fmt(amount)}"/></filter>`);
    return `url(#${key})`;
  }

  def(id: string, markup: string): string {
    if (/<clipPath[^>]*>[\s\S]*?<g[\s>][\s\S]*?<\/clipPath>/.test(markup)) throw new Error(`iso: def "${id}" puts a <g> inside a <clipPath>; SVG ignores it and clips everything away. Put the transform on each shape instead`);
    const key = this.claim(id);
    this.defs.set(key, markup.replace(/id="\$ID"/g, `id="${key}"`));
    return `url(#${key})`;
  }

  plane(at: Vec3, markup: string, on: Plane = 'top'): string {
    return `<g transform="${this.planeTransform(at, on)}">${markup}</g>`;
  }

  planeTransform(at: Vec3, on: Plane = 'top'): string {
    if (on === 'top') return this.faceTransform(at);
    const [px, py] = this.project(at);
    return `matrix(${fmt4(ISO_X)} ${fmt4(on === 'left' ? this.iy : -this.iy)} 0 1 ${fmt(px)} ${fmt(py)})`;
  }

  unproject([sx, sy]: Vec2, z = 0): Vec3 {
    const a = (sx - this.origin[0]) / ISO_X;
    const b = (sy - this.origin[1] + z) / this.iy;
    return [(a + b) / 2, (b - a) / 2, z];
  }

  pivot(id: string, at: Vec3): this {
    this.pivots.set(id, this.project(at));
    return this;
  }

  group(id: string, build: () => void, className?: string): this {
    const ref = this.claim(id);
    const start = this.layers.length;
    const labels = this.labels.length;
    const claimed = this.ids.size;
    build();
    for (const child of [...this.ids].slice(claimed)) if (!this.parents.has(child)) this.parents.set(child, id);
    if (this.labels.length !== labels) throw new Error(`iso: group "${id}" in scene ${this.name} contains a label(); HTML labels cannot move with a group, use text() instead`);
    const inner = this.layers.splice(start);
    this.layers.push(`<g id="${ref}"${cls(className)}>${inner.join('')}</g>`);
    return this;
  }

  text(o: TextOptions): this {
    const id = this.claim(o.id);
    if ((o.on === 'left' || o.on === 'right') && !('screen' in o.at)) this.sideTexts.push({ id: o.id, at: o.at, on: o.on, size: o.size ?? 12 });
    const size = o.size ?? 12;
    const anchor = o.anchor ?? (o.pill ? 'middle' : 'start');
    const mono = (o.font ?? 'mono') === 'mono';
    const tracking = o.tracking ?? 0;
    const width = [...o.text].length * size * (mono ? 0.6 : 0.56) + Math.max(0, [...o.text].length - 1) * tracking;
    const x0 = anchor === 'start' ? 0 : anchor === 'middle' ? -width / 2 : -width;
    const pill = o.pill
      ? `<rect ${attr({ x: x0 - (o.pill.padX ?? size * 0.7), y: -size * 0.5 - (o.pill.padY ?? size * 0.45), width: width + 2 * (o.pill.padX ?? size * 0.7), height: size + 2 * (o.pill.padY ?? size * 0.45), rx: o.pill.radius ?? size * 0.4, fill: o.pill.fill, stroke: o.pill.stroke, 'vector-effect': o.pill.stroke ? 'non-scaling-stroke' : undefined })}/>`
      : '';
    const body = `${pill}<text ${attr({ 'text-anchor': anchor, 'dominant-baseline': 'central', 'font-size': size, 'font-weight': o.weight, 'letter-spacing': tracking || undefined, fill: o.color ?? 'currentColor', style: `font-family:var(${mono ? '--iso-mono' : '--iso-font'})` })}>${esc(o.text)}</text>`;
    const on = o.on ?? 'screen';
    let transform: string;
    if ('screen' in o.at) transform = `translate(${fmt(o.at.screen[0])} ${fmt(o.at.screen[1])})`;
    else if (on === 'screen') {
      const [x, y] = this.project(o.at);
      transform = `translate(${fmt(x)} ${fmt(y)})`;
    } else transform = `${this.planeTransform(o.at, on)}${on === 'top' && o.along === 'y' ? ' rotate(-90)' : ''}`;
    this.layers.push(`<g id="${id}"${cls(o.className)}><g transform="${transform}">${body}</g></g>`);
    return this;
  }

  panel(o: PanelOptions): this {
    const id = this.claim(o.id);
    const [w, h] = o.size;
    if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h) && o.thickness >= 0 && Number.isFinite(o.thickness) && (o.radius === undefined || o.radius >= 0)))
      throw new Error(`iso: panel "${o.id}" needs a positive finite size, a finite thickness >= 0 and a radius >= 0, got size ${w}x${h}, thickness ${o.thickness}, radius ${o.radius}`);
    const r = Math.min(o.radius ?? Math.min(w, h) * 0.14, w / 2, h / 2);
    const rect = (extra: Record<string, string | number | undefined>) => `<rect ${attr({ x: -w / 2, y: -h / 2, width: w, height: h, rx: r, ...extra })}/>`;
    const behind = (d: number): Vec2 => [o.facing === 'left' ? d : -d, -2 * d * this.iy];
    const side = o.thickness > 0 ? `<path ${attr({ d: sweptRoundRect(w, h, r, behind(Math.min(o.thickness, 1)), behind(o.thickness)), fill: o.side })}/>` : '';
    const content = this.clipToFace(id, o.size, r, o.content);
    this.layers.push(`<g id="${id}"${cls(o.className)}><g transform="${this.planeTransform(o.at, o.facing)}">${side}${rect({ fill: o.front })}${rect({ fill: 'none', stroke: o.edge ?? 'rgb(255 255 255 / .6)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })}${content}</g></g>`);
    return this;
  }

  private clipToFace(key: string, size: Vec2, radius: number, content: string | undefined): string {
    if (!content) return '';
    this.defs.set(`${key}_face`, `<clipPath id="${key}_face">${this.faceRect(size, radius)}</clipPath>`);
    return `<g clip-path="url(#${key}_face)">${content}</g>`;
  }

  private faceRect(size: Vec2, radius: number, extra: Record<string, string | number | undefined> = {}) {
    const r = Math.min(radius, size[0] / 2, size[1] / 2);
    return `<rect ${attr({ x: -size[0] / 2, y: -size[1] / 2, width: size[0], height: size[1], rx: r, ...extra })}/>`;
  }

  private faceTransform(at: Vec3) {
    const [px, py] = this.project(at);
    return `translate(${fmt(px)} ${fmt(py)}) scale(1 ${fmt4(this.ratio)}) rotate(45)`;
  }

  extremes(at: Vec3, size: Vec2, radius: number): { left: Vec2; right: Vec2; front: Vec2; back: Vec2 } {
    const r = Math.min(radius, size[0] / 2, size[1] / 2);
    const [w, d] = [size[0] / 2 - r, size[1] / 2 - r];
    const l = this.project([at[0] - w, at[1] + d, at[2]]);
    const rt = this.project([at[0] + w, at[1] - d, at[2]]);
    const f = this.project([at[0] + w, at[1] + d, at[2]]);
    const b = this.project([at[0] - w, at[1] - d, at[2]]);
    const ry = r * Math.SQRT2 * this.iy;
    return { left: [l[0] - r, l[1]], right: [rt[0] + r, rt[1]], front: [f[0], f[1] + ry], back: [b[0], b[1] - ry] };
  }

  slab(o: SlabOptions): this {
    const id = this.claim(o.id);
    this.solids.push({ id: o.id, x: [o.at[0] - o.size[0] / 2, o.at[0] + o.size[0] / 2], y: [o.at[1] - o.size[1] / 2, o.at[1] + o.size[1] / 2], z: [o.at[2] - o.height, o.at[2]] });
    const radius = o.radius ?? Math.min(o.size[0], o.size[1]) * 0.12;
    const bottom: Vec3 = [o.at[0], o.at[1], o.at[2] - o.height];
    const top = this.extremes(o.at, o.size, radius);
    const bot = this.extremes(bottom, o.size, radius);
    const p = (v: Vec2) => `${fmt(v[0])} ${fmt(v[1])}`;
    const outline = `M${p(top.left)}L${p(top.right)}L${p(bot.right)}L${p(bot.left)}Z`;
    this.defs.set(`${id}_side`, `<clipPath id="${id}_side"><path d="${outline}"/>${this.faceRect(o.size, radius, { transform: this.faceTransform(bottom) })}</clipPath>`);
    const area: SideArea = { x: bot.left[0] - 4, y: top.back[1] - 4, width: bot.right[0] - bot.left[0] + 8, height: bot.front[1] - top.back[1] + 8 };
    const tall: SideArea = { ...area, y: area.y - area.width * 0.6, height: area.height + area.width * 1.2 };
    let shadow = '';
    if (o.shadow !== false) {
      shadow = `<g class="iso-shadow" transform="${this.faceTransform([bottom[0] + 8, bottom[1] + 8, bottom[2]])}" opacity=".18" filter="${this.blur(9)}">${this.faceRect(o.size, radius, { fill: '#0b1020' })}</g>`;
    }
    const hole = o.translucent ? ` mask="url(#${id}_hole)"` : '';
    if (o.translucent) {
      this.defs.set(`${id}_hole`, `<mask id="${id}_hole" maskUnits="userSpaceOnUse" ${attr({ x: area.x, y: area.y, width: area.width, height: area.height })}><rect ${attr({ ...area, fill: '#fff' })}/>${this.faceRect(o.size, radius, { fill: '#000', transform: this.faceTransform(o.at) })}</mask>`);
    }
    const line = o.outline ? { fill: 'none', stroke: o.outline, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' } : null;
    const under = line ? `<g transform="${this.faceTransform(bottom)}">${this.faceRect(o.size, radius, line)}</g>` : '';
    const over = line ? [top.left, top.right].map((v, i) => `<path ${attr({ d: `M${fmt(v[0])} ${fmt(v[1])}V${fmt((i ? bot.right : bot.left)[1])}`, ...line })}/>`).join('') : '';
    const content = this.clipToFace(id, o.size, radius, o.content);
    const body = (key: string, topFill: string, side: Material, edge: string | undefined) =>
      `${under}<g clip-path="url(#${id}_side)"${hole}>${this.sides(key, side, area, tall, top.front, radius, o.height, o.size, o.shade !== false)}</g>${over}<g transform="${this.faceTransform(o.at)}">${this.faceRect(o.size, radius, { fill: topFill, filter: o.grain ? this.grain(o.grain) : undefined })}${this.faceRect(o.size, radius, { fill: 'none', stroke: edge ?? 'rgb(255 255 255 / .6)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })}${content}</g>`;
    const base = body(id, o.top, o.side, o.edge);
    const h = o.hover;
    if (!h) {
      this.layers.push(`<g id="${id}"${cls(o.className)}>${shadow}${base}</g>`);
      return this;
    }
    if (h.label !== undefined && !this.labelIds.has(h.label)) throw new Error(`iso: slab "${o.id}" reveals label "${h.label}" on hover; draw that label first`);
    const hit = `<path d="${outline}" fill="transparent"/><g transform="${this.faceTransform(o.at)}">${this.faceRect(o.size, radius, { fill: 'transparent' })}</g>`;
    const hot = h.top || h.side || h.edge ? `<g class="iso-hot">${body(`${id}_h`, h.top ?? o.top, h.side ?? o.side, h.edge ?? o.edge)}</g>` : '';
    for (const [k, v] of [['on', h.on], ['off', h.off]] as const) if (v !== undefined && !(v >= 0 && Number.isFinite(v))) throw new Error(`iso: slab "${o.id}" hover ${k} must be a duration in ms >= 0, got ${v}`);
    this.hovers.push({ slab: o.id, label: h.label, on: h.on ?? 270, off: h.off ?? 325, onEase: h.onEase ?? ease.out, offEase: h.offEase ?? ease.out });
    const lift = h.lift ?? 16;
    const guides = h.guides
      ? `<g class="iso-guides" stroke="${escAttr(h.guides)}" stroke-width="1" stroke-dasharray="2 2">${[bot.left, bot.right, bot.front].map(v => `<path d="M${p(v)}v${fmt(-lift)}" vector-effect="non-scaling-stroke"/>`).join('')}</g>`
      : '';
    this.layers.push(`<g id="${id}" class="iso-hover${o.className ? ` ${escAttr(o.className)}` : ''}" style="--lift:${fmt(lift)}${h.on !== undefined ? `;--iso-on:${fmt(h.on)}ms` : ''}${h.off !== undefined ? `;--iso-off:${fmt(h.off)}ms` : ''}${h.onEase ? `;--iso-on-ease:${escAttr(h.onEase)}` : ''}${h.offEase ? `;--iso-off-ease:${escAttr(h.offEase)}` : ''}"${h.on !== undefined ? ` data-hold="${fmt(h.on)}"` : ''}>${shadow}${hit}${guides}<g class="iso-lift">${base}${hot}</g></g>`);
    return this;
  }

  private sides(id: string, m: Material, area: SideArea, tall: SideArea, front: Vec2, cornerRadius: number, height: number, size: Vec2, shade = true): string {
    const radius = Math.max(0, Math.min(cornerRadius, size[0] / 2, size[1] / 2));
    const image = (face: 'left' | 'right', a: SideArea, t: string) => {
      if (m.kind !== 'image') return '';
      const href = face === 'right' && m.right ? m.right : m.href;
      const key = `${id}_tex${face === 'right' && m.right ? 'r' : 'l'}`;
      if (!this.defs.has(key)) this.defs.set(key, `<image id="${key}" ${attr({ href, x: a.x, y: a.y, width: a.width, height: a.height, preserveAspectRatio: 'none' })}/>`);
      return `<use href="#${key}"${t ? ` transform="${t}"` : ''}/>`;
    };
    const paint: SidePaint =
      m.kind === 'custom'
        ? m.paint
        : m.kind === 'image'
          ? image
          : m.kind === 'flat'
          ? (_, a, t) => `<rect ${attr({ ...a, fill: m.color, transform: t })}/>`
          : (_, a, t) => `<rect ${attr({ ...a, fill: '#808080', filter: this.material(m), transform: t })}/>`;
    const corner = m.kind === 'marble' || height < 6 ? 'fade' : m.kind === 'custom' || m.kind === 'image' ? (m.corner ?? 'bend') : 'bend';
    const T = this.ratio;
    const [fx, fy] = front;
    const band = { y0: fy, y1: fy + height };
    const cy = fy - radius * Math.SQRT2 * this.iy;
    const arc = (t: number): Vec2 => [fx + radius * ISO_X * (Math.cos(t) - Math.sin(t)), cy + radius * this.iy * (Math.cos(t) + Math.sin(t))];
    const shear = (slope: number, x: number, y: number) => `matrix(1 ${slope.toFixed(6)} 0 1 0 ${(y - fy - slope * x).toFixed(4)})`;
    const [lx, ly] = arc(Math.PI / 2);
    const [rx, ry] = arc(0);
    const leftT = shear(T, lx, ly);
    const rightT = shear(-T, rx, ry);
    const box = (x0: number, x1: number) => `<rect ${attr({ x: x0, y: area.y, width: x1 - x0, height: area.height })}/>`;
    this.defs.set(
      `${id}_shade`,
      `<linearGradient id="${id}_shade" gradientUnits="userSpaceOnUse" ${attr({ x1: lx - 0.5, y1: 0, x2: Math.max(rx, lx) + 0.5, y2: 0 })}><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`,
    );
    const shading = `<rect ${attr({ ...area, fill: `url(#${id}_shade)` })}/>`;
    let body: string;
    if (m.kind === 'flat') {
      body = `<rect ${attr({ ...area, fill: m.color })}/>`;
    } else if (corner === 'fade' || radius < 1) {
      const edge = Math.max(rx, lx) + 0.5;
      this.defs.set(
        `${id}_fr`,
        `<linearGradient id="${id}_frg" gradientUnits="userSpaceOnUse" ${attr({ x1: lx - 0.5, y1: 0, x2: edge, y2: 0 })}><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="${id}_fr" maskUnits="userSpaceOnUse" ${attr({ x: area.x, y: area.y, width: area.width, height: area.height })}><rect ${attr({ ...area, fill: `url(#${id}_frg)` })}/></mask><clipPath id="${id}_fl">${box(area.x, edge)}</clipPath>`,
      );
      body = `<g clip-path="url(#${id}_fl)">${paint('left', tall, leftT, band)}</g><g mask="url(#${id}_fr)">${paint('right', tall, rightT, band)}</g>`;
    } else {
      const strips: { x0: number; x1: number; t: string; mix: number | null }[] = [{ x0: area.x, x1: lx, t: leftT, mix: null }];
      const N = 12;
      for (let i = N; i > 0; i--) {
        const [xa, ya] = arc((i / N) * (Math.PI / 2));
        const [xb, yb] = arc(((i - 1) / N) * (Math.PI / 2));
        strips.push({ x0: xa, x1: xb, t: shear((yb - ya) / (xb - xa), xa, ya), mix: 1 - (i - 0.5) / N });
      }
      strips.push({ x0: rx, x1: area.x + area.width, t: rightT, mix: null });
      const base = `<g clip-path="url(#${id}_base)">${paint('left', tall, shear(0, lx, (ly + ry) / 2), band)}</g>`;
      this.defs.set(`${id}_base`, `<clipPath id="${id}_base">${box(lx, rx)}</clipPath>`);
      body =
        base +
        strips
          .map((st, i) => {
            const last = i === strips.length - 1;
            this.defs.set(`${id}_k${i}`, `<clipPath id="${id}_k${i}">${box(st.x0, st.x1 + (last ? 0 : 0.6))}</clipPath>`);
            const face = i === 0 ? 'left' : last ? 'right' : 'left';
            const fill = st.mix === null ? paint(face, tall, st.t, band) : `${paint('left', tall, st.t, band)}<g opacity="${st.mix.toFixed(3)}">${paint('right', tall, st.t, band)}</g>`;
            return `<g clip-path="url(#${id}_k${i})">${fill}</g>`;
          })
          .join('');
    }
    const opacity = (m.kind === 'custom' || m.kind === 'image') && m.opacity !== undefined ? ` opacity="${fmt(m.opacity)}"` : '';
    return `<g${opacity}>${body}${shade ? shading : ''}</g>`;
  }

  frame(o: FrameOptions): this {
    const id = this.claim(o.id);
    const radius = o.radius ?? Math.min(o.size[0], o.size[1]) * 0.12;
    const bottom: Vec3 = [o.at[0], o.at[1], o.at[2] - o.height];
    const top = this.extremes(o.at, o.size, radius);
    const bot = this.extremes(bottom, o.size, radius);
    const line = { fill: 'none', stroke: o.stroke, 'stroke-width': o.width ?? 1, 'stroke-dasharray': o.dash ?? '3 3', 'vector-effect': 'non-scaling-stroke' };
    const edges = (o.edges ?? (['left', 'right', 'front', ...(o.back === false ? [] : ['back'] as const)] as const)).map(k => `<path ${attr({ d: `M${fmt(top[k][0])} ${fmt(top[k][1])}V${fmt(bot[k][1])}`, ...line })}/>`).join('');
    const ring = (at: Vec3, fill?: string) => `<g transform="${this.faceTransform(at)}">${this.faceRect(o.size, radius, { ...line, fill: fill ?? 'none' })}</g>`;
    this.layers.push(`<g id="${id}"${cls(o.className)}>${o.bottom === false ? '' : ring(bottom)}${edges}${ring(o.at, o.fill)}</g>`);
    return this;
  }

  face(o: FaceOptions): this {
    const id = this.claim(o.id);
    const radius = o.radius ?? Math.min(o.size[0], o.size[1]) * 0.12;
    this.layers.push(
      `<g id="${id}"${cls(o.className)} style="${escAttr(`fill:${o.fill ?? 'none'}${o.stroke ? `;stroke:${o.stroke}` : ''}`)}"><g transform="${this.faceTransform(o.at)}">${this.faceRect(o.size, radius, { 'stroke-width': o.stroke ? (o.strokeWidth ?? 1) : undefined, 'stroke-dasharray': o.dash, 'vector-effect': 'non-scaling-stroke' })}${this.clipToFace(id, o.size, radius, o.content && `<g style="fill:initial;stroke:initial">${o.content}</g>`)}</g></g>`,
    );
    return this;
  }

  wirePath(points: readonly Vec3[], corner = 10): string {
    const p = points.map(pt => this.project(pt));
    const start = p[0];
    const end = p[p.length - 1];
    if (!start || !end || p.length < 2) throw new Error(`iso: a wire in scene ${this.name} needs at least two points`);
    let d = `M${fmt(start[0])} ${fmt(start[1])}`;
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      const c = p[i + 1]!;
      const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (la === 0 || lc === 0) throw new Error(`iso: a wire in scene ${this.name} repeats point ${i} (${points[i]?.join(', ')}); remove the duplicate`);
      const r = Math.min(corner, la / 2, lc / 2);
      d += `L${fmt(b[0] + ((a[0] - b[0]) / la) * r)} ${fmt(b[1] + ((a[1] - b[1]) / la) * r)}Q${fmt(b[0])} ${fmt(b[1])} ${fmt(b[0] + ((c[0] - b[0]) / lc) * r)} ${fmt(b[1] + ((c[1] - b[1]) / lc) * r)}`;
    }
    return `${d}L${fmt(end[0])} ${fmt(end[1])}`;
  }

  wire(o: WireOptions): this {
    const id = this.claim(o.id);
    const d = this.wirePath(o.points, o.corner);
    const pts = o.points.map(pt => this.project(pt));
    const length = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);
    if (o.dash !== undefined && !o.dash.trim()) throw new Error(`iso: wire "${o.id}" has an empty dash; give it dash and gap in px ('3 5') or leave dash out for a solid wire`);
    this.wires.set(o.id, { d, length, points: o.points, joins: o.joins, width: o.width ?? 1, dashed: o.dash !== undefined });
    if (o.hidden && o.dash) throw new Error(`iso: wire "${o.id}" is hidden (it draws in with a dash of its own), so it cannot also take dash "${o.dash}"`);
    if (o.hidden) this.hiddenWires.add(o.id);
    if (o.dash && !o.hidden) {
      const [xs, ys] = [pts.map(p => p[0]), pts.map(p => p[1])];
      const pad = (o.width ?? 1) + 4;
      this.defs.set(`${id}_grow`, `<mask id="${id}_grow" maskUnits="userSpaceOnUse" ${attr({ x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + 2 * pad, height: Math.max(...ys) - Math.min(...ys) + 2 * pad })}><path id="${id}_grow-path" ${attr({ d, fill: 'none', stroke: '#fff', 'stroke-width': (o.width ?? 1) + 2, 'stroke-dasharray': '1 2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1 })}/></mask>`);
    }
    this.layers.push(
      `<path id="${id}"${cls(o.className)} ${attr({ d, fill: 'none', stroke: o.stroke, 'stroke-width': o.width ?? 1, 'stroke-dasharray': o.dash ?? '1 2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: o.dash ? undefined : 1, mask: o.dash && !o.hidden ? `url(#${id}_grow)` : undefined, style: o.hidden ? 'stroke-dashoffset:1' : undefined })}/>`,
    );
    return this;
  }

  pulse(o: PulseOptions): this {
    const wire = this.wires.get(o.wire);
    if (!wire) throw new Error(`iso: pulse "${o.id}" names wire "${o.wire}", which is not drawn yet in scene ${this.name}`);
    const d = wire.d;
    this.pulses.set(o.id, { wire: o.wire, length: o.length ?? 0.16 });
    const id = this.claim(o.id);
    const len = o.length ?? 0.16;
    const w = o.width ?? 2;
    const dash = { d, fill: 'none', 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': `${fmt(len)} 2` };
    this.layers.push(
      `<g id="${id}" opacity="0" style="stroke-dashoffset:${fmt(len)}">${o.glow === false ? '' : `<path ${attr({ ...dash, stroke: o.color, 'stroke-width': w * 3.5, opacity: 0.4, filter: this.blur(3) })}/>`}<path ${attr({ ...dash, stroke: o.color, 'stroke-width': w })}/></g>`,
    );
    return this;
  }

  svg(id: string, markup: string, className?: string): this {
    this.layers.push(`<g id="${this.claim(id)}"${cls(className)}>${markup}</g>`);
    return this;
  }

  wireLength(id: string): number {
    const w = this.wires.get(id);
    if (!w) throw new Error(`iso: no wire "${id}" in scene ${this.name}`);
    return w.length;
  }

  links(): Link[] {
    const near = 2;
    const touches = ([x, y, z]: Vec3) => this.solids.filter(b => x >= b.x[0] - near && x <= b.x[1] + near && y >= b.y[0] - near && y <= b.y[1] + near && z >= b.z[0] - near && z <= b.z[1] + near);
    const ends = (points: readonly Vec3[]) => {
      const byBox = new Map<string, Set<string>>();
      for (const b of [points[0]!, points[points.length - 1]!].flatMap(touches)) {
        const box = [...b.x, ...b.y, ...b.z].map(v => Math.round(v * 2)).join();
        byBox.set(box, (byBox.get(box) ?? new Set()).add(b.id));
      }
      return [...byBox.values()].map(ids => [...ids]);
    };
    return [...this.wires].map(([wire, w]) => {
      const joins = w.joins?.map(end => (typeof end === 'string' ? [end] : [...end]));
      if (joins?.some(end => !end.length)) throw new Error(`iso: wire "${wire}" joins an empty list; name at least one id for each end, or pass joins: [] for a wire that joins nothing`);
      for (const id of joins?.flat() ?? []) if (!this.ids.has(id)) throw new Error(`iso: wire "${wire}" joins "${id}", which is not drawn in scene ${this.name}`);
      const loose = !joins && [w.points[0]!, w.points[w.points.length - 1]!].some(p => !touches(p).length);
      return { wire, ends: joins ?? ends(w.points), pulses: [...this.pulses].filter(([, p]) => p.wire === wire).map(([id]) => id), loose };
    });
  }

  label(o: LabelOptions): this {
    const id = this.claim(o.id);
    this.labelIds.add(o.id);
    const [x, y] = 'screen' in o.at ? o.at.screen : this.project(o.at);
    const shift = { center: '-50%,-50%', left: '0,-50%', right: '-100%,-50%', top: '-50%,0', bottom: '-50%,-100%' }[o.anchor ?? 'center'];
    this.labels.push(
      `<div id="${id}" class="iso-label iso-${o.variant ?? 'pill'}${o.className ? ` ${escAttr(o.className)}` : ''}" style="left:${fmt((x / this.width) * 100)}%;top:${fmt((y / this.height) * 100)}%;--fs:${o.size ?? 13};--shift:${shift}">${o.html ?? esc(o.text ?? '')}</div>`,
    );
    return this;
  }

  intro<P extends AnimatedProp>(target: string, prop: P, start: number, dur: number, from: ValueOf<P>, to: ValueOf<P>, easing: string = ease.io): this {
    this.push('intro', { target, prop, start, dur, from, to, easing });
    this.introLength = Math.max(this.introLength, ms(ms(start) + dur));
    return this;
  }

  at<P extends AnimatedProp>(target: string, prop: P, start: number, dur: number, from: ValueOf<P>, to: ValueOf<P>, easing: string = ease.io): this {
    this.push('loop', { target, prop, start, dur, from, to, easing });
    return this;
  }

  private push(phase: 'intro' | 'loop', seg: Segment) {
    if (!Number.isFinite(seg.start) || !Number.isFinite(seg.dur) || !(seg.dur > 0) || seg.start < 0) throw new Error(`iso: ${seg.target}.${seg.prop} needs a finite start >= 0 and a positive duration, got ${seg.start} and ${seg.dur}`);
    const start = ms(seg.start);
    this.segments.push({ phase, seg: { ...seg, start, dur: ms(start + seg.dur) - start } });
  }

  dropIn(target: string, start: number, distance = 46, dur = 0.55): this {
    return this.drop('intro', target, start, distance, dur);
  }

  dropAt(target: string, start: number, distance = 46, dur = 0.55): this {
    return this.drop('loop', target, start, distance, dur);
  }

  private drop(phase: 'intro' | 'loop', target: string, start: number, distance: number, dur: number): this {
    const add = phase === 'intro' ? this.intro.bind(this) : this.at.bind(this);
    add(target, 'opacity', start, 0.1, 0, 1, ease.out);
    add(target, 'translate', start, dur * 0.58, `0 ${-distance}px`, `0 ${distance * 0.065}px`, ease.drop);
    return add(target, 'translate', start + dur * 0.58, dur * 0.42, `0 ${distance * 0.065}px`, '0 0', ease.settle);
  }

  set<P extends AnimatedProp>(target: string, prop: P, t: number, value: ValueOf<P>, phase: 'intro' | 'loop' = 'loop'): this {
    return phase === 'intro' ? this.intro(target, prop, t, 0.001, value, value, ease.linear) : this.at(target, prop, t, 0.001, value, value, ease.linear);
  }

  draw(wire: string, start: number, dur: number, easing: string = ease.out, phase: 'intro' | 'loop' = 'loop'): this {
    if (!this.hiddenWires.has(wire)) throw new Error(`iso: draw() needs wire "${wire}" drawn with wire({ hidden: true }) in scene ${this.name}`);
    return phase === 'intro' ? this.intro(wire, 'strokeDashoffset', start, dur, 1, 0, easing) : this.at(wire, 'strokeDashoffset', start, dur, 1, 0, easing);
  }

  retract(wire: string, start: number, dur: number, toward: 'start' | 'end' = 'start', easing: string = ease.in, phase: 'intro' | 'loop' = 'loop'): this {
    if (!this.hiddenWires.has(wire)) throw new Error(`iso: retract() needs wire "${wire}" drawn with wire({ hidden: true }) in scene ${this.name}`);
    const to = toward === 'start' ? 1 : -1;
    return phase === 'intro' ? this.intro(wire, 'strokeDashoffset', start, dur, 0, to, easing) : this.at(wire, 'strokeDashoffset', start, dur, 0, to, easing);
  }

  introUntil(seconds: number): this {
    if (!(seconds >= 0)) throw new Error(`iso: introUntil() needs a time >= 0 in scene ${this.name}`);
    this.introLength = Math.max(this.introLength, ms(seconds));
    return this;
  }

  prism(o: PrismOptions): this {
    const [x, y, z0] = o.at;
    this.solids.push({ id: o.id, x: [x - o.size[0] / 2, x + o.size[0] / 2], y: [y - o.size[1] / 2, y + o.size[1] / 2], z: [z0, z0 + Math.max(o.reach ?? o.height, o.height)] });
    const radius = o.radius ?? Math.min(o.size[0], o.size[1]) * 0.12;
    const r = Math.min(radius, o.size[0] / 2, o.size[1] / 2);
    const [w, d] = [o.size[0] / 2 - r, o.size[1] / 2 - r];
    const rim: Vec2[] = [];
    for (const [cx, cy, a0] of [[w, d, 0], [-w, d, 90], [-w, -d, 180], [w, -d, 270]] as const) {
      for (let i = 0; i <= 8; i++) {
        const a = ((a0 + (i * 90) / 8) * Math.PI) / 180;
        rim.push(this.project([x + cx + r * Math.cos(a), y + cy + r * Math.sin(a), z0]));
      }
    }
    const li = rim.reduce((b, p, i) => (p[0] < rim[b]![0] ? i : b), 0);
    const ri = rim.reduce((b, p, i) => (p[0] > rim[b]![0] ? i : b), 0);
    const walk = (step: number) => {
      const out: Vec2[] = [];
      for (let i = li; ; i = (i + step + rim.length) % rim.length) {
        out.push(rim[i]!);
        if (i === ri) return out;
      }
    };
    const a = walk(1);
    const b = walk(-1);
    const chain = Math.max(...a.map(p => p[1])) >= Math.max(...b.map(p => p[1])) ? a : b;
    const l = chain[0]!;
    const rt = chain[chain.length - 1]!;
    const reach = Math.max(o.reach ?? o.height, o.height);
    const slant = Math.abs(l[1] - rt[1]);
    const [hi, lo] = l[1] <= rt[1] ? [l, rt] : [rt, l];
    const frontX = chain.reduce((best, p) => (p[1] > best[1] ? p : best), chain[0]!)[0];
    const [leftPaint, rightPaint] = typeof o.side === 'string' ? [o.side, o.side] : o.side;
    const split = leftPaint !== rightPaint;
    if (split) this.defs.set(`${this.ref(o.id)}_rs`, `<clipPath id="${this.ref(o.id)}_rs"><rect ${attr({ x: frontX, y: -1e4, width: 2e4, height: 2e4 })}/></clipPath>`);
    const paint = (shape: (fill: string) => string) => shape(leftPaint) + (split ? `<g clip-path="url(#${this.ref(o.id)}_rs)">${shape(rightPaint)}</g>` : '');
    const path = chain.map((p, i) => `${i ? 'L' : 'M'}${fmt(p[0])} ${fmt(p[1])}`).join('');
    const pen = (color: string | undefined) => (color ? { stroke: color, 'stroke-width': o.strokeWidth ?? 1, 'stroke-dasharray': o.dash, 'vector-effect': 'non-scaling-stroke' } : {});
    const pt = (v: Vec2, dy = 0) => `${fmt(v[0])} ${fmt(v[1] + dy)}`;
    const column = `M${pt(l)}L${pt(rt)}L${pt(rt, -reach)}L${pt(l, -reach)}Z`;
    const skirt = `M${pt(hi, -o.height)}L${pt(lo, -o.height)}L${pt(lo, 1.5 - o.height)}L${fmt(hi[0])} ${fmt(lo[1] - o.height + 1.5)}Z`;
    const seat = `${chain.map((p, i) => `${i ? 'L' : 'M'}${fmt(p[0])} ${fmt(p[1])}`).join('')}L${pt(rt, -1)}L${pt(l, -1)}Z`;
    const clip = (h: number) => `inset(${fmt(slant + reach - h)}px -4px -4px -4px)`;
    this.group(o.id, () => {
      this.svg(`${o.id}-base`, `${paint(fill => `<path ${attr({ d: seat, fill })}/>`)}${o.stroke ? `<path ${attr({ d: path, fill: 'none', ...pen(o.stroke) })}/>` : ''}`);
      this.svg(`${o.id}-col`, `${paint(fill => `<path ${attr({ d: column, fill })}/>`)}${o.stroke ? `<path ${attr({ d: `M${pt(l, -reach)}V${fmt(l[1])}M${pt(rt, -reach)}V${fmt(rt[1])}`, fill: 'none', ...pen(o.stroke) })}/>` : ''}`);
      this.svg(`${o.id}-cap`, `${slant > 0.01 ? `${paint(fill => `<path ${attr({ d: skirt, fill })}/>`)}${o.stroke ? `<path ${attr({ d: `M${pt(hi, -o.height)}v${fmt(slant)}`, fill: 'none', ...pen(o.stroke) })}/>` : ''}` : ''}${this.plane([x, y, z0 + o.height], `${this.faceRect(o.size, radius, { fill: o.top, ...pen(o.capStroke ?? o.stroke) })}${this.clipToFace(this.ref(o.id), o.size, radius, o.content)}`)}`);
    }, o.className);
    this.prismClips.set(o.id, `#${this.ref(`${o.id}-col`)}{clip-path:${clip(o.height)}}`);
    this.prisms.set(o.id, { rest: o.height, reach, slant });
    return this;
  }

  heightTo(id: string, start: number, dur: number, from: number, to: number, easing: string = ease.io, phase: 'intro' | 'loop' = 'loop'): this {
    const p = this.prisms.get(id);
    if (!p) throw new Error(`iso: heightTo() names "${id}", which is not a prism() in scene ${this.name}`);
    for (const v of [from, to]) if (!(v >= 0 && v <= p.reach)) throw new Error(`iso: heightTo() of prism "${id}" must stay between 0 and its reach ${p.reach}, got ${v}`);
    const clip = (h: number) => `inset(${fmt(p.slant + p.reach - h)}px -4px -4px -4px)`;
    const add = phase === 'intro' ? this.intro.bind(this) : this.at.bind(this);
    add(`${id}-col`, 'clipPath', start, dur, clip(from), clip(to), easing);
    return add(`${id}-cap`, 'translate', start, dur, `0 ${fmt(p.rest - from)}px`, `0 ${fmt(p.rest - to)}px`, easing);
  }

  turntable(o: TurntableOptions): this {
    const radius = o.radius ?? Math.min(o.size[0], o.size[1]) * 0.12;
    const n = Math.max(2, Math.round(o.layers ?? Math.min(24, Math.ceil(o.height / 3))));
    const sides = typeof o.side === 'string' ? [o.side] : o.side;
    if (!sides.length) throw new Error(`iso: turntable "${o.id}" needs at least one side colour`);
    const ids: string[] = [];
    this.group(o.id, () => {
      for (let i = 0; i <= n; i++) {
        const z = o.at[2] - o.height + (o.height * i) / n;
        const lid = `${o.id}-r${i}`;
        ids.push(lid);
        const [px, py] = this.project([o.at[0], o.at[1], z]);
        const last = i === n;
        const fill = last ? o.top : sides[Math.min(sides.length - 1, Math.floor((i / n) * sides.length))]!;
        const face = last
          ? `${this.faceRect(o.size, radius, { fill, filter: o.grain ? this.grain(o.grain) : undefined })}${this.faceRect(o.size, radius, { fill: 'none', stroke: o.edge ?? 'rgb(255 255 255 / .6)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })}${this.clipToFace(this.ref(o.id), o.size, radius, o.content)}`
          : this.faceRect(o.size, radius, { fill });
        this.layers.push(`<g transform="translate(${fmt(px)} ${fmt(py)}) scale(1 ${fmt4(this.ratio)})"><g id="${this.claim(lid)}" style="transform-box:view-box;transform-origin:0 0"><g transform="rotate(45)">${face}</g></g></g>`);
      }
    }, o.className);
    this.turntables.set(o.id, ids);
    return this;
  }

  spin(id: string, start: number, dur: number, fromDeg: number, toDeg: number, easing: string = ease.out, phase: 'intro' | 'loop' = 'loop'): this {
    const ids = this.turntables.get(id);
    if (!ids) throw new Error(`iso: spin() names "${id}", which is not a turntable() in scene ${this.name}`);
    for (const lid of ids) {
      if (phase === 'intro') this.intro(lid, 'rotate', start, dur, `${fmt(fromDeg)}deg`, `${fmt(toDeg)}deg`, easing);
      else this.at(lid, 'rotate', start, dur, `${fmt(fromDeg)}deg`, `${fmt(toDeg)}deg`, easing);
    }
    return this;
  }

  ambient<P extends AnimatedProp>(target: string, prop: P, period: number, values: readonly ValueOf<P>[], easing: string = ease.linear): this {
    if (!(period > 0 && Number.isFinite(period))) throw new Error(`iso: ambient ${target}.${prop} needs a positive period, got ${period}`);
    if (values.length < 2) throw new Error(`iso: ambient ${target}.${prop} needs at least two values`);
    this.ambients.push({ target, prop, period: ms(period), values: [...values], easing });
    return this;
  }

  march(target: string, dash: number, gap: number, speed: number, direction: 1 | -1 = 1): this {
    if (!(dash > 0 && gap >= 0 && speed > 0)) throw new Error(`iso: march "${target}" needs dash > 0, gap >= 0 and speed > 0`);
    const period = dash + gap;
    return this.ambient(target, 'strokeDashoffset', period / speed, [0, -direction * period], ease.linear);
  }

  wobble(target: string, period = 5, squash = 0.92, tilt = 1): this {
    this.ambient(target, 'scale', period, ['1 1', '1 1', `1 ${fmt4(squash)}`, '1 1', '1 1'], ease.io);
    return this.ambient(target, 'rotate', period, ['0deg', '0deg', `${fmt(tilt)}deg`, `${fmt(-tilt)}deg`, '0deg'], ease.io);
  }

  tug(target: string, start: number, by: string): this {
    return this.at(target, 'translate', start, 0.23, '0 0', by, ease.out).at(target, 'translate', start + 0.48, 0.65, by, '0 0', ease.out);
  }

  offset(from: Vec3, to: Vec3): string {
    const [ax, ay] = this.project(from);
    const [bx, by] = this.project(to);
    return `${fmt(bx - ax)}px ${fmt(by - ay)}px`;
  }

  travel(pulse: string, start: number, dur?: number): this {
    const p = this.pulses.get(pulse);
    if (!p) throw new Error(`iso: travel() names pulse "${pulse}", which is not drawn in scene ${this.name}`);
    const length = p.length;
    if (dur === undefined) dur = Math.max(0.3, this.wireLength(p.wire) / 270);
    return this.at(pulse, 'opacity', start, 0.05, 0, 1, ease.linear)
      .at(pulse, 'strokeDashoffset', start, dur, length, -1, ease.linear)
      .at(pulse, 'opacity', start + dur - 0.05, 0.05, 1, 0, ease.linear);
  }

  typeIn(target: string, start: number, dur: number, steps: number): this {
    return this.at(target, 'clipPath', start, dur, 'inset(-20% 100% -20% 0)', 'inset(-20% 0% -20% 0)', `steps(${Math.max(1, Math.round(steps))}, end)`);
  }

  hold<P extends AnimatedProp>(target: string, prop: P, start: number, inDur: number, holdFor: number, outDur: number, off: ValueOf<P>, on: ValueOf<P>): this {
    return this.at(target, prop, start, inDur, off, on, ease.io).at(target, prop, start + inDur + holdFor, outDur, on, off, ease.io);
  }

  loop(seconds: number, still: number): this {
    if (!Number.isFinite(seconds) || !(seconds > 0)) throw new Error(`iso: scene ${this.name} needs a positive loop length`);
    if (!Number.isFinite(still) || still < 0 || still > seconds) throw new Error(`iso: scene ${this.name} still time ${still}s is outside its ${seconds}s loop`);
    this.loopLength = ms(seconds);
    this.stillAt = still;
    return this;
  }

  private value(target: string, prop: AnimatedProp, v: string | number): string | number {
    if (prop !== 'translate' || typeof v !== 'string' || !this.labelIds.has(target)) return v;
    return v.replace(/(-?\d*\.?\d+)px/g, (_, n: string) => `calc(${n} * 100cqw / ${this.width})`);
  }

  private wiring(): { segments: { phase: 'intro' | 'loop'; seg: Segment }[]; intro: number; targets: Set<string> } {
    const authored: Timed[] = this.segments.map(({ phase, seg }) => ({ phase, ...seg }));
    const carriers = (id: string) => {
      const chain = [id];
      for (let p = this.parents.get(id); p; p = this.parents.get(p)) chain.push(p);
      return chain;
    };
    const wirings: Wiring[] = this.links().flatMap(({ wire, ends }): Wiring[] => {
      const w = this.wires.get(wire)!;
      const own = authored.filter(s => s.target === wire && s.prop === 'strokeDashoffset');
      const join = ends.map(alts => alts.map(carriers));
      if (!ends.length) return [];
      if (this.hiddenWires.has(wire)) {
        const last = own.filter(s => s.phase === 'loop').reduce<Timed | undefined>((a, s) => (!a || s.start >= a.start ? s : a), undefined);
        const opensDrawn = last !== undefined && Math.abs(Number(last.to)) < 1;
        return this.introLength === 0 || own.some(s => s.phase === 'intro') || !opensDrawn ? [] : [{ target: wire, ends: join, loop: false }];
      }
      if (!w.dashed && (own.length || this.ambients.some(a => a.target === wire && a.prop === 'strokeDashoffset'))) return [];
      return [{ target: w.dashed ? `${wire}_grow-path` : wire, ends: join, loop: true }];
    });
    const wired = schedule(wirings, authored, this.introLength, this.loopLength);
    return { segments: wired.segments.map(({ phase, ...seg }) => ({ phase, seg: { ...seg, start: ms(seg.start), dur: ms(ms(seg.start) + seg.dur) - ms(seg.start) } })), intro: ms(wired.intro), targets: new Set(wirings.map(w => w.target)) };
  }

  motion(): MotionSpec {
    const group = new Map<string, { phase: 'intro' | 'loop'; target: string; prop: AnimatedProp; segs: Segment[] }>();
    const wired = this.wiring();
    const introLength = wired.intro;
    for (const { phase, seg } of [...this.segments, ...wired.segments]) {
      if (!this.ids.has(seg.target) && !wired.targets.has(seg.target)) throw new Error(`iso: an animation in scene ${this.name} targets unknown id "${seg.target}"`);
      const key = `${phase}|${seg.target}|${seg.prop}`;
      const g = group.get(key) ?? { phase, target: seg.target, prop: seg.prop, segs: [] };
      g.segs.push(seg);
      group.set(key, g);
    }
    for (const h of this.hovers) {
      if (this.segments.some(({ phase, seg }) => phase === 'loop' && seg.target === h.slab && seg.prop === 'opacity')) throw new Error(`iso: hover slab "${h.slab}" fades inside the loop; a hidden slab still catches the pointer, so keep hover slabs on screen once they arrive`);
      if (h.label !== undefined && this.segments.some(({ seg }) => seg.target === h.label && seg.prop === 'opacity')) throw new Error(`iso: label "${h.label}" is revealed by hover on "${h.slab}"; animating its opacity would override the hover`);
    }
    if (this.segments.some(s => s.phase === 'loop') && !(this.loopLength > 0)) throw new Error(`iso: scene ${this.name} uses at() but never calls loop()`);
    const tracks: Track[] = [];
    for (const { phase, target, prop, segs } of group.values()) {
      const total = phase === 'intro' ? introLength : this.loopLength;
      segs.sort((a, b) => a.start - b.start);
      const first = segs[0]!;
      const last = segs[segs.length - 1]!;
      const v = (x: string | number) => this.value(target, prop, x);
      const kf: Array<Record<string, string | number>> = [];
      let prev = phase === 'loop' ? last.to : first.from;
      let end = 0;
      kf.push({ offset: 0, [prop]: v(prev), easing: 'linear' });
      for (const s of segs) {
        if (ms(s.start + s.dur) > total) throw new Error(`iso: ${target}.${prop} ends at ${fmt(s.start + s.dur)}s, past the ${fmt(total)}s ${phase}`);
        if (s.start < end) throw new Error(`iso: ${target}.${prop} segments overlap at ${fmt(s.start)}s`);
        const o0 = Math.min(1, Math.max(Number(kf[kf.length - 1]!.offset), frac(s.start / total)));
        if (o0 > 0) kf.push({ offset: o0, [prop]: v(prev), easing: 'linear' });
        kf.push({ offset: o0, [prop]: v(s.from), easing: s.easing });
        kf.push({ offset: Math.min(1, Math.max(o0, frac(ms(s.start + s.dur) / total))), [prop]: v(s.to), easing: 'linear' });
        prev = s.to;
        end = ms(s.start + s.dur);
      }
      if (end < total) kf.push({ offset: 1, [prop]: v(prev) });
      const hasIntro = group.has(`intro|${target}|${prop}`);
      tracks.push({
        target: this.ref(target),
        prop,
        keyframes: kf,
        duration: total * 1000,
        delay: phase === 'loop' ? introLength * 1000 : 0,
        repeat: phase === 'loop',
        fill: phase === 'intro' ? 'both' : hasIntro ? 'none' : 'backwards',
      });
    }
    for (const a of this.ambients) {
      if (!this.ids.has(a.target)) throw new Error(`iso: an ambient track in scene ${this.name} targets unknown id "${a.target}"`);
      if (group.has(`intro|${a.target}|${a.prop}`) || group.has(`loop|${a.target}|${a.prop}`)) throw new Error(`iso: ${a.target}.${a.prop} has an ambient track and timed segments; give the ambient motion its own wrapper group`);
      const last = a.values.length - 1;
      tracks.push({
        target: this.ref(a.target),
        prop: a.prop,
        keyframes: a.values.map((v, i) => ({ offset: frac(i / last), [a.prop]: this.value(a.target, a.prop, v), easing: a.easing })),
        duration: a.period * 1000,
        delay: 0,
        repeat: true,
        fill: 'none',
      });
    }
    tracks.sort((a, b) => Number(a.repeat) - Number(b.repeat));
    return { intro: introLength, loop: this.loopLength, still: this.stillAt, tracks };
  }

  private checkSideTexts() {
    const eps = 0.5;
    for (const t of this.sideTexts) {
      const [x, y, z] = t.at;
      for (const b of this.solids) {
        if (z < b.z[0] - eps || z > b.z[1] + 2 * t.size) continue;
        const [along, across, front, label] = t.on === 'left' ? [x, y, b.y[1], 'y'] : [y, x, b.x[1], 'x'];
        const span = t.on === 'left' ? b.x : b.y;
        const back = t.on === 'left' ? b.y[0] : b.x[0];
        if (along < span[0] - eps || along > span[1] + eps) continue;
        if (across >= back - eps && across < front - eps) {
          throw new Error(`iso: text "${t.id}" in scene ${this.name} is printed on the ${t.on} plane at ${label} = ${fmt(across)}, ${z > b.z[1] + eps ? 'floating over the top of' : 'inside'} "${b.id}" where no face shows; put it on the visible ${t.on} face at ${label} = ${fmt(front)} (z between ${fmt(b.z[0])} and ${fmt(b.z[1])})`);
        }
      }
    }
  }

  render(): string {
    this.checkSideTexts();
    const o = this.opts;
    const lb = o.label ?? { bg: '#ffffff', border: 'rgb(15 23 42 / .14)', ink: '#0f172a', radius: 8 };
    const spec = JSON.stringify(this.motion()).replace(/</g, '\\u003c');
    const vars = `--iso-w:${this.width};aspect-ratio:${this.width}/${this.height};--iso-font:${o.font ?? 'inherit'};--iso-mono:${o.mono ?? 'ui-monospace, monospace'};--iso-label-bg:${lb.bg};--iso-label-border:${lb.border};--iso-label-ink:${lb.ink};--iso-label-radius:${lb.radius ?? 8}px`;
    for (const id of this.pivots.keys()) if (!this.ids.has(id)) throw new Error(`iso: pivot() names unknown id "${id}" in scene ${this.name}`);
    const pivots = [...this.pivots].map(([id, [x, y]]) => `#${this.ref(id)}{transform-box:view-box;transform-origin:${fmt(x)}px ${fmt(y)}px}`).join('');
    const reveal = pivots + [...this.prismClips.values()].join('') + this.hovers
      .flatMap(h => (h.label === undefined ? [] : [`#${this.ref(h.label)}{opacity:0;pointer-events:none;transition:opacity ${fmt(h.off)}ms ${h.offEase.replace(/[;{}<]/g, '')}}.iso:has(#${this.ref(h.slab)}.is-hot) #${this.ref(h.label)}{opacity:1;transition-duration:${fmt(h.on)}ms;transition-timing-function:${h.onEase.replace(/[;{}<]/g, '')}}`]))
      .join('');
    return `<div class="iso" data-iso="${this.name}" style="${escAttr(vars)}">${reveal ? `<style>${reveal}</style>` : ''}<svg viewBox="0 0 ${this.width} ${this.height}" aria-hidden="true"><defs>${[...this.defs.values()].join('')}</defs>${this.layers.join('')}</svg>${this.labels.join('')}<script type="application/json" class="iso-spec">${spec}</script></div>`;
  }

  exportSvg(options: ExportOptions = {}): string {
    this.checkSideTexts();
    if (this.labels.length) {
      const ids = [...this.labelIds].join('", "');
      throw new Error(`iso: exportSvg() in scene ${this.name} found label() "${ids}"; a standalone SVG cannot hold HTML labels, draw them with text() (use its pill option for a pill) instead`);
    }
    if (options.background !== undefined && !options.background.trim()) throw new Error('iso: exportSvg() background must be a CSS colour, got an empty string');
    const o = this.opts;
    const spec = this.motion();
    const still = (spec.intro + spec.still) * 1000;
    const css = (prop: AnimatedProp) => prop.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
    const keyframes: string[] = [];
    const byTarget = new Map<string, { run: string[]; delays: number[] }>();
    spec.tracks.forEach((t, i) => {
      const name = `${this.name}_k${i}`;
      const steps: string[] = [];
      let last = -1;
      for (const k of t.keyframes) {
        let pct = Number(k.offset) * 100;
        if (pct <= last) pct = Math.min(100, last + 0.001);
        last = pct;
        const value = k[t.prop];
        const easing = typeof k.easing === 'string' && k.easing !== 'linear' ? `;animation-timing-function:${k.easing}` : '';
        steps.push(`${Number(pct.toFixed(3))}%{${css(t.prop)}:${value}${easing}}`);
      }
      keyframes.push(`@keyframes ${name}{${steps.join('')}}`);
      const run = `${name} ${fmt(t.duration)}ms linear ${fmt(t.delay)}ms ${t.repeat ? 'infinite' : '1'} ${t.fill}`;
      const entry = byTarget.get(t.target) ?? { run: [], delays: [] };
      entry.run.push(run);
      entry.delays.push(t.delay);
      byTarget.set(t.target, entry);
    });
    const animate = [...byTarget].map(([id, e]) => `#${id}{animation:${e.run.join(',')}}`).join('');
    const reduce = [...byTarget].map(([id, e]) => `#${id}{animation-play-state:paused;animation-delay:${e.delays.map(d => `${fmt(d - still)}ms`).join(',')}}`).join('');
    const pivots = [...this.pivots].map(([id, [x, y]]) => `#${this.ref(id)}{transform-box:view-box;transform-origin:${fmt(x)}px ${fmt(y)}px}`).join('');
    const style = `svg{color:${options.color ?? o.label?.ink ?? '#0f172a'};--iso-font:${o.font ?? 'system-ui, sans-serif'};--iso-mono:${o.mono ?? 'ui-monospace, monospace'}}g[id],path[id]{transform-box:fill-box;transform-origin:center}.iso-hot,.iso-guides{opacity:0}${pivots}${[...this.prismClips.values()].join('')}${keyframes.join('')}${animate}@media (prefers-reduced-motion:reduce){${reduce}}`;
    const title = options.title ? `<title>${esc(options.title)}</title>` : '';
    const background = options.background ? `<rect width="100%" height="100%" fill="${escAttr(options.background)}"${options.radius ? ` rx="${fmt(options.radius)}"` : ''}/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" width="${this.width}" height="${this.height}" role="img"${options.title ? ` aria-label="${escAttr(options.title)}"` : ''}>${title}<style>${style.replace(/</g, '\\3c ')}</style><defs>${[...this.defs.values()].join('')}</defs>${background}${this.layers.join('')}</svg>`;
  }
}

export const isoCss = `.iso{position:relative;container-type:inline-size;width:100%;font-family:var(--iso-font)}
.iso>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.iso svg g[id],.iso svg path[id]{transform-box:fill-box;transform-origin:center}
.iso-label{position:absolute;transform:translate(var(--shift));white-space:nowrap;font-size:max(13px, calc(var(--fs) * 100cqw / var(--iso-w)));line-height:1.4;color:var(--iso-label-ink)}
.iso-pill{padding:.3em .7em;background:var(--iso-label-bg);border:1px solid var(--iso-label-border);border-radius:var(--iso-label-radius);font-family:var(--iso-mono);box-shadow:0 1px 2px rgb(15 23 42 / .06)}
.iso-card{padding:.8em 1em;background:var(--iso-label-bg);border:1px solid var(--iso-label-border);border-radius:calc(var(--iso-label-radius) * 1.5);box-shadow:0 12px 32px -14px rgb(15 23 42 / .28)}
.iso-plain{font-weight:500}
.iso-shadow{pointer-events:none}
.iso-lift,.iso-hot,.iso-hover>.iso-shadow{transition:translate var(--iso-off,325ms) var(--iso-off-ease,${ease.out}),opacity var(--iso-off,325ms) var(--iso-off-ease,${ease.out})}
.iso-hot{opacity:0}
.iso-guides{opacity:0;transition:opacity var(--iso-off,325ms) var(--iso-off-ease,${ease.out})}
.iso-hover.is-hot .iso-guides{opacity:1;transition-duration:var(--iso-on,270ms);transition-timing-function:var(--iso-on-ease,${ease.out})}
.iso-hover.is-hot .iso-lift{translate:0 calc(var(--lift) * -1px);transition-duration:var(--iso-on,270ms);transition-timing-function:var(--iso-on-ease,${ease.out})}
.iso-hover.is-hot .iso-hot{opacity:1;transition-duration:var(--iso-on,270ms);transition-timing-function:var(--iso-on-ease,${ease.out})}
.iso-hover.is-hot>.iso-shadow{opacity:.1;transition-duration:var(--iso-on,270ms);transition-timing-function:var(--iso-on-ease,${ease.out})}
@media (prefers-reduced-motion:reduce){.iso-hover .iso-lift{translate:none!important}}
@supports (overflow-clip-margin:1px){.iso{content-visibility:auto;overflow-clip-margin:32px}}`;

export function responsive(compact: Scene, wide: Scene, breakpoint = 720): string {
  const cls = `iso-switch-${compact.name}`;
  return `<style>.${cls}{container-type:inline-size}.${cls}>.iso-wide{display:none}@container (min-width:${breakpoint + 1}px){.${cls}>.iso-compact{display:none}.${cls}>.iso-wide{display:block}}</style><div class="iso-switch ${cls}"><div class="iso-compact">${compact.render()}</div><div class="iso-wide">${wide.render()}</div></div>`;
}

export function lazyBox(compact: SceneSize, wide?: SceneSize, breakpoint = 720): string {
  for (const v of wide ? [compact, wide] : [compact]) {
    if (!kebab.test(v.name)) throw new Error(`iso: lazyBox() scene name "${v.name}" must be lower-case kebab`);
    if (!(Number.isFinite(v.width) && v.width > 0 && Number.isFinite(v.height) && v.height > 0)) throw new Error(`iso: lazyBox() scene ${v.name} needs a positive width and height, got ${v.width}x${v.height}`);
  }
  if (wide && !(Number.isFinite(breakpoint) && breakpoint > 0)) throw new Error(`iso: lazyBox() breakpoint must be a positive number of px, got ${breakpoint}`);
  const box = `iso-lazy-${compact.name}`;
  const wideCss = wide ? `@container (min-width:${fmt(breakpoint + 1)}px){.${box}{aspect-ratio:${fmt(wide.width)}/${fmt(wide.height)}}}` : '';
  const wideAttr = wide ? ` data-wide="${wide.name}" data-breakpoint="${fmt(breakpoint)}"` : '';
  return `<style>.${box}{aspect-ratio:${fmt(compact.width)}/${fmt(compact.height)}}${wideCss}</style><div style="container-type:inline-size"><div class="${box}" data-iso-lazy data-compact="${compact.name}"${wideAttr}></div></div>`;
}
