import type { Dashboard, DecisionAction, Rate } from '../types'
import { ago } from './model.ts'

export const DASHBOARD_PANE = 'twin-dashboard'
export const DASHBOARD_FILE = 'state/audit/dashboard.json'
const PROJECT_ROWS = 8
const ACTIONS: DecisionAction[] = ['answer', 'approve', 'close', 'dispatch']
const ACTION_DONE: Record<DecisionAction, string> = { answer: 'answered', approve: 'approved', close: 'closed', dispatch: 'sent' }
const RATE_KEYS = ['runs', 'untouched', 'fixed', 'more', 'dropped', 'waiting']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const DASH_COPY = {
  empty: 'No audit yet: run `sync audit`',
  headline: 'Handed off, never touched again',
  trend: 'Untouched share by week · runs below',
  projects: 'By project (30 days)',
  noProject: 'No project',
}

export type Tone = 'good' | 'bad' | 'flat'

export const TONE: Record<Tone, `#${string}`> = { good: '#3DB37A', bad: '#EF6461', flat: '#8F8D88' }

export const levelColor = (share: number | null): `#${string}` => (share === null ? TONE.flat : share >= 0.7 ? '#3DB37A' : share >= 0.5 ? '#E6A23C' : '#EF6461')

export type Delta = { text: string; tone: Tone }

export type TrendWeek = { key: string; label: string; share: number | null; percent: string; runs: number; isCurrent: boolean }

export type Stat = { key: string; label: string; value: string; delta: Delta | null; detail: string[] }

export type ProjectRow = { key: string; name: string; share: number; ratio: string; color: `#${string}` }

