export const LEVELS = ['observe', 'ask', 'draft', 'tell', 'silent'] as const;
export type Level = (typeof LEVELS)[number];
export const START_LEVEL: Level = 'ask';

export type LevelCopy = Record<Level, { name: string; desc: string }>;

export function LevelScale({
  levels,
  startNote,
  showIds,
  vertical,
  className,
}: {
  levels: LevelCopy;
  startNote: string;
  showIds?: boolean;
  vertical?: boolean;
  className?: string;
}) {
  return (
    <ol className={`${className ?? ''} grid gap-px overflow-hidden rounded-xl border border-fd-border bg-fd-border ${vertical ? 'scale-vertical' : 'sm:grid-cols-5'}`}>
      {(vertical ? [...LEVELS].reverse() : LEVELS).map((level) => (
        <li key={level} className={`scale-level ${level === START_LEVEL ? 'scale-level-start' : ''}`}>
          <span className="font-display text-[0.975rem] font-semibold">{levels[level].name}</span>
          {showIds && <code className="ml-2 font-mono text-[0.75rem] text-fd-muted-foreground sm:ml-0 sm:block">{level}</code>}
          <span className="mt-1 block text-[0.8125rem] leading-snug text-fd-muted-foreground">{levels[level].desc}</span>
          {level === START_LEVEL && <span className="mt-3 block text-[0.75rem] font-medium text-fd-primary">{startNote}</span>}
        </li>
      ))}
    </ol>
  );
}
