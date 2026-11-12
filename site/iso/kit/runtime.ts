import type { MotionSpec } from './iso.ts';

export interface IsoHandle {
  spec: MotionSpec;
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  destroy(): void;
}

declare global {
  interface Window {
    isoSeek?: (seconds: number) => void;
    isoInfo?: () => Array<{ name: string; intro: number; loop: number; still: number; visible: boolean }>;
  }
  interface HTMLElement {
    iso?: IsoHandle;
  }
}

function parse(root: HTMLElement): MotionSpec {
  const raw = root.querySelector('script.iso-spec')?.textContent;
  if (!raw) throw new Error(`iso: scene ${root.dataset.iso ?? '?'} has no motion spec`);
  const spec: MotionSpec = JSON.parse(raw);
  return spec;
}

const LIFT_MS = 270;

const asleep = new Map<HTMLElement, () => void>();
const wakeNear = () => {
  const near = [...asleep].filter(([root]) => {
    const r = root.getBoundingClientRect();
    return r.height && r.right > 0 && r.left < innerWidth && r.bottom > -innerHeight / 2 && r.top < innerHeight * 1.5;
  });
  for (const [, approach] of near) approach();
};
let resized: ResizeObserver | undefined;
const sleep = (root: HTMLElement, approach: () => void) => {
  resized ??= new ResizeObserver(wakeNear);
  if (!asleep.size) {
    addEventListener('scroll', wakeNear, { capture: true, passive: true });
    resized.observe(document.documentElement);
  }
  asleep.set(root, approach);
  resized.observe(root);
};
const rouse = (root: HTMLElement) => {
  if (!asleep.delete(root)) return;
  resized?.unobserve(root);
  if (asleep.size) return;
  removeEventListener('scroll', wakeNear, { capture: true });
  resized?.unobserve(document.documentElement);
};

export function mount(root: HTMLElement): IsoHandle {
  const spec = parse(root);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = spec.tracks.flatMap(t => {
    const el = root.querySelector<Element>(`#${CSS.escape(t.target)}`);
    if (!el) return [];
    const a = el.animate(t.keyframes, { duration: t.duration, delay: t.delay, iterations: t.repeat ? Infinity : 1, fill: t.fill });
    a.pause();
    a.currentTime = 0;
    return [a];
  });
  let parked: Array<CSSNumberish | null> | null = null;
  let near = false;
  const wake = () => {
    const times = parked;
    if (!times) return;
    parked = null;
    rouse(root);
    animations.forEach((a, i) => (a.currentTime = times[i] ?? null));
  };
  const park = () => {
    if (parked) return;
    parked = animations.map(a => a.currentTime);
    for (const a of animations) a.cancel();
    sleep(root, () => {
      near = true;
      wake();
    });
  };
  const seek = (s: number) => {
    if (parked) {
      parked = animations.map(() => s * 1000);
      return;
    }
    for (const a of animations) {
      a.pause();
      a.currentTime = s * 1000;
    }
  };
  const still = () => seek(spec.intro + spec.still);
  let started = false;
  let visible = false;
  let held = false;
  const settle = () => (near || held ? wake() : park());
  const play = () => {
    if (reduce.matches) return still();
    wake();
    if (!started) {
      seek(0);
      started = true;
    }
    for (const a of animations) a.play();
  };
  const pause = () => {
    if (parked) return;
    for (const a of animations) a.pause();
  };
  let ratio = 0;
  const startAt = () => Math.min(0.4, (innerHeight * 0.5) / Math.max(1, root.getBoundingClientRect().height));
  const sync = () => {
    if (held) return;
    if (!visible || document.hidden) return pause();
    if (!started && ratio < startAt()) return;
    play();
  };
  const onReduce = () => (reduce.matches ? still() : sync());
  const observer = new IntersectionObserver(entries => {
    ratio = entries[entries.length - 1]?.intersectionRatio ?? 0;
    visible = ratio > 0.1;
    sync();
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] });
  observer.observe(root);
  const parker = new IntersectionObserver(entries => {
    near = entries[entries.length - 1]?.isIntersecting ?? false;
    settle();
  }, { rootMargin: '50% 0px' });
  parker.observe(root);
  let press: { id: number; x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    press = e.pointerType === 'mouse' ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onCancel = () => {
    press = null;
  };
  const onUp = (e: PointerEvent) => {
    if (!press || press.id !== e.pointerId || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) return onCancel();
    press = null;
    const el = e.target instanceof Element ? e.target.closest('.iso-hover') : null;
    const hit = el && root.contains(el) ? el : null;
    for (const h of root.querySelectorAll('.iso-hover.is-hot')) if (h !== hit) h.classList.remove('is-hot');
    hit?.classList.toggle('is-hot');
  };
  const timers = new Map<Element, number>();
  const since = new Map<Element, number>();
  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !(e.currentTarget instanceof Element)) return;
    const el = e.currentTarget;
    clearTimeout(timers.get(el));
    if (!el.classList.contains('is-hot')) {
      el.classList.add('is-hot');
      since.set(el, performance.now());
    }
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !(e.currentTarget instanceof Element)) return;
    const el = e.currentTarget;
    clearTimeout(timers.get(el));
    timers.set(el, window.setTimeout(() => el.classList.remove('is-hot'), Math.max(0, (el.hasAttribute('data-hold') ? Number(el.getAttribute('data-hold')) : LIFT_MS) - (performance.now() - (since.get(el) ?? 0)))));
  };
  const hovers = [...root.querySelectorAll<SVGElement>('.iso-hover')];
  for (const h of hovers) {
    h.addEventListener('pointerenter', onEnter);
    h.addEventListener('pointerleave', onLeave);
  }
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', onReduce);
  if (reduce.matches) still();
  const destroy = () => {
    observer.disconnect();
    parker.disconnect();
    rouse(root);
    for (const h of hovers) {
      h.removeEventListener('pointerenter', onEnter);
      h.removeEventListener('pointerleave', onLeave);
    }
    for (const t of timers.values()) clearTimeout(t);
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    for (const h of root.querySelectorAll('.iso-hover.is-hot')) h.classList.remove('is-hot');
    document.removeEventListener('visibilitychange', sync);
    reduce.removeEventListener('change', onReduce);
    for (const a of animations) a.cancel();
    delete root.iso;
  };
  const handle = {
    spec,
    seek: (s: number) => {
      held = true;
      started = true;
      wake();
      seek(s);
    },
    play: () => {
      held = false;
      started = true;
      play();
      settle();
    },
    pause: () => {
      held = true;
      wake();
      pause();
    },
    destroy,
  };
  root.iso = handle;
  return handle;
}

