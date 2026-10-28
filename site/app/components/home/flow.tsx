import { LANES, type FlowNode, type HomeCopy, type Lane } from './copy';

const W = 1240;
const LABEL = 120;
const HEAD = 48;
const ROW = 78;
const NODE_W = 166;
const NODE_H = 50;
const H = HEAD + ROW * LANES.length;

function layout(cols: number) {
  const colW = (W - LABEL) / cols;
  const center = (n: FlowNode) => ({ x: LABEL + colW * n.col + colW / 2, y: HEAD + ROW * LANES.indexOf(n.lane) + ROW / 2 });
  const edge = (a: FlowNode, b: FlowNode) => {
    const p = center(a);
    const q = center(b);
    if (a.col === b.col) {
      const down = q.y > p.y;
      return `M${p.x} ${p.y + (down ? NODE_H / 2 : -NODE_H / 2)}V${q.y + (down ? -NODE_H / 2 : NODE_H / 2)}`;
    }
    const x1 = p.x + NODE_W / 2;
    const x2 = q.x - NODE_W / 2;
    const mid = (x1 + x2) / 2;
    return `M${x1} ${p.y}C${mid} ${p.y} ${mid} ${q.y} ${x2} ${q.y}`;
  };
  return { colW, center, edge };
}

const count = (nodes: FlowNode[], lane: Lane) => nodes.filter((n) => n.lane === lane).length;

export function Flow({ c }: { c: HomeCopy['flow'] }) {
  const { colW, center, edge } = layout(c.phases.length);
  const byId = Object.fromEntries(c.nodes.map((n) => [n.id, n]));
  const paths = c.edges.map(([from, to]) => edge(byId[from]!, byId[to]!));
  return (
    <figure className="home-flow" role="img" aria-label={c.label}>
      <div className="home-flow-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="home-flow-svg" aria-hidden>
          <defs>
            <linearGradient id="flow-rainbow" x1="0" x2={W} y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff5f6d" />
              <stop offset="0.2" stopColor="#ffb347" />
              <stop offset="0.4" stopColor="#54d68a" />
              <stop offset="0.6" stopColor="#4fb3ff" />
              <stop offset="0.8" stopColor="#8a6cff" />
              <stop offset="1" stopColor="#e66bd6" />
            </linearGradient>
          </defs>
          {c.phases.map((phase, i) => (
            <g key={phase}>
              {i > 0 && <line x1={LABEL + colW * i} x2={LABEL + colW * i} y1={8} y2={H} className="home-flow-col" />}
              <text x={LABEL + colW * i + colW / 2} y={28} textAnchor="middle" className="home-flow-phase">
                <tspan className="home-flow-phase-n">{String(i + 1).padStart(2, '0')}</tspan> {phase}
              </text>
            </g>
          ))}
          {LANES.map((lane, i) => (
            <g key={lane}>
              <line x1={0} x2={W} y1={HEAD + ROW * i} y2={HEAD + ROW * i} className="home-flow-lane" />
              <text x={12} y={HEAD + ROW * i + ROW / 2} dominantBaseline="middle" className={`home-flow-lane-name ${lane === 'twin' ? 'is-twin' : ''}`}>
                {c.lanes[lane]}
              </text>
            </g>
          ))}
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="home-flow-lane" />
          {paths.map((d) => (
            <path key={d} d={d} className="home-flow-edge" />
          ))}
          <path d={paths.map((d, i) => (i > 0 ? d.replace(/^M/, 'L') : d)).join(' ')} className="home-flow-pulse" pathLength={1000} />
          {c.nodes.map((n) => {
            const { x, y } = center(n);
            return (
              <g key={n.id} className={`home-flow-node lane-${n.lane}`}>
                <rect x={x - NODE_W / 2} y={y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={9} />
                <text x={x} y={y - 5} textAnchor="middle" className="home-flow-title">
                  {n.title}
                </text>
                <text x={x} y={y + 13} textAnchor="middle" className="home-flow-detail">
                  {n.detail}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="home-flow-tally">
        <span className="home-flow-tally-you">{c.tally.of(count(c.nodes, 'you'), c.nodes.length)}</span>
        <span className="home-flow-tally-lanes">
          {LANES.filter((lane) => lane !== 'you').map((lane) => (
            <span key={lane}>
              {c.lanes[lane]} <b>{count(c.nodes, lane)}</b>
            </span>
          ))}
        </span>
        <span className="home-flow-tally-note">{c.tally.note}</span>
      </figcaption>
    </figure>
  );
}
