import type { EngineInterface } from 'claude-code'

import type { Lane, ReportSummary, Run, Snapshot, Subagent } from '../types'

export const MAX_BARS = 2
const SHOWN_AGENTS = 3
const QUIET_MS = 10 * 60_000
const SENT_FOR_MS = 10 * 60_000

export type Ui = ReturnType<EngineInterface['ui']['resolve']>

export type Kind = 'approve' | 'question' | 'ship' | 'stuck'

export const KINDS: Record<Kind, { label: string; color: `#${string}` }> = {
  approve: { label: 'Approval', color: '#4FB3FF' },
  question: { label: 'Question', color: '#A78BFA' },
  ship: { label: 'Ready to ship', color: '#3DB37A' },
  stuck: { label: 'Needs attention', color: '#EF6461' },
}

export const DOT = { live: '#3DB37A', quiet: '#E6A23C', idle: '#8F8D88' } as const

export const COPY = {
  empty: 'Nothing open',
  elsewhere: 'Waiting in other sessions',
  moving: 'In progress',
  show: 'Show',
  hide: 'Hide',
  open: 'Open',
  hideReport: 'Hide report',
  noReport: 'No report yet: the worker has not finished a turn.',
}

export type Action = { label: string; text: string; isPrimary?: boolean; isReport?: boolean; isFill?: boolean }

export type Card = { run: Run; key: string; label: string; color: string; ask: string; detail: string; meta: string; actions: Action[] }

export type Fact = { text: string; isStrong: boolean }

export type Band = { cards: Card[]; facts: Fact[]; isLive: boolean }

export type AgentRow = { id: string; description: string; status: string; role: string; isRunning: boolean }

export type Progress = { run: Run; isQuiet: boolean; age: string; doing: string; agentsLine: string; agents: AgentRow[]; more: string | null }

export type Line = { run: Run; detail: string; age: string }

export type Board = { title: string; summary: string; decide: Card[]; elsewhere: Card[]; moving: Progress[]; footer: string; rest: Line[] }

export type ReportRow = { key: keyof ReportSummary; label: string; lines: string[] }

export type Sent = { label: string; at: number; turn: number; status: Run['status'] }

export type Ctl = {
  act: (text: string) => void
  fill: (text: string) => void
  sent: Readonly<Record<string, Sent>>
  markSent: (run: Run, label: string) => void
  expanded: readonly string[]
  toggle: (id: string) => void
  showTheirs: boolean
  setShowTheirs: (v: boolean) => void
  name: string
}

