import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { TermWindow } from '@/components/parts/term';

type Tone = 'cmd' | 'head' | 'dim' | 'plain' | 'ask' | 'done';
type Line = { at: number; tone: Tone; text: string };

const LINES: Line[] = [
  { at: 0, tone: 'cmd', text: 'curl -fsSL https://ga-mo.github.io/twin/install.sh | sh' },
  { at: 550, tone: 'head', text: '1/4 git' },
  { at: 680, tone: 'dim', text: 'git version 2.54.0 (Apple Git-157)' },
  { at: 900, tone: 'head', text: '2/4 Bun' },
  { at: 1000, tone: 'dim', text: 'bun 1.4.4' },
  { at: 1200, tone: 'head', text: '3/4 Claude Code' },
  { at: 1300, tone: 'dim', text: 'claude 2.1.312 (Claude Code)' },
  { at: 1500, tone: 'head', text: '4/4 twin ที่ ~/my-twin' },
  { at: 2300, tone: 'dim', text: '13 packages installed [356.00ms]' },
  { at: 2700, tone: 'ask', text: 'ตั้งชื่อ agent ของคุณ (a-z, 0-9, -): ' },
  { at: 3600, tone: 'plain', text: '- profile/twin.json · nok · darwin' },
  { at: 3680, tone: 'plain', text: '- skill nok-mode → ~/my-twin/profile/mode' },
  { at: 3760, tone: 'plain', text: '- SessionStart hook ใน ~/.claude/settings.json · ตัวตนโหลดผ่าน ~/.claude/CLAUDE.md' },
  { at: 3840, tone: 'plain', text: '- แถบสถานะงาน (mods/twin) เปิดใน .claude/settings.local.json' },
  { at: 3920, tone: 'plain', text: '- ติดตั้ง twin-eb9048ce.sync · sync ทุก 10 นาที' },
  { at: 4000, tone: 'plain', text: '- ติดตั้ง twin-eb9048ce.daily · daily 08:30' },
  { at: 4150, tone: 'dim', text: 'notes: ok · onboard: ok · audit: ok · update: ok' },
  { at: 4900, tone: 'done', text: 'พร้อมแล้ว: เปิด Claude Desktop แท็บ Code แล้วเลือกโฟลเดอร์ ~/my-twin แล้วพิมพ์ onboard ให้ nok รู้จักคุณ' },
];

const COPY = {
  en: { label: 'A real run of the twin installer', replay: 'Replay', caption: 'Output from a real install, shortened. The installer speaks Thai for now.' },
  th: { label: 'ผลจากการรันตัวติดตั้ง twin จริง', replay: 'เล่นอีกครั้ง', caption: 'ข้อความจากการติดตั้งจริง ตัดให้สั้นลง' },
} as const;

export function InstallReplay({ lang }: { lang: keyof typeof COPY }) {
  const t = COPY[lang];
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setRun((n) => (n === 0 ? 1 : n));
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} lang="th" className="not-prose install-replay" data-playing={run > 0 || undefined}>
      <div className="install-replay-frame">
        <TermWindow key={run} title="Terminal" label={t.label}>
          {LINES.map((l) => (
            <div key={l.text} className={`term-step install-line install-${l.tone}`} style={{ '--at': `${l.at}ms` } as CSSProperties}>
              {l.tone === 'cmd' && <span className="term-dim">$ </span>}
              {l.text}
              {l.tone === 'ask' && <span className="term-accent">nok</span>}
            </div>
          ))}
        </TermWindow>
        <button type="button" lang={lang} className="install-replay-button" onClick={() => setRun((n) => n + 1)}>
          {t.replay}
        </button>
      </div>
      <p lang={lang} className="install-replay-caption">
        {t.caption}
      </p>
    </div>
  );
}
