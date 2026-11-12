import type { AnimatedProp } from './iso.ts';

export interface Timed {
  phase: 'intro' | 'loop';
  target: string;
  prop: AnimatedProp;
  start: number;
  dur: number;
  from: string | number;
  to: string | number;
  easing: string;
}

export interface Wiring {
  target: string;
  ends: readonly (readonly (readonly string[])[])[];
  loop: boolean;
}

type Span = readonly [number, number];

export const wireTiming = { draw: 0.3, retract: 0.2, gap: 0.05, drawEase: 'cubic-bezier(.22,1,.36,1)', retractEase: 'cubic-bezier(.5,0,.75,0)' } as const;

const placeProps = ['opacity', 'translate', 'scale'] as const;
const numbers = (v: string | number) => (typeof v === 'number' ? [v] : (v.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number));

function away(prop: (typeof placeProps)[number], v: string | number): boolean {
  const n = numbers(v);
  if (prop === 'opacity') return (n[0] ?? 1) < 0.1;
  if (prop === 'translate') return Math.hypot(n[0] ?? 0, n[1] ?? 0) > 8;
  return n.some(x => Math.abs(x - 1) > 0.2);
}

const eps = 0.002;

function merge(spans: Span[]): Span[] {
  const out: [number, number][] = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + eps) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) if (Math.min(a1, b1) > Math.max(a0, b0)) out.push([Math.max(a0, b0), Math.min(a1, b1)]);
  return merge(out);
}

function absent(segments: readonly Timed[], ids: readonly string[], phase: Timed['phase'], total: number): Span[] {
  const spans: Span[] = [];
  for (const id of ids)
    for (const prop of placeProps) {
      const segs = segments.filter(s => s.phase === phase && s.target === id && s.prop === prop).sort((x, y) => x.start - y.start);
      if (!segs.length) {
        const held = phase === 'intro' ? awayAtLoopStart(segments, id, prop) : awayAfterIntro(segments, id, prop);
        if (held) spans.push([0, total]);
        continue;
      }
      let held = phase === 'intro' ? segs[0]!.from : segs[segs.length - 1]!.to;
      let cursor = 0;
      for (let i = 0; i < segs.length; ) {
        const first = segs[i]!;
        let end = first.start + first.dur;
        let gone = away(prop, first.from) || away(prop, first.to);
        let j = i + 1;
        for (; j < segs.length && segs[j]!.start <= end + eps; j++) {
          end = Math.max(end, segs[j]!.start + segs[j]!.dur);
          gone ||= away(prop, segs[j]!.from) || away(prop, segs[j]!.to);
        }
        if (away(prop, held) && first.start > cursor) spans.push([cursor, first.start]);
        if (gone) spans.push([first.start, end]);
        held = segs[j - 1]!.to;
        cursor = end;
        i = j;
      }
      if (away(prop, held) && cursor < total) spans.push([cursor, total]);
    }
  return merge(spans);
}

const lastOf = (segments: readonly Timed[], phase: Timed['phase'], id: string, prop: string) => segments.filter(s => s.phase === phase && s.target === id && s.prop === prop).reduce<Timed | undefined>((a, s) => (!a || s.start >= a.start ? s : a), undefined);

function awayAtLoopStart(segments: readonly Timed[], id: string, prop: (typeof placeProps)[number]): boolean {
  const held = lastOf(segments, 'loop', id, prop);
  return held !== undefined && away(prop, held.to);
}

function awayAfterIntro(segments: readonly Timed[], id: string, prop: (typeof placeProps)[number]): boolean {
  const end = lastOf(segments, 'intro', id, prop);
  return end !== undefined && away(prop, end.to);
}

function goneAfterIntro(segments: readonly Timed[], ids: readonly string[]): boolean {
  return ids.some(id =>
    placeProps.some(prop => {
      const end = lastOf(segments, 'intro', id, prop);
      return end ? away(prop, end.to) : awayAtLoopStart(segments, id, prop);
    }),
  );
}

function endAbsent(segments: readonly Timed[], alternatives: readonly (readonly string[])[], phase: Timed['phase'], total: number): Span[] {
  return alternatives.map(ids => absent(segments, ids, phase, total)).reduce((a, b) => intersect(a, b));
}

export function schedule(wirings: readonly Wiring[], segments: readonly Timed[], intro: number, loop: number): { segments: Timed[]; intro: number } {
  const out: Timed[] = [];
  let introEnd = intro;
  const seg = (phase: Timed['phase'], target: string, start: number, dur: number, from: number, to: number, easing: string) => out.push({ phase, target, prop: 'strokeDashoffset', start, dur, from, to, easing });
  for (const w of wirings) {
    const hidden = w.ends.map(alts => endAbsent(segments, alts, 'intro', intro));
    const late = intro > 0 ? w.ends.some(alts => alts.every(ids => goneAfterIntro(segments, ids))) : loop > 0 && w.ends.some(alts => endAbsent(segments, alts, 'loop', loop).some(([a]) => a <= eps));
    const arrive = Math.max(0, ...hidden.flat().map(([, b]) => b));
    if (late) {
      if (intro > 0) seg('intro', w.target, 0, 0.001, 1, 1, 'linear');
    } else {
      seg('intro', w.target, arrive, wireTiming.draw, 1, 0, wireTiming.drawEase);
      introEnd = Math.max(introEnd, arrive + wireTiming.draw);
    }
    if (!(loop > 0) || !w.loop) continue;
    const hide = hiddenWindows(merge(w.ends.flatMap(alts => endAbsent(segments, alts, 'loop', loop))), loop);
    if (hide === 'always') {
      seg('loop', w.target, 0, 0.001, 1, 1, 'linear');
      continue;
    }
    const around = (start: number, dur: number, from: number, to: number, easing: string) => {
      const wrapped = ((start % loop) + loop) % loop;
      const t = wrapped > loop - eps ? 0 : wrapped;
      if (t + dur <= loop + eps) return seg('loop', w.target, t, Math.min(dur, loop - t), from, to, easing);
      const split = from + ((to - from) * (loop - t)) / dur;
      seg('loop', w.target, t, loop - t, from, split, 'linear');
      seg('loop', w.target, 0, t + dur - loop, split, to, 'linear');
    };
    for (const [a, b] of hide) {
      around(a - wireTiming.retract, wireTiming.retract, 0, 1, wireTiming.retractEase);
      around(b, wireTiming.draw, 1, 0, wireTiming.drawEase);
    }
  }
  return { segments: out, intro: introEnd };
}

function hiddenWindows(spans: Span[], loop: number): Span[] | 'always' {
  if (!spans.length) return [];
  const room = wireTiming.draw + wireTiming.retract + wireTiming.gap;
  const ring = spans.map(([a, b]) => [a, b] as [number, number]);
  if (ring.length > 1 && ring[0]![0] <= eps && ring[ring.length - 1]![1] >= loop - eps) {
    const head = ring.shift()!;
    ring[ring.length - 1]![1] = loop + head[1];
  }
  const out: [number, number][] = [];
  for (const s of ring) {
    const last = out[out.length - 1];
    if (last && s[0] - last[1] < room) last[1] = s[1];
    else out.push(s);
  }
  if (out.length > 1 && out[0]![0] + loop - out[out.length - 1]![1] < room) {
    const head = out.shift()!;
    out[out.length - 1]![1] = loop + head[1];
  }
  const covered = out.reduce((n, [a, b]) => n + b - a, 0);
  if (covered >= loop - room) return 'always';
  return out;
}
