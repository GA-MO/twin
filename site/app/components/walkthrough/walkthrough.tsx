import type { Locale } from '@/lib/i18n';
import { walk } from './data.generated';
import type { Actor, Chat, Event, How } from './types';

const scenes = walk.scenes;

const copy: Record<Locale, { actors: Record<Actor, string>; how: Record<How, string>; howHint: Record<How, string>; more: string; less: string; why: string; behind: string; full: string; legend: string }> = {
  en: {
    actors: { you: 'You', twin: 'nok', engine: 'engine', worker: 'worker', scheduler: 'scheduler' },
    how: { enforced: 'enforced', model: 'model decides' },
    howHint: { enforced: 'Code runs it every time: a hook, the engine or the scheduler. It does not mean it blocks the work.', model: 'The model chooses to do it. It can be skipped or done wrong.' },
    more: 'Details',
    less: 'Show less',
    why: 'Why',
    behind: 'Behind the scenes',
    full: 'Full message',
    legend: 'Every step says who did it, and whether it is enforced or the model decided.',
  },
  th: {
    actors: { you: 'คุณ', twin: 'nok', engine: 'engine', worker: 'worker', scheduler: 'scheduler' },
    how: { enforced: 'บังคับ', model: 'model ตัดสินเอง' },
    howHint: { enforced: 'โค้ดรันทุกครั้ง (hook, engine หรือ scheduler) ไม่ได้แปลว่ากันงานได้', model: 'model เลือกทำเอง อาจข้ามหรือทำผิดได้' },
    more: 'ดูรายละเอียด',
    less: 'ย่อ',
    why: 'ทำไม',
    behind: 'เบื้องหลัง',
    full: 'ข้อความเต็ม',
    legend: 'ทุกขั้นบอกว่าใครทำ และเป็นขั้นที่บังคับ หรือ model ตัดสินเอง',
  },
};

const CHAT_LINES = 4;

function Inline({ text }: { text: string }) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
      <code key={i} className="chip-code">
        {part.slice(1, -1)}
      </code>
    ) : part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <b key={i}>{part.slice(2, -2)}</b>
    ) : (
      part
    ),
  );
}

function ChatBubble({ chat, lang }: { chat: Chat; lang: Locale }) {
  const t = copy[lang];
  const lines = chat.text.split('\n');
  const short = lines.length <= CHAT_LINES;
  const gloss = lang === 'en' && chat.gloss ? <span className="wt-gloss">{chat.gloss}</span> : null;
  return (
    <div className={`wt-msg is-${chat.from}`}>
      <div className="wt-msg-head">
        <span>{t.actors[chat.from]}</span>
        <time>{chat.at}</time>
      </div>
      <p className="wt-msg-text">
        <Inline text={short ? chat.text : lines.slice(0, CHAT_LINES).join('\n')} />
      </p>
      {gloss}
      {!short && (
        <details className="wt-more">
          <summary>
            <span className="wt-more-label" data-open={t.less}>
              {t.full}
            </span>
          </summary>
          <p className="wt-msg-text">
            <Inline text={lines.slice(CHAT_LINES).join('\n')} />
          </p>
        </details>
      )}
    </div>
  );
}

function Step({ event, lang }: { event: Event; lang: Locale }) {
  const t = copy[lang];
  return (
    <li className={`wt-step is-${event.actor}`}>
      <span className={`wt-node is-${event.how}`} aria-hidden />
      <details className={`wt-card is-${event.how}`}>
        <summary>
          <span className="wt-meta">
            <time>{event.at}</time>
            <span className="wt-actor">{t.actors[event.actor]}</span>
            <span className={`wt-how is-${event.how}`} title={t.howHint[event.how]}>
              {t.how[event.how]}
            </span>
          </span>
          <span className="wt-title">{event.title[lang]}</span>
          <span className="wt-gist">{event.gist[lang]}</span>
          <span className="wt-via">{event.via}</span>
          <span className="wt-more-label" aria-label={t.more} />
        </summary>
        <div className="wt-body">
          <p className="wt-why">
            <b>{t.why}</b> {event.why[lang]}
          </p>
          {event.blocks.filter((b) => !b.only || b.only === lang).map((b) => (
            <div key={b.label.en} className="wt-block">
              <div className="wt-block-label">{b.label[lang]}</div>
              {b.code ? <pre className="wt-code">{b.body}</pre> : <p className="wt-text"><Inline text={b.body} /></p>}
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}

export function Walkthrough({ scene, lang }: { scene: string; lang: Locale }) {
  const s = scenes.find((x) => x.id === scene);
  if (!s) throw new Error(`walkthrough: no scene "${scene}" in data.generated.ts (${scenes.map((x) => x.id).join(', ')})`);
  const t = copy[lang];
  return (
    <div className="wt not-prose">
      {s.chat.length > 0 && (
        <div className="wt-chat">
          {s.chat.map((c) => (
            <ChatBubble key={c.at + c.from} chat={c} lang={lang} />
          ))}
        </div>
      )}
      {s.events.length > 0 && (
        <>
          <div className="wt-behind">{t.behind}</div>
          <ol className="wt-steps">
            {s.events.map((e) => (
              <Step key={e.at + e.title.en} event={e} lang={lang} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export function WalkthroughLegend({ lang }: { lang: Locale }) {
  const t = copy[lang];
  return (
    <div className="wt-legend not-prose">
      <span>{t.legend}</span>
      {(['enforced', 'model'] as const).map((h) => (
        <span key={h} className="wt-legend-item">
          <span className={`wt-how is-${h}`}>{t.how[h]}</span>
          {t.howHint[h]}
        </span>
      ))}
    </div>
  );
}
