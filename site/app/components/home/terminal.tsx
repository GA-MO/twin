import type { CSSProperties, ReactNode } from 'react';
import type { HomeCopy } from './copy';

function Step({ at, className, children }: { at: number; className?: string; children: ReactNode }) {
  return (
    <div className={`term-step ${className ?? ''}`} style={{ '--at': `${at}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

export function Terminal({ t }: { t: HomeCopy['terminal'] }) {
  const replyAt = 900 + t.briefItems.length * 90 + 700;
  return (
    <figure className="term" role="img" aria-label={t.label}>
      <div className="term-bar" aria-hidden>
        <span className="term-dots">
          <i />
          <i />
          <i />
        </span>
        <span>~/my-twin · claude</span>
      </div>
      <div className="term-body" aria-hidden>
        <Step at={0} className="term-welcome">
          <span>
            <span className="term-accent">✻</span> Welcome to Claude Code
          </span>
          <span className="term-dim">cwd: ~/my-twin</span>
        </Step>
        <Step at={350} className="term-hook">
          <span className="term-dim">⎿ SessionStart:startup hook</span>
        </Step>
        <div className="term-brief">
          <Step at={600} className="term-strong">
            {t.briefHead}
          </Step>
          <Step at={750} className="term-strong">
            {t.briefSection}
          </Step>
          {t.briefItems.map((line, i) => (
            <Step key={line} at={900 + i * 90}>
              {line}
            </Step>
          ))}
        </div>
        <Step at={replyAt - 350} className="term-prompt">
          <span className="term-dim">&gt;</span> {t.prompt}
        </Step>
        <Step at={replyAt} className="term-reply">
          <span className="term-bullet">⏺</span>
          <span>{t.reply}</span>
        </Step>
        <Step at={replyAt + 500} className="term-band">
          <div className="term-card">
            <div className="term-card-row">
              <span className="term-kind">{t.band.kind}</span>
              <span className="term-dim">{t.band.meta}</span>
            </div>
            <div className="term-strong">{t.band.ask}</div>
            <div className="term-buttons">
              <span className="term-btn term-btn-primary">{t.band.primary}</span>
              <span className="term-btn">{t.band.secondary}</span>
            </div>
          </div>
          <div className="term-frame">
            <span>
              <span className="term-live" /> nok
            </span>
            <span className="term-dim">{t.status}</span>
          </div>
        </Step>
        <Step at={replyAt + 650} className="term-input">
          <span className="term-dim">&gt;</span>
          <span className="term-cursor" />
        </Step>
        <Step at={replyAt + 650} className="term-hint">
          <span className="term-dim">? for shortcuts</span>
        </Step>
      </div>
    </figure>
  );
}
