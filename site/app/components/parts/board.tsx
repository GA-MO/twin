import { toneClass, type BandCard } from './band';

export type BoardCard = BandCard & { detail?: string };

export type BoardAgent = { description: string; status: string; role: string; isRunning: boolean };

export type BoardRun = { slug: string; project: string; age: string; doing: string; agentsLine: string; agents: BoardAgent[]; more: string };

export type BoardLine = { slug: string; detail: string; age: string };

export type Board = { title: string; summary: string; decide: BoardCard[]; elsewhere: BoardCard[]; moving: BoardRun[]; footer: string; rest: BoardLine[] };

function Pulse({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle className="board-pulse" cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />;
}

function Pip() {
  return (
    <svg className="board-pip" width="16" height="16" viewBox="0 0 16 16">
      <Pulse cx={8} cy={8} r={3.5} />
      <circle cx="8" cy="8" r="3.5" fill="currentColor" />
    </svg>
  );
}

function Branch({ isLast, isRunning }: { isLast: boolean; isRunning: boolean }) {
  return (
    <svg className={isRunning ? 'board-branch is-live' : 'board-branch'} width="24" height="44" viewBox="0 0 24 44">
      <path d={`M7 0V${isLast ? 22 : 44}M7 22H14`} className="board-guide" fill="none" strokeWidth="1.4" strokeLinecap="round" />
      {isRunning && <Pulse cx={18} cy={22} r={3.2} />}
      <circle cx="18" cy="22" r="3.2" fill="currentColor" />
    </svg>
  );
}

function CardBox({ card, isElsewhere = false }: { card: BoardCard; isElsewhere?: boolean }) {
  return (
    <div className={`board-card ${toneClass[card.tone]}${isElsewhere ? ' is-elsewhere' : ''}`}>
      <div className="board-head">
        <span className="board-kind">{card.label}</span>
        <span className="board-meta">{card.meta}</span>
      </div>
      <p className="board-ask">{card.ask}</p>
      {card.detail && <p className="board-detail">{card.detail}</p>}
      <div className="term-buttons">
        {card.buttons.map((b, i) => (
          <span key={b} className={i === 0 ? 'term-btn term-btn-primary' : 'term-btn'}>
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

function Moving({ run }: { run: BoardRun }) {
  return (
    <div className="board-card board-moving">
      <div className="board-head">
        <span className="board-run">
          <Pip />
          <span className="board-slug">{run.slug}</span>
          <span className="board-meta">{run.project}</span>
        </span>
        <span className="board-meta board-age">{run.age}</span>
      </div>
      <p className="board-detail board-truncate">{run.doing}</p>
      <p className="board-meta">{run.agentsLine}</p>
      <div>
        {run.agents.map((a, i) => (
          <div key={a.description} className={a.isRunning ? 'board-agent is-live' : 'board-agent'}>
            <Branch isLast={i === run.agents.length - 1} isRunning={a.isRunning} />
            <span className="board-agent-text">
              <span className="board-agent-task">{a.description}</span>
              <span className="board-meta board-truncate">{a.status}</span>
            </span>
            <span className="board-meta">{a.role}</span>
          </div>
        ))}
      </div>
      <div className="term-buttons">
        <span className="term-btn">{run.more}</span>
      </div>
    </div>
  );
}

export function DeskBoard({ board, name }: { board: Board; name: string }) {
  return (
    <div className="board-pane">
      <div className="board-bar">
        <span>{name}</span>
        <span className="board-icons">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M7 1.5h3.5V5M10.5 1.5 7 5M5 10.5H1.5V7M1.5 10.5 5 7" />
          </svg>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="m2 2 8 8M10 2l-8 8" />
          </svg>
        </span>
      </div>
      <div className="term band-desk board">
        <div>
          <p className="board-title">{board.title}</p>
          <p className="board-detail">{board.summary}</p>
        </div>
        <div className="board-stack">
          {board.decide.map((card) => (
            <CardBox key={card.ask} card={card} />
          ))}
        </div>
        <div className="board-stack">
          <p className="board-section">Waiting in other sessions</p>
          {board.elsewhere.map((card) => (
            <CardBox key={card.ask} card={card} isElsewhere />
          ))}
        </div>
        <div className="board-stack">
          <p className="board-section">In progress</p>
          {board.moving.map((run) => (
            <Moving key={run.slug} run={run} />
          ))}
        </div>
        <div>
          <div className="board-head board-footer">
            <span className="board-meta">{board.footer}</span>
            <span className="term-btn">Hide</span>
          </div>
          {board.rest.map((line) => (
            <div key={line.slug} className="board-head board-line">
              <span className="board-run">
                <span className="band-ship">✓</span>
                <span className="board-slug">{line.slug}</span>
                <span className="board-meta board-truncate">{line.detail}</span>
              </span>
              <span className="board-meta board-age">{line.age}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
