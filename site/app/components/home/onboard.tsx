import { TwinMark } from '@/components/wordmark';
import type { HomeCopy } from './copy';

export function Onboard({ c }: { c: HomeCopy['learn']['card'] }) {
  return (
    <figure className="home-onboard" role="img" aria-label={c.label}>
      <div className="home-onboard-turn" aria-hidden>
        <p className="home-onboard-who">
          <TwinMark className="size-4" />
          nok
        </p>
        <p>{c.intro}</p>
        <p className="home-onboard-rule">{c.rule}</p>
        <p className="home-onboard-why">{c.why}</p>
        <blockquote className="home-onboard-quote">
          <p>“{c.quote}”</p>
          <cite>{c.from}</cite>
        </blockquote>
        <ol className="home-onboard-options">
          {c.options.map((option, i) => (
            <li key={option}>
              <span>{i + 1}</span>
              {option}
            </li>
          ))}
        </ol>
        <p className="home-onboard-hint">{c.hint}</p>
      </div>
      <div className="home-onboard-input" aria-hidden>
        <span className="term-cursor" />
      </div>
    </figure>
  );
}
