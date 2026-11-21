import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { TermWindow } from '@/components/parts/term';

type Tone = 'cmd' | 'head' | 'dim' | 'plain' | 'ask' | 'done';
type Line = { at: number; tone: Tone; text: string; typed?: string };
type Lang = 'en' | 'th';
type Script = { label: string; caption: string; lines: Line[] };

const INSTALL_CMD: Line = { at: 0, tone: 'cmd', text: 'curl -fsSL https://ga-mo.github.io/twin/install.sh | sh' };
const TOOLS: Line[] = [
  { at: 550, tone: 'head', text: '1/4 git' },
  { at: 680, tone: 'dim', text: 'git version 2.54.0 (Apple Git-157)' },
  { at: 900, tone: 'head', text: '2/4 Bun' },
  { at: 1000, tone: 'dim', text: 'bun 1.4.4' },
  { at: 1200, tone: 'head', text: '3/4 Claude Code' },
  { at: 1300, tone: 'dim', text: 'claude 2.1.312 (Claude Code)' },
];
const UPDATE_CMD: Line = { at: 0, tone: 'cmd', text: 'bun twin.ts update' };
const SUBJECTS: Line[] = [
  { at: 1000, tone: 'dim', text: "  install, setup, update and uninstall speak the computer's language…" },
  { at: 1080, tone: 'dim', text: '  site: install step 2 replays the output of a real install…' },
  { at: 1160, tone: 'dim', text: '  audit: a section and audit steps count whether workers list…' },
];

