import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { TwinMark } from '@/components/wordmark';
import { repoUrl } from '@/lib/shared';
import { CopyCommand } from './copy-command';
import { DeskBand, toneClass } from '@/components/parts/band';
import { AutonomyLadder } from '@/components/diagrams/autonomy-ladder';
import { Onboard } from './onboard';
import { oneLine, type Actor, type HomeCopy } from './copy';
import type { Locale } from '@/lib/i18n';
import { BRIEF_SOURCES, BriefSample } from '@/components/diagrams/brief-flow';
import { Rich } from '@/components/parts/rich';
import { Flow } from './flow';
import { LineField } from './line-field';
import { Terminal } from './terminal';

const shell = 'mx-auto w-full max-w-[1160px] px-4 md:px-8';

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="home-section">
      <div className={`${shell} grid grid-cols-1 gap-x-12 gap-y-10 py-20 md:py-28 lg:grid-cols-12`}>
        <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
          <p className="home-eyebrow">{eyebrow}</p>
          <h2 id={id} className="home-h2">
            {title}
          </h2>
          <div className="mt-4 space-y-4 text-[0.975rem] leading-relaxed text-fd-muted-foreground">{intro}</div>
        </div>
        <div className="min-w-0 lg:col-span-8">{children}</div>
      </div>
    </section>
  );
}

export function Hero({ c, docs }: { c: HomeCopy; docs: string }) {
  return (
    <div className="home-hero">
      <LineField />
      <div className="home-hero-grid" aria-hidden />
      <section className={`${shell} relative grid grid-cols-1 items-center gap-x-12 gap-y-14 pt-14 pb-20 md:pt-24 md:pb-28 lg:grid-cols-12`}>
        <div className="min-w-0 lg:col-span-5">
          <p className="home-kicker">
            <span className="home-kicker-dot" aria-hidden />
            {c.hero.kicker}
          </p>
          <h1 className="home-h1 mt-6 whitespace-pre-line">{c.hero.title}</h1>
          <p className="mt-6 max-w-[34rem] text-[1.075rem] leading-relaxed text-fd-muted-foreground">{c.hero.lede}</p>
          <div className="mt-8 max-w-[34rem]">
            <CopyCommand command={oneLine} label={c.hero.copy} done={c.hero.copied} />
            <p className="mt-2.5 text-[0.8125rem] text-fd-muted-foreground">{c.hero.needs}</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={docs} className="home-btn home-btn-primary">
              {c.hero.docs}
            </Link>
            <a href={repoUrl} className="home-btn">
              {c.hero.github}
            </a>
          </div>
        </div>
        <div className="home-hero-visual min-w-0 lg:col-span-7">
          <Terminal t={c.terminal} />
        </div>
      </section>
    </div>
  );
}

export function HowItWorks({ c, eyebrow }: { c: HomeCopy['flow']; eyebrow: string }) {
  return (
    <section aria-labelledby="flow" className="home-section">
      <div className={`${shell} py-20 md:py-28`}>
        <p className="home-eyebrow">{eyebrow}</p>
        <h2 id="flow" className="home-h2 max-w-[44rem]">
          {c.title}
        </h2>
        <p className="mt-4 max-w-[44rem] text-[0.975rem] leading-relaxed text-fd-muted-foreground">{c.body}</p>
        <div className="mt-12">
          <Flow c={c} />
        </div>
      </div>
    </section>
  );
}

const COLLECTORS = ['calendar', 'projects', 'notes', 'runs', 'journal', 'deps', 'disk', 'inbox', 'radar', 'history', 'audit', 'onboard'] as const;

const inBrief = new Set<string>(BRIEF_SOURCES);

