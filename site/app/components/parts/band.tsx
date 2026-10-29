type BandTone = 'approve' | 'question' | 'ship' | 'stuck';

export type BandCard = { tone: BandTone; label: string; ask: string; meta: string; buttons: string[] };

const toneClass: Record<BandTone, string> = { approve: 'band-approve', question: 'band-question', ship: 'band-ship', stuck: 'band-stuck' };

function Facts({ facts }: { facts: string[] }) {
  return (
    <span className="term-dim">
      <span className="term-fg">{facts[0]}</span>
      {facts.slice(1).map((s) => ` · ${s}`)}
    </span>
  );
}

export function DeskBand({ cards, name, facts, open }: { cards: BandCard[]; name: string; facts: string[]; open?: string }) {
  return (
    <>
      <div className="term-card" aria-hidden>
        {cards.map((card, i) => (
          <div key={card.ask} className={i > 0 ? 'band-card band-rule' : 'band-card'}>
            <div className="term-card-row">
              <span className={`term-kind ${toneClass[card.tone]}`}>{card.label}</span>
              <span className="term-dim">{card.meta}</span>
            </div>
            <div className="band-ask">
              <span className="term-strong">{card.ask}</span>
              <span className="term-buttons">
                {card.buttons.map((b, j) => (
                  <span key={b} className={j === 0 ? 'term-btn term-btn-primary' : 'term-btn'}>
                    {b}
                  </span>
                ))}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="term-frame" aria-hidden>
        <span>
          <span className="term-live" />
          {` ${name}`}
        </span>
        {open ? (
          <span className="band-facts">
            <Facts facts={facts} />
            <span className="term-btn">{open}</span>
          </span>
        ) : (
          <Facts facts={facts} />
        )}
      </div>
    </>
  );
}

export function TermBand({ cards, name, facts }: { cards: BandCard[]; name: string; facts: string[] }) {
  return (
    <>
      <div className="term-card term-card-tight">
        {cards.map((card, i) => (
          <div key={card.ask} className={i > 0 ? 'term-card-line term-card-rule' : 'term-card-line'}>
            <span className={`term-kind ${toneClass[card.tone]}`}>{card.label}</span>
            <span className="term-ask">
              <span className="term-strong">{card.ask}</span>
              <span className="term-dim">
                {'  '}
                {card.meta}
              </span>
            </span>
            <span className="term-tbtns">
              {card.buttons.map((b, j) => (
                <span key={b} className={j === 0 ? 'term-tbtn-primary' : undefined}>
                  [ {b} ]
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="term-frame">
        <span>
          <span className="term-live" /> <span className="term-strong">{name}</span>
        </span>
        <Facts facts={facts} />
      </div>
    </>
  );
}
