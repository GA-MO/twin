import type { Color, EngineInterface } from 'claude-code'

import type { Lane, ReportSummary, Run } from '../types'

export const QUIET_MS = 10 * 60_000
export const MAX_SUBAGENTS = 5

export type Ui = ReturnType<EngineInterface['ui']['resolve']>
export type Stage = {
  lane: Lane
  icon: string
  color: Color
  label: string
  isBadge?: boolean
}

export const LANE_COLOR: Record<Lane, Color> = {
  you: 'warning',
  running: 'suggestion',
  ship: 'success',
  done: 'inactive',
}
export const LANE_ICON: Record<Lane, string> = {
  you: '◆',
  running: '●',
  ship: '✓',
  done: '✓',
}

export const LANES: { lane: Lane; title: string }[] = [
  { lane: 'you', title: 'needs you' },
  { lane: 'running', title: 'working' },
  { lane: 'ship', title: 'ready to ship' },
  { lane: 'done', title: 'done' },
]

export function stage(run: Run, now: number): Stage {
  if (run.status === 'running') {
    return now - run.activeAt >= QUIET_MS
      ? {
          lane: 'running',
          icon: '●',
          color: 'warning',
          label: `Quiet ${since(run.activeAt, now)}`,
        }
      : { lane: 'running', icon: '●', color: 'suggestion', label: 'Working' }
  }
  if (run.status === 'crashed')
    return {
      lane: 'you',
      icon: '✕',
      color: 'error',
      label: 'Worker stopped',
      isBadge: true,
    }
  switch (run.outcome) {
    case 'needs-approval':
      return {
        lane: 'you',
        icon: '◆',
        color: 'warning',
        label: `Approve ${run.gates.join(', ')}`,
        isBadge: true,
      }
    case 'needs-input':
      return {
        lane: 'you',
        icon: '◆',
        color: 'warning',
        label: 'Has a question',
        isBadge: true,
      }
    case 'blocked':
      return {
        lane: 'you',
        icon: '✕',
        color: 'error',
        label: 'Blocked',
        isBadge: true,
      }
    case 'done':
      return run.commits > 0 && !run.pushed
        ? { lane: 'ship', icon: '✓', color: 'success', label: 'Ready to ship' }
        : { lane: 'done', icon: '✓', color: 'inactive', label: 'Done' }
    case null:
      return run.answered
        ? {
            lane: 'you',
            icon: '◆',
            color: 'warning',
            label: 'Done, no report',
            isBadge: true,
          }
        : {
            lane: 'you',
            icon: '✕',
            color: 'error',
            label: 'Unreadable report',
            isBadge: true,
          }
  }
}