export type DashboardView = {
  title: string
  label: string
  percent: string
  share: number | null
  color: `#${string}`
  detail: string
  delta: Delta | null
  note: string
  trendTitle: string
  trend: TrendWeek[]
  stats: Stat[]
  projectsTitle: string
  projects: ProjectRow[]
  more: string | null
  footer: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0
const counts = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => isRecord(v) && keys.every(k => isCount(v[k]))

function isDashboard(d: unknown): d is Dashboard {
  if (!isRecord(d) || typeof d.name !== 'string' || typeof d.asOf !== 'string' || Number.isNaN(Date.parse(d.asOf))) return false
  const { week, trend, decisions, followed, projects } = d
  return (
    counts(week, ['sent', 'prompts', 'corrections']) &&
    counts(week.handed, RATE_KEYS) &&
    (week.prev === null || counts(week.prev, RATE_KEYS)) &&
    (week.prevCorrections === null || isCount(week.prevCorrections)) &&
    Array.isArray(trend) &&
    trend.every(t => counts(t, ['runs', 'untouched']) && typeof t.from === 'string' && typeof t.to === 'string') &&
    counts(decisions, ['week', 'prev', 'made30', 'corrected30']) &&
    counts(decisions.byAction, ACTIONS) &&
    counts(followed, ['agreed', 'judged']) &&
    Array.isArray(projects) &&
    projects.every(p => counts(p, ['runs', 'untouched', 'fixed']) && (p.project === null || typeof p.project === 'string'))
  )
}

export function parseDashboard(text: string | null): Dashboard | null {
  if (!text) return null
  try {
    const value: unknown = JSON.parse(text)
    return isDashboard(value) ? value : null
  } catch {
    return null
  }
}

const shareOf = (untouched: number, runs: number) => (runs > 0 ? untouched / runs : null)
const pct = (share: number | null) => (share === null ? '–' : `${Math.round(share * 100)}%`)
const pctOf = (r: Pick<Rate, 'runs' | 'untouched'>) => pct(shareOf(r.untouched, r.runs))

function points(now: number | null, prev: number | null): Delta | null {
  if (now === null || prev === null) return null
  const diff = Math.round(now * 100) - Math.round(prev * 100)
  if (diff === 0) return { text: '= last week', tone: 'flat' }
  return { text: `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)} pts`, tone: diff > 0 ? 'good' : 'bad' }
}

function versus(now: number, prev: number | null, isMoreWorse: boolean): Delta | null {
  if (prev === null) return null
  if (now === prev) return { text: '= last week', tone: 'flat' }
  const isUp = now > prev
  return { text: `${isUp ? '↑' : '↓'} from ${prev}`, tone: !isMoreWorse ? 'flat' : isUp ? 'bad' : 'good' }
}

const dayLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${Number(date.slice(8, 10))}`

function stats(d: Dashboard): Stat[] {
  const { decisions, followed, week } = d
  const prev = week.prev
  return [
    {
      key: 'decided',
      label: 'Decided for you',
      value: String(decisions.week),
      delta: versus(decisions.week, prev ? decisions.prev : null, false),
      detail: [ACTIONS.slice(0, 2), ACTIONS.slice(2)].map(pair => pair.map(a => `${decisions.byAction[a]} ${ACTION_DONE[a]}`).join(' · ')),
    },
    {
      key: 'corrected',
      label: 'Corrected later',
      value: `${decisions.corrected30} of ${decisions.made30}`,
      delta: null,
      detail: decisions.made30 ? [`${pct(decisions.corrected30 / decisions.made30)} of its calls`, 'last 30 days'] : ['No calls in 30 days'],
    },
    {
      key: 'followed',
      label: 'You took its advice',
      value: pct(shareOf(followed.agreed, followed.judged)),
      delta: null,
      detail: followed.judged ? [`${followed.agreed} of ${followed.judged} times`, 'it recommended'] : ['No clear replies yet'],
    },
    {
      key: 'sent-back',
      label: 'Sent back to fix',
      value: String(week.handed.fixed),
      delta: versus(week.handed.fixed, prev?.fixed ?? null, true),
      detail: [`${week.handed.more} added scope`, `${week.handed.dropped} dropped`],
    },
  ]
}

export function dashboardView(d: Dashboard | null, now: number): DashboardView | null {
  if (!d) return null
  const { handed, prev } = d.week
  const share = shareOf(handed.untouched, handed.runs)
  const rows = d.projects.map(p => {
    const s = shareOf(p.untouched, p.runs) ?? 0
    return { key: p.project ?? '', name: p.project ?? DASH_COPY.noProject, share: s, ratio: `${p.untouched}/${p.runs} · ${pct(s)}`, color: levelColor(s) }
  })
  const rest = d.projects.slice(PROJECT_ROWS)
  const restRate = { runs: rest.reduce((n, p) => n + p.runs, 0), untouched: rest.reduce((n, p) => n + p.untouched, 0) }
  return {
    title: `${d.name} dashboard`,
    label: DASH_COPY.headline,
    percent: pct(share),
    share,
    color: levelColor(share),
    detail: [handed.runs ? `${handed.untouched} of ${handed.runs} runs` : 'No settled runs this week', ...(prev ? [`last week ${pctOf(prev)}`] : [])].join(' · '),
    delta: points(share, prev ? shareOf(prev.untouched, prev.runs) : null),
    note: [...(handed.waiting ? [`+${handed.waiting} not settled yet`] : []), `${d.week.sent} sent this week`].join(' · '),
    trendTitle: DASH_COPY.trend,
    trend: d.trend.map((t, i) => {
      const s = shareOf(t.untouched, t.runs)
      return { key: t.from, label: dayLabel(t.from), share: s, percent: pct(s), runs: t.runs, isCurrent: i === d.trend.length - 1 }
    }),
    stats: stats(d),
    projectsTitle: DASH_COPY.projects,
    projects: rows.slice(0, PROJECT_ROWS),
    more: rest.length ? `+${rest.length} more · ${restRate.untouched}/${restRate.runs} · ${pctOf(restRate)}` : null,
    footer: `Updated ${ago(Date.parse(d.asOf), now)}`,
  }
}
