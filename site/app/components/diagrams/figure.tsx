import type { ReactNode } from 'react';
import { Rich } from '@/components/parts/rich';

export function Diagram({ label, caption, className, children }: { label: string; caption?: string; className?: string; children: ReactNode }) {
  return (
    <figure className="dg not-prose">
      <div role="img" aria-label={label} className={className ? `dg-body ${className}` : 'dg-body'}>
        {children}
      </div>
      {caption && (
        <figcaption className="dg-caption">
          <Rich text={caption} />
        </figcaption>
      )}
    </figure>
  );
}

export function Arrow({ label }: { label?: string }) {
  return (
    <div className="dg-arrow" aria-hidden>
      <span className="dg-arrow-line" />
      {label && <span className="dg-arrow-label">{label}</span>}
    </div>
  );
}