const SCRIPTS: Record<'install' | 'update', Record<Lang, Script>> = {
  install: {
    en: {
      label: 'A real run of the twin installer',
      caption: 'Output from a real install, shortened.',
      lines: [
        INSTALL_CMD,
        ...TOOLS,
        { at: 1500, tone: 'head', text: '4/4 twin in ~/my-twin' },
        { at: 2300, tone: 'dim', text: '13 packages installed [321.00ms]' },
        { at: 2700, tone: 'ask', text: 'Name your agent (a-z, 0-9, -): ', typed: 'nok' },
        { at: 3600, tone: 'plain', text: '- profile/twin.json · nok · darwin' },
        { at: 3680, tone: 'plain', text: '- skill nok-mode → ~/my-twin/profile/mode' },
        { at: 3760, tone: 'plain', text: '- SessionStart hook in ~/.claude/settings.json · identity loads through ~/.claude/CLAUDE.md' },
        { at: 3840, tone: 'plain', text: '- status band (mods/twin) on in .claude/settings.local.json' },
        { at: 3920, tone: 'plain', text: '- installed twin-5c6b1681.sync · sync every 10 minutes' },
        { at: 4000, tone: 'plain', text: '- installed twin-5c6b1681.daily · daily 08:30' },
        { at: 4150, tone: 'dim', text: 'notes: ok · onboard: ok · audit: ok · update: ok' },
        { at: 4900, tone: 'done', text: 'Ready: open the Code tab in Claude Desktop, pick the folder ~/my-twin, then type onboard so nok gets to know you' },
      ],
    },
    th: {
      label: 'ผลจากการรันตัวติดตั้ง twin จริง',
      caption: 'ข้อความจากการติดตั้งจริง ตัดให้สั้นลง',
      lines: [
        INSTALL_CMD,
        ...TOOLS,
        { at: 1500, tone: 'head', text: '4/4 twin ที่ ~/my-twin' },
        { at: 2300, tone: 'dim', text: '13 packages installed [356.00ms]' },
        { at: 2700, tone: 'ask', text: 'ตั้งชื่อ agent ของคุณ (a-z, 0-9, -): ', typed: 'nok' },
        { at: 3600, tone: 'plain', text: '- profile/twin.json · nok · darwin' },
        { at: 3680, tone: 'plain', text: '- skill nok-mode → ~/my-twin/profile/mode' },
        { at: 3760, tone: 'plain', text: '- SessionStart hook ใน ~/.claude/settings.json · ตัวตนโหลดผ่าน ~/.claude/CLAUDE.md' },
        { at: 3840, tone: 'plain', text: '- แถบสถานะงาน (mods/twin) เปิดใน .claude/settings.local.json' },
        { at: 3920, tone: 'plain', text: '- ติดตั้ง twin-eb9048ce.sync · sync ทุก 10 นาที' },
        { at: 4000, tone: 'plain', text: '- ติดตั้ง twin-eb9048ce.daily · daily 08:30' },
        { at: 4150, tone: 'dim', text: 'notes: ok · onboard: ok · audit: ok · update: ok' },
        { at: 4900, tone: 'done', text: 'พร้อมแล้ว: เปิด Claude Desktop แท็บ Code แล้วเลือกโฟลเดอร์ ~/my-twin แล้วพิมพ์ onboard ให้ nok รู้จักคุณ' },
      ],
    },
  },
  update: {
    en: {
      label: 'A real run of twin update',
      caption: 'Output from a real update, shortened.',
      lines: [
        UPDATE_CMD,
        { at: 800, tone: 'head', text: '- updated from origin/main: dd182e7 → 01f00e6 · 3 changes' },
        ...SUBJECTS,
        { at: 2000, tone: 'head', text: '- set up again:' },
        { at: 2100, tone: 'plain', text: '  profile/twin.json · nok · darwin' },
        { at: 2180, tone: 'plain', text: '  SessionStart hook in ~/.claude/settings.json · identity loads through ~/.claude/CLAUDE.md' },
        { at: 2260, tone: 'plain', text: '  status band (mods/twin) on in .claude/settings.local.json' },
        { at: 2340, tone: 'plain', text: '  installed twin-5c6b1681.sync · sync every 10 minutes' },
      ],
    },
    th: {
      label: 'ผลจากการรัน twin update จริง',
      caption: 'ข้อความจากการอัปเดตจริง ตัดให้สั้นลง',
      lines: [
        UPDATE_CMD,
        { at: 800, tone: 'head', text: '- อัปเดตจาก origin/main: dd182e7 → 01f00e6 · 3 เรื่อง' },
        ...SUBJECTS,
        { at: 2000, tone: 'head', text: '- ตั้งค่าซ้ำแล้ว:' },
        { at: 2100, tone: 'plain', text: '  profile/twin.json · nok · darwin' },
        { at: 2180, tone: 'plain', text: '  SessionStart hook ใน ~/.claude/settings.json · ตัวตนโหลดผ่าน ~/.claude/CLAUDE.md' },
        { at: 2260, tone: 'plain', text: '  แถบสถานะงาน (mods/twin) เปิดใน .claude/settings.local.json' },
        { at: 2340, tone: 'plain', text: '  ติดตั้ง twin-eb9048ce.sync · sync ทุก 10 นาที' },
      ],
    },
  },
};

const REPLAY: Record<Lang, string> = { en: 'Replay', th: 'เล่นอีกครั้ง' };

export function Replay({ of, lang }: { of: keyof typeof SCRIPTS; lang: Lang }) {
  const script = SCRIPTS[of][lang];
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
    <div ref={ref} lang="th" className="not-prose replay" data-playing={run > 0 || undefined}>
      <div className="replay-frame">
        <TermWindow key={run} title="Terminal" label={script.label}>
          {script.lines.map((l) => (
            <div key={l.text} className={`term-step replay-line replay-${l.tone}`} style={{ '--at': `${l.at}ms` } as CSSProperties}>
              {l.tone === 'cmd' && <span className="term-dim">$ </span>}
              {l.text}
              {l.typed && <span className="term-accent">{l.typed}</span>}
            </div>
          ))}
        </TermWindow>
        <button type="button" lang={lang} className="replay-button" onClick={() => setRun((n) => n + 1)}>
          {REPLAY[lang]}
        </button>
      </div>
      <p lang={lang} className="replay-caption">
        {script.caption}
      </p>
    </div>
  );
}