export function Brief({ c, eyebrow, lang, docs }: { c: HomeCopy['brief']; eyebrow: string; lang: Locale; docs: string }) {
  return (
    <section aria-labelledby="brief" className="home-section">
      <div className={`${shell} py-20 md:py-28`}>
        <div className="grid grid-cols-1 gap-x-12 gap-y-4 lg:grid-cols-12 lg:items-end">
          <div className="min-w-0 lg:col-span-6">
            <p className="home-eyebrow">{eyebrow}</p>
            <h2 id="brief" className="home-h2">
              {c.title}
            </h2>
          </div>
          <div className="min-w-0 lg:col-span-6">
            <p className="text-[0.975rem] leading-relaxed text-fd-muted-foreground">{c.body}</p>
            <Link to={`${docs}/concepts/brief`} className="home-link mt-3">
              {c.more}
            </Link>
          </div>
        </div>
        <figure className="mt-12 md:mt-16">
          <div className="home-feed" aria-hidden>
            {COLLECTORS.map((name) => (
              <span key={name} className={inBrief.has(name) ? 'is-lit' : undefined}>
                {name}
              </span>
            ))}
          </div>
          <BriefSample lang={lang} label={c.label} sources className="dg-term home-brief" />
          <figcaption className="mt-3 text-[0.8125rem] text-fd-muted-foreground">{c.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}

export function Learn({ c, eyebrow, lang }: { c: HomeCopy['learn']; eyebrow: string; lang: Locale }) {
  return (
    <section aria-labelledby="learn" className="home-section">
      <div className={`${shell} py-20 md:py-28`}>
        <p className="home-eyebrow">{eyebrow}</p>
        <h2 id="learn" className="home-h2 max-w-[44rem]">
          {c.title}
        </h2>
        <div className="mt-4 max-w-[44rem] space-y-4 text-[0.975rem] leading-relaxed text-fd-muted-foreground">
          {c.body.map((p) => (
            <p key={p}>
              <Rich text={p} />
            </p>
          ))}
        </div>
        <div className="home-learn mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          <div className="min-w-0 lg:col-span-7">
            <Onboard c={c.card} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <AutonomyLadder lang={lang} vertical />
          </div>
        </div>
      </div>
    </section>
  );
}

const actorTone: Record<Actor, string> = {
  you: 'home-actor-you',
  agent: 'home-actor-agent',
  worker: '',
  git: '',
};

export function Dispatch({ c, eyebrow }: { c: HomeCopy['dispatch']; eyebrow: string }) {
  return (
    <Section id="dispatch" eyebrow={eyebrow} title={c.title} intro={<p>{c.body}</p>}>
      <ol className="home-run">
        {c.steps.map((s) => (
          <li key={s.text} className={`home-run-step ${actorTone[s.actor]}`}>
            <span className="home-run-actor">{c.actors[s.actor]}</span>
            <div className="min-w-0">
              <p className="leading-relaxed">
                <Rich text={s.text} />
              </p>
              {s.code && <code className="chip-code mt-2 inline-block max-w-full break-all">{s.code}</code>}
            </div>
          </li>
        ))}
      </ol>
      <ul className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-3">
        {c.facts.map((f) => (
          <li key={f} className="border-t border-fd-border pt-4 text-[0.875rem] leading-relaxed text-fd-muted-foreground">
            <Rich text={f} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Band({ c, eyebrow }: { c: HomeCopy['band']; eyebrow: string }) {
  return (
    <Section id="band" eyebrow={eyebrow} title={c.title} intro={<p>{c.body}</p>}>
      <figure className="m-0">
        <div className="term home-band" role="img" aria-label={c.label}>
          <DeskBand cards={c.cards.map((card) => ({ ...card, tone: card.kind, label: c.names[card.kind] }))} name="nok" facts={c.status} />
        </div>
        <figcaption className="mt-3 text-[0.8125rem] text-fd-muted-foreground">{c.caption}</figcaption>
      </figure>
      <div role="table" className="mt-12 text-[0.9rem]">
        <div role="row" className="hidden grid-cols-[9rem_1fr_12rem] gap-x-5 border-b border-fd-border pb-2.5 text-[0.8125rem] text-fd-muted-foreground sm:grid">
          <span role="columnheader">{c.head.card}</span>
          <span role="columnheader">{c.head.when}</span>
          <span role="columnheader">{c.head.buttons}</span>
        </div>
        {c.kinds.map((k) => (
          <div role="row" key={k.tone} className="grid grid-cols-1 gap-x-5 gap-y-1.5 border-b border-fd-border py-3.5 sm:grid-cols-[9rem_1fr_12rem]">
            <span role="cell" className={`text-[0.875rem] font-medium ${toneClass[k.tone]}`}>
              {c.names[k.tone]}
            </span>
            <span role="cell" className="leading-relaxed text-fd-muted-foreground">
              {k.when}
            </span>
            <span role="cell" className="flex flex-wrap items-start gap-1.5 self-start">
              {k.buttons.map((b, i) => (
                <span key={b} className={i === 0 ? 'home-chip home-chip-primary' : 'home-chip'}>
                  {b}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <ul className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-3">
        {c.facts.map((f) => (
          <li key={f} className="border-t border-fd-border pt-4 text-[0.875rem] leading-relaxed text-fd-muted-foreground">
            <Rich text={f} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-display text-[1.05rem] font-semibold">{title}</h3>
      <ul className="mt-3">
        {items.map((item) => (
          <li key={item} className="border-b border-fd-border py-3.5 text-[0.9rem] leading-relaxed text-fd-muted-foreground last:border-b-0">
            <Rich text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Data({ c, eyebrow }: { c: HomeCopy['data']; eyebrow: string }) {
  return (
    <Section id="data" eyebrow={eyebrow} title={c.title} intro={<p>{c.body}</p>}>
      <div className="grid gap-10 md:grid-cols-2">
        <List title={c.keptTitle} items={c.kept} />
        <List title={c.neverTitle} items={c.never} />
      </div>
      <p className="mt-8 rounded-lg border border-fd-border bg-fd-card px-4 py-3 text-[0.875rem] leading-relaxed">{c.note}</p>
    </Section>
  );
}

export function Install({ c, docs }: { c: HomeCopy['install']; docs: string }) {
  return (
    <section aria-labelledby="install" className="home-section">
      <div className={`${shell} py-20 md:py-28`}>
        <h2 id="install" className="home-h2">
          {c.title}
        </h2>
        <p className="mt-4 max-w-[40rem] text-[0.975rem] leading-relaxed text-fd-muted-foreground">{c.body}</p>
        <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {c.steps.map((s, i) => (
            <li key={s.title} className="flex min-w-0 flex-col">
              <span className="home-step-n" aria-hidden>
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-[1.1rem] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-fd-muted-foreground">{s.body}</p>
              {s.code && (
                <pre className="mt-5 overflow-x-auto rounded-lg border border-fd-border bg-fd-card px-4 py-3 font-mono text-[0.78rem] leading-[1.75] lg:mt-auto">
                  <code>{s.code}</code>
                </pre>
              )}
            </li>
          ))}
        </ol>
        <Link to={docs} className="home-btn mt-12">
          {c.guide}
        </Link>
      </div>
    </section>
  );
}

export function Footer({ c, docs, other }: { c: HomeCopy['footer']; docs: string; other: string }) {
  return (
    <footer className="border-t border-fd-border">
      <div className={`${shell} flex flex-col gap-6 py-10 text-[0.875rem] md:flex-row md:items-center md:justify-between`}>
        <div className="flex items-center gap-3">
          <TwinMark className="size-5" />
          <span className="text-fd-muted-foreground">{c.line}</span>
        </div>
        <nav className="flex gap-6 text-fd-muted-foreground">
          <Link to={docs} className="hover:text-fd-foreground">
            {c.docs}
          </Link>
          <a href={repoUrl} className="hover:text-fd-foreground">
            {c.github}
          </a>
          <Link to={other} className="hover:text-fd-foreground">
            {c.other}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
