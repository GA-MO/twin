export type RunStatus = 'running' | 'finished' | 'crashed' | 'closed'

export type Outcome = 'done' | 'blocked' | 'needs-approval' | 'needs-input'

export type Subagent = {
  id: string
  type: string
  description: string
  model: string
  isRunning: boolean
  doing: string
  activeAt: number
}

export type ReportSummary = { did: string; pending: string; discovered: string; verified: string; question: string | null; clicked: string[]; ideas: string[]; commits: string[] }
export type OwnerSession = { state: 'live'; name: string; where: 'desktop' | 'terminal'; status: string } | { state: 'closed' }

export type Run = {
  id: string
  owner: string | null
  ownerSession?: OwnerSession | null
  handling?: string | null
  report?: ReportSummary | null
  project: string
  slug: string
  status: RunStatus
  outcome: Outcome | null
  answered: boolean
  gates: string[]
  turn: number
  doing: string
  agents: Subagent[]
  commits: number
  pushed: boolean
  activeAt: number
}

export type Lane = 'you' | 'running' | 'ship' | 'done'

export type Snapshot = { name: string; runs: Run[]; theirs: Run[]; readAt: number }

export type Rate = { runs: number; untouched: number; fixed: number; more: number; dropped: number; waiting: number }

export type DecisionAction = 'answer' | 'approve' | 'close' | 'dispatch'

export type Dashboard = {
  name: string
  asOf: string
  week: { handed: Rate; prev: Rate | null; sent: number; prompts: number; corrections: number; prevCorrections: number | null }
  trend: { from: string; to: string; runs: number; untouched: number }[]
  decisions: { week: number; prev: number; byAction: Record<DecisionAction, number>; made30: number; corrected30: number }
  followed: { agreed: number; judged: number }
  projects: { project: string | null; runs: number; untouched: number; fixed: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    twin: { snapshot: Snapshot | null; dashboard: Dashboard | null; expanded: string[]; showTheirs: boolean; sent: Record<string, { label: string; at: number; turn: number; status: RunStatus }> }
  }
}
