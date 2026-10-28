import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Run, Snapshot } from '../types'
import { DesktopBand, DesktopBoard } from './desktop.tsx'
import { COPY, band, board, isBusy, type Ctl, type Sent } from './model.ts'
import { TerminalBand, TerminalBoard, frameBlits, frameRows, nextStep } from './terminal.tsx'

const PANE = 'twin'
const BUSY_POLL_MS = 8_000
const IDLE_POLL_MS = 30_000
const FLOW_MS = 120

const snapshot = atom({ plugin: 'twin', key: 'snapshot' } as const, null)
const expandedAtom = atom({ plugin: 'twin', key: 'expanded' } as const, [] as string[])
const theirsAtom = atom({ plugin: 'twin', key: 'showTheirs' } as const, false)
const sentAtom = atom({ plugin: 'twin', key: 'sent' } as const, {} as Record<string, Sent>)

let frame: { site: string; width: number; rows: number } | undefined
let flowStep = 0
let flowTimer: Timer | undefined

function stopFlow() {
  flowTimer?.cancel()
  flowTimer = undefined
}

async function flow($: EngineInterface) {
  if (!frame) return stopFlow()
  flowStep = nextStep(flowStep)
  const { site, width, rows } = frame
  for (const { key, cells } of frameBlits(width, rows, flowStep)) {
    const { deny } = await $.ui.blit({ requestId: site, key, cells })
    if (deny !== undefined) return stopFlow()
  }
}

async function refresh($: EngineInterface) {
  if (!root) return
  const result = await $.process.run([bun, 'twin.ts', 'runs', '--json'], { cwd: root, timeoutMs: 20_000 }).catch(() => null)
  if (!result || result.exitCode !== 0) return
  const parsed = (() => {
    try {
      return JSON.parse(result.stdout) as Omit<Snapshot, 'readAt' | 'theirs' | 'name'>
    } catch {
      return null
    }
  })()
  if (!parsed) return
  const isMine = (run: Run) => !run.owner || run.owner === session || run.ownerSession?.state === 'closed'
  const next: Snapshot = {
    ...parsed,
    name,
    runs: parsed.runs.filter(isMine),
    theirs: parsed.runs.filter(run => !isMine(run)),
    readAt: await $.clock.now(),
  }
  await update($, snapshot, () => next)
}

async function controls($: EngineInterface, toggleReport?: (key: string) => void): Promise<Ctl> {
  const [expanded, showTheirs, sent] = await Promise.all([read($, expandedAtom), read($, theirsAtom), read($, sentAtom)])
  const toggle = (id: string) => void update($, expandedAtom, list => (list.includes(id) ? list.filter(i => i !== id) : [...list, id]))
  return {
    act: text => void $.prompt.submit({ text }),
    fill: text => void $.prompt.fill({ text }),
    sent,
    markSent: (run, label) => void $.clock.now().then(at => update($, sentAtom, all => ({ ...all, [run.id]: { label, at, turn: run.turn, status: run.status } }))),
    expanded,
    toggle: id => (toggleReport && id.startsWith('report:') ? toggleReport(id) : toggle(id)),
    showTheirs,
    setShowTheirs: next => void update($, theirsAtom, () => next),
    name,
  }
}

let root: string | null = null
let session: string | null = null
let name = 'twin'
let bun = 'bun'

const Profile = (text: string): { name?: unknown; bun?: unknown } => {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null ? value : {}
  } catch {
    return {}
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const dir = await $.session.root()
    const isTwin = await $.fs.stat(`${dir}/twin.ts`).then(
      () => true,
      () => false,
    )
    if (!isTwin) return next(e)
    root = dir
    session = await $.session.id()
    const profile = Profile(await $.fs.read(`${dir}/profile/twin.json`).catch(() => ''))
    if (typeof profile.name === 'string') name = profile.name
    if (typeof profile.bun === 'string') bun = profile.bun

    await $.command.register({
      name: 'twin',
      description: `Open a pane of every run ${name} has sent to other projects`,
    })
    await refresh($)

    const poll = async () => {
      await refresh($)
      $.clock.after(isBusy(await read($, snapshot)) ? BUSY_POLL_MS : IDLE_POLL_MS, poll)
    }
    $.clock.after(BUSY_POLL_MS, poll)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'twin' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: name })
    return { text: `Opened the ${name} pane` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await $.clock.now()
    const view = band(await read($, snapshot), now)
    if (!root || !view || e.props.hasSurvey) {
      frame = undefined
      stopFlow()
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const openPane = () => void $.ui.open({ id: PANE, title: name })
    const ctl = await controls($, key => void update($, expandedAtom, list => (list.includes(key) ? list : [...list, key])).then(openPane))
    if (e.surface !== 'terminal') return <DesktopBand ui={ui} band={view} ctl={ctl} now={now} name={name} open={openPane} />
    const width = e.props.bodyColumns
    frame = { site: e.requestId, width, rows: frameRows(view) }
    flowTimer ??= $.clock.every(FLOW_MS, () => void flow($))
    return <TerminalBand ui={ui} band={view} ctl={ctl} now={now} name={name} width={width} step={flowStep} open={openPane} />
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const now = await $.clock.now()
    const ctl = await controls($)
    const view = board(await read($, snapshot), now, ctl.expanded)
    if (!view) return <ui.Text dimColor>{COPY.empty}</ui.Text>
    return e.surface === 'terminal' ? <TerminalBoard ui={ui} board={view} now={now} ctl={ctl} /> : <DesktopBoard ui={ui} board={view} now={now} ctl={ctl} />
  })
}
