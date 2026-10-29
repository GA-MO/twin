import type { ReactNode } from 'react';

export function TermWindow({ title, label, className, children }: { title: string; label: string; className?: string; children: ReactNode }) {
  return (
    <figure className={className ? `term ${className}` : 'term'} role="img" aria-label={label}>
      <div className="term-bar" aria-hidden>
        <span className="term-dots">
          <i />
          <i />
          <i />
        </span>
        <span>{title}</span>
      </div>
      <div className="term-body" aria-hidden>
        {children}
      </div>
    </figure>
  );
}
