import { useEffect } from 'react';
import { isoCss, isoSizes } from '@/iso.generated';
import type { Locale } from '@/lib/i18n';
import { mountLazy } from '../../../iso/kit/runtime';

const BREAKPOINT = 600;

function box(compact: string, wide: string) {
  const c = isoSizes[compact];
  const w = isoSizes[wide];
  if (!c || !w) throw new Error(`iso: no rendered scene named ${compact} or ${wide}; run bun scripts/iso.ts`);
  const cls = `iso-lazy-${compact}`;
  return `<style>.${cls}{aspect-ratio:${c.width}/${c.height}}@container (min-width:${BREAKPOINT + 1}px){.${cls}{aspect-ratio:${w.width}/${w.height}}}</style><div style="container-type:inline-size"><div class="${cls}" data-iso-lazy data-compact="${compact}" data-wide="${wide}" data-breakpoint="${BREAKPOINT}"></div></div>`;
}

export function IsoScene({ id, lang, label, className }: { id: string; lang: Locale; label: string; className?: string }) {
  return (
    <figure role="img" aria-label={label} className={`home-iso ${className ?? ''}`}>
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} className={`home-iso-${theme}`} dangerouslySetInnerHTML={{ __html: box(`${id}-${lang}-${theme}-sm`, `${id}-${lang}-${theme}-lg`) }} />
      ))}
    </figure>
  );
}

export function IsoRuntime() {
  useEffect(() => {
    const handle = mountLazy({ src: (name) => `${import.meta.env.BASE_URL}iso/${name}.html`, rootMargin: '60% 0px' });
    return () => handle.disconnect();
  }, []);
  return <style>{isoCss}</style>;
}