export function since(ms: number, now: number) {
  const minutes = Math.round((now - ms) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

export const ago = (ms: number, now: number) => (since(ms, now) === 'now' ? 'just now' : `${since(ms, now)} ago`)

const ROLES: [RegExp, string][] = [
  [/review|thermo|interrogate/i, 'reviewer'],
  [/explore|search|how|why/i, 'explorer'],
  [/plan|architect/i, 'planner'],
  [/poteto|general|effort|builder|code/i, 'builder'],
]

export const role = (type: string) => ROLES.find(([re]) => re.test(type))?.[1] ?? type.replace(/^.*:/, '').replace(/-agent$/, '')

export function lanes(runs: Run[], now: number) {
  return LANES.map(l => ({
    ...l,
    runs: runs.filter(r => stage(r, now).lane === l.lane),
  }))
}

export type Kind = 'approve' | 'question' | 'ship' | 'stuck'

export const KIND_LABEL: Record<Kind, string> = { approve: 'Approval', question: 'Question', ship: 'Ready to ship', stuck: 'Needs attention' }

export type Action = { label: string; text: string; isPrimary?: boolean; isReport?: boolean; isFill?: boolean }

export const isQuiet = (s: Stage) => s.lane === 'running' && s.color === 'warning'

export const reportKey = (id: string) => `report:${id}`

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

export const REPORT_ROWS: { key: keyof ReportSummary; label: string }[] = [
  { key: 'question', label: 'Question' },
  { key: 'did', label: 'Done' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'discovered', label: 'Found' },
  { key: 'commits', label: 'Commits' },
  { key: 'ideas', label: 'Ideas' },
]

export function kindOf(run: Run, s: Stage): Kind {
  if (run.status === 'crashed' || run.outcome === 'blocked' || (run.outcome === null && !run.answered)) return 'stuck'
  if (run.outcome === 'needs-approval') return 'approve'
  if (s.lane === 'ship') return 'ship'
  return 'question'
}

export function ask(run: Run, s: Stage) {
  if (run.status === 'crashed') return `${run.slug} stopped mid-run`
  if (run.outcome === 'needs-approval') return `Approve ${run.gates.join(' and ')} for ${run.slug}`
  if (run.outcome === 'needs-input') return run.doing || `${run.slug} has a question`
  if (run.outcome === 'blocked') return `${run.slug} is blocked`
  if (s.lane === 'ship') return `${run.slug} is ready to ship`
  return run.doing || `${run.slug} finished without a readable report`
}

export function context(run: Run) {
  if (run.outcome === 'needs-input') return ''
  return run.doing
}

export function actions(run: Run, s: Stage): Action[] {
  if (run.outcome === 'needs-approval')
    return [
      { label: `Approve ${run.gates.join(', ')}`, text: `ok ${run.gates.join(', ')} ${run.id}`, isPrimary: true },
      { label: 'Report', text: '', isReport: true },
    ]
  if (s.lane === 'ship')
    return [
      { label: 'Ship UAT', text: `ship uat ${run.id}`, isPrimary: true },
      { label: 'Close', text: `Close ${run.id}` },
    ]
  if (run.outcome === 'needs-input')
    return [
      { label: 'Answer', text: `Answer for ${run.id}: `, isPrimary: true, isFill: true },
      { label: 'Report', text: '', isReport: true },
    ]
  return [{ label: 'Report', text: '', isPrimary: true, isReport: true }]
}

export function whereLabel(run: Run) {
  const o = run.ownerSession
  if (!o) return 'another session'
  if (o.state === 'closed') return 'a closed session'
  return `‘${o.name}’ in ${o.where === 'desktop' ? 'Claude Desktop' : 'a terminal'}${o.status === 'busy' ? ', busy' : ''}`
}

export function hereActions(run: Run, s: Stage): Action[] {
  const take = run.outcome === 'needs-approval'
    ? { label: `Approve ${run.gates.join(', ')} here`, text: `Take ${run.id} into this session and approve ${run.gates.join(', ')}`, isPrimary: true }
    : run.outcome === 'needs-input'
      ? { label: 'Answer here', text: `Take ${run.id} into this session and answer: `, isPrimary: true, isFill: true }
      : { label: 'Take here', text: `Take ${run.id} into this session`, isPrimary: true }
  return [take, { label: 'Report', text: '', isReport: true }]
}

export function split(runs: Run[], now: number) {
  const by = Object.fromEntries(lanes(runs, now).map(l => [l.lane, l.runs])) as Record<Stage['lane'], Run[]>
  return { decide: [...by.you, ...by.ship], moving: by.running, done: by.done }
}

const SENT_FOR_MS = 10 * 60_000

export function sentFor(run: Run, ctl: Ctl, now: number): Sent | null {
  const s = ctl.sent[run.id]
  return s && s.turn === run.turn && s.status === run.status && now - s.at < SENT_FOR_MS ? s : null
}

export function press(ctl: Ctl, run: Run, b: Action) {
  if (b.isReport) return ctl.toggle(reportKey(run.id))
  if (b.isFill) return ctl.fill(b.text)
  ctl.markSent(run, b.label)
  ctl.act(b.text)
}

export function bandFacts(snap: { runs: Run[]; theirs: Run[] }, now: number, shownBars: number) {
  const { decide, moving } = split(snap.runs, now)
  const elsewhere = split(snap.theirs, now).decide.length
  return [
    decide.length > shownBars ? `${decide.length - shownBars} more waiting` : '',
    elsewhere > 0 ? `${elsewhere} waiting in other sessions` : '',
    moving.length > 0 ? `${moving.length} in progress` : '',
    snap.runs.length > 0 && moving.length === 0 && decide.length === 0 ? 'All workers idle' : '',
  ]
    .filter(Boolean)
    .slice(0, 2)
}