export function since(ms: number, now: number) {
  const minutes = Math.round((now - ms) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

export const ago = (ms: number, now: number) => (since(ms, now) === 'now' ? 'just now' : `${since(ms, now)} ago`)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const isQuiet = (run: Run, now: number) => run.status === 'running' && now - run.activeAt >= QUIET_MS

function lane(run: Run): Lane {
  if (run.status === 'running') return 'running'
  if (run.status === 'crashed' || run.outcome !== 'done') return 'you'
  return run.commits > 0 && !run.pushed ? 'ship' : 'done'
}

function split(runs: Run[]) {
  const of = (l: Lane) => runs.filter(r => lane(r) === l)
  return { decide: [...of('you'), ...of('ship')], moving: of('running'), done: of('done') }
}

function kindOf(run: Run): Kind {
  if (run.status === 'crashed' || run.outcome === 'blocked' || run.outcome === null) return 'stuck'
  if (run.outcome === 'needs-approval') return 'approve'
  if (run.outcome === 'needs-input') return 'question'
  return 'ship'
}

function ask(run: Run, kind: Kind) {
  if (run.status === 'crashed') return `${run.slug} stopped mid-run`
  if (run.outcome === 'blocked') return `${run.slug} is blocked`
  if (kind === 'approve') return `Approve ${run.gates.join(' and ')} for ${run.slug}`
  if (kind === 'question') return run.doing || `${run.slug} has a question`
  if (kind === 'ship') return `${run.slug} is ready to ship`
  return run.doing || `${run.slug} finished without a readable report`
}

const REPORT: Action = { label: 'Report', text: '', isReport: true }

function actions(run: Run, kind: Kind): Action[] {
  const gates = run.gates.join(', ')
  if (kind === 'approve') return [{ label: `Approve ${gates}`, text: `ok ${gates} ${run.id}`, isPrimary: true }, REPORT]
  if (kind === 'question') return [{ label: 'Answer', text: `Answer for ${run.id}: `, isPrimary: true, isFill: true }, REPORT]
  if (kind === 'ship') return [{ label: 'Ship UAT', text: `ship uat ${run.id}`, isPrimary: true }, { label: 'Close', text: `Close ${run.id}` }]
  return [{ ...REPORT, isPrimary: true }]
}

function hereActions(run: Run, kind: Kind): Action[] {
  const gates = run.gates.join(', ')
  const take =
    kind === 'approve'
      ? { label: `Approve ${gates} here`, text: `Take ${run.id} into this session and approve ${gates}`, isPrimary: true }
      : kind === 'question'
        ? { label: 'Answer here', text: `Take ${run.id} into this session and answer: `, isPrimary: true, isFill: true }
        : { label: 'Take here', text: `Take ${run.id} into this session`, isPrimary: true }
  return [take, REPORT]
}

function whereLabel(run: Run) {
  const o = run.ownerSession
  if (!o) return 'another session'
  if (o.state === 'closed') return 'a closed session'
  return `‘${o.name}’ in ${o.where === 'desktop' ? 'Claude Desktop' : 'a terminal'}${o.status === 'busy' ? ', busy' : ''}`
}

function card(run: Run, now: number, isElsewhere = false): Card {
  const kind = kindOf(run)
  const question = ask(run, kind)
  return {
    run,
    key: run.id,
    label: KINDS[kind].label,
    color: KINDS[kind].color,
    ask: question,
    detail: isElsewhere ? `Waiting in ${whereLabel(run)}` : run.doing === question ? '' : run.doing,
    meta: `${run.project} · ${ago(run.activeAt, now)}`,
    actions: isElsewhere ? hereActions(run, kind) : actions(run, kind),
  }
}

const count = (n: number, text: string, isStrong = false): Fact[] => (n > 0 ? [{ text: `${n} ${text}`, isStrong }] : [])

export function band(snap: Snapshot | null, now: number): Band | null {
  if (!snap) return null
  const { decide, moving } = split(snap.runs)
  const elsewhere = split(snap.theirs).decide
  if (decide.length + moving.length + elsewhere.length === 0) return null
  return {
    cards: decide.slice(0, MAX_BARS).map(r => card(r, now)),
    facts: [...count(decide.length, 'waiting on you', true), ...count(moving.length, 'in progress'), ...count(elsewhere.length, 'waiting in other sessions')],
    isLive: moving.length > 0,
  }
}

const ROLES: [RegExp, string][] = [
  [/review|thermo|interrogate/i, 'reviewer'],
  [/explore|search|how|why/i, 'explorer'],
  [/plan|architect/i, 'planner'],
  [/poteto|general|effort|builder|code/i, 'builder'],
]

const role = (type: string) => ROLES.find(([re]) => re.test(type))?.[1] ?? type.replace(/^.*:/, '').replace(/-agent$/, '')

const agentRow = (a: Subagent, now: number): AgentRow => ({
  id: a.id,
  description: a.description,
  status: a.isRunning ? a.doing || 'working' : `done ${ago(a.activeAt, now)}`,
  role: role(a.type),
  isRunning: a.isRunning,
})

function progress(run: Run, now: number, isOpen: boolean): Progress {
  const quiet = isQuiet(run, now)
  const live = run.agents.filter(a => a.isRunning)
  const shown = isOpen ? [...live, ...run.agents.filter(a => !a.isRunning)] : live.slice(0, SHOWN_AGENTS)
  const n = run.agents.length
  return {
    run,
    isQuiet: quiet,
    age: quiet ? `quiet for ${since(run.activeAt, now)}` : ago(run.activeAt, now),
    doing: run.doing,
    agentsLine: n === 0 ? '' : live.length > 0 ? `${live.length} of ${plural(n, 'agent')} working` : `${plural(n, 'agent')} done`,
    agents: shown.map(a => agentRow(a, now)),
    more: n > shown.length || (isOpen && n > 0) ? (isOpen ? 'Show less' : `Show all ${plural(n, 'agent')}`) : null,
  }
}

export function board(snap: Snapshot | null, now: number, expanded: readonly string[]): Board | null {
  if (!snap || snap.runs.length + snap.theirs.length === 0) return null
  const { decide, moving, done } = split(snap.runs)
  const elsewhere = split(snap.theirs).decide
  const quietTheirs = snap.theirs.filter(r => !elsewhere.includes(r))
  const live = moving.flatMap(r => r.agents).filter(a => a.isRunning).length
  return {
    title: decide.length > 0 ? `${decide.length} waiting on you` : 'Nothing waiting on you',
    summary: moving.length > 0 ? `${moving.length} in progress${live > 0 ? ` · ${plural(live, 'agent')} working` : ''}` : snap.runs.length > 0 ? 'All workers idle' : 'No runs from this session yet',
    decide: decide.map(r => card(r, now)),
    elsewhere: elsewhere.map(r => card(r, now, true)),
    moving: moving.map(r => progress(r, now, expanded.includes(r.id))),
    footer: [...count(done.length, 'done'), ...count(quietTheirs.length, 'in other sessions')].map(f => f.text).join(' · '),
    rest: [...done, ...quietTheirs].map(r => ({ run: r, detail: r.doing || r.project, age: ago(r.activeAt, now) })),
  }
}

const REPORT_ROWS: { key: keyof ReportSummary; label: string }[] = [
  { key: 'question', label: 'Question' },
  { key: 'did', label: 'Done' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'discovered', label: 'Found' },
  { key: 'commits', label: 'Commits' },
  { key: 'ideas', label: 'Ideas' },
]

export function reportRows(report: ReportSummary | null | undefined): ReportRow[] | null {
  if (!report) return null
  return REPORT_ROWS.map(r => {
    const value = report[r.key]
    const lines = Array.isArray(value) ? value.slice(0, 6) : value && value.trim() !== '' && value.trim() !== '-' ? [value] : []
    return { ...r, lines }
  }).filter(r => r.lines.length > 0)
}

export const reportKey = (id: string) => `report:${id}`

export const isReportOpen = (ctl: Ctl, run: Run) => ctl.expanded.includes(reportKey(run.id))

export const buttonLabel = (ctl: Ctl, run: Run, b: Action) => (b.isReport && isReportOpen(ctl, run) ? COPY.hideReport : b.label)

export function sentNote(run: Run, ctl: Ctl, now: number): string | null {
  const s = ctl.sent[run.id]
  return s && s.turn === run.turn && s.status === run.status && now - s.at < SENT_FOR_MS ? `Sent: ${s.label}. Waiting for ${ctl.name}` : null
}

export function press(ctl: Ctl, run: Run, b: Action) {
  if (b.isReport) return ctl.toggle(reportKey(run.id))
  if (b.isFill) return ctl.fill(b.text)
  ctl.markSent(run, b.label)
  ctl.act(b.text)
}

export const isBusy = (snap: Snapshot | null) => (snap?.runs ?? []).some(r => r.status === 'running')