export function mountAll(scope: ParentNode = document): IsoHandle[] {
  const handles = [...scope.querySelectorAll<HTMLElement>('.iso')].flatMap(r => {
    if (r.iso) return [];
    try {
      return [mount(r)];
    } catch (e) {
      console.error(`iso: scene ${r.dataset.iso ?? '?'} could not start`, e);
      return [];
    }
  });
  window.isoSeek = (s: number) => {
    for (const r of document.querySelectorAll<HTMLElement>('.iso')) r.iso?.seek(s);
  };
  window.isoInfo = () =>
    [...document.querySelectorAll<HTMLElement>('.iso')].flatMap(r =>
      r.iso ? [{ name: r.dataset.iso ?? '', intro: r.iso.spec.intro, loop: r.iso.spec.loop, still: r.iso.spec.still, visible: r.offsetParent !== null }] : [],
    );
  return handles;
}

export interface LazyOptions {
  src: (name: string) => string;
  rootMargin?: string;
  onError?: (box: HTMLElement, retry: () => void, error: unknown) => void;
}

export interface LazyHandle {
  disconnect(): void;
}

function retryNote(box: HTMLElement, retry: () => void) {
  const note = document.createElement('button');
  note.type = 'button';
  note.textContent = 'This scene did not load. Retry';
  note.style.cssText = 'all:unset;cursor:pointer;font:inherit;text-decoration:underline;margin:auto';
  note.addEventListener('click', retry);
  box.replaceChildren(note);
}

export function mountLazy(options: LazyOptions, scope: ParentNode = document): LazyHandle {
  if (typeof options?.src !== 'function') throw new Error('iso: mountLazy() needs { src: (name) => url of that scene file }');
  const rootMargin = options.rootMargin ?? '75% 0px';
  const onError = options.onError ?? retryNote;
  const cache = new Map<string, Promise<string>>();
  const load = (name: string) => {
    let markup = cache.get(name);
    if (!markup) {
      markup = fetch(options.src(name)).then(r => {
        if (!r.ok) throw new Error(`iso: scene ${name}: HTTP ${r.status}`);
        return r.text();
      });
      markup.catch(() => cache.delete(name));
      cache.set(name, markup);
    }
    return markup;
  };
  const pick = (box: HTMLElement) => {
    const { compact, wide, breakpoint } = box.dataset;
    return wide && box.getBoundingClientRect().width >= Number(breakpoint) + 1 ? wide : compact;
  };
  const unmount = (box: HTMLElement) => {
    for (const old of box.querySelectorAll<HTMLElement>('.iso')) old.iso?.destroy();
  };
  const fail = (box: HTMLElement, error: unknown) => {
    console.error(error);
    unmount(box);
    delete box.dataset.shown;
    onError(box, () => show(box), error);
  };
  const show = async (box: HTMLElement) => {
    if (!box.clientWidth) return;
    const name = pick(box);
    if (!name) return console.error('iso: a [data-iso-lazy] box has no data-compact scene name', box);
    if (box.dataset.loading === name) return;
    if (box.dataset.shown === name) {
      delete box.dataset.loading;
      return;
    }
    box.dataset.loading = name;
    let markup: string;
    try {
      markup = await load(name);
    } catch (e) {
      if (box.dataset.loading !== name) return;
      delete box.dataset.loading;
      if (box.dataset.shown) console.error(e);
      else fail(box, e);
      return;
    }
    if (box.dataset.loading !== name) return;
    delete box.dataset.loading;
    const template = document.createElement('template');
    template.innerHTML = markup;
    unmount(box);
    box.replaceChildren(template.content);
    try {
      const root = box.querySelector<HTMLElement>('.iso');
      if (!root) throw new Error(`iso: scene file ${name} has no .iso root`);
      mount(root);
      box.dataset.shown = name;
    } catch (e) {
      fail(box, e);
    }
  };
  const near = new IntersectionObserver(
    entries => {
      for (const e of entries) if (e.isIntersecting && e.target instanceof HTMLElement) show(e.target);
    },
    { rootMargin },
  );
  const resized = new ResizeObserver(entries => {
    for (const e of entries) if (e.target instanceof HTMLElement && (e.target.dataset.shown || e.target.dataset.loading)) show(e.target);
  });
  for (const box of scope.querySelectorAll<HTMLElement>('[data-iso-lazy]')) {
    near.observe(box);
    if (box.dataset.wide) resized.observe(box);
  }
  return {
    disconnect() {
      near.disconnect();
      resized.disconnect();
    },
  };
}
