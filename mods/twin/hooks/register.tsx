import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, RenderChildren, Timer } from 'claude-code'

import type { Run, Snapshot } from '../types'
import { DesktopBand, DesktopBoard } from './desktop.tsx'
import { bandFacts, split, stage, type Ctl, type Sent, type Ui } from './model.ts'
import { TerminalBoard, TerminalDecisionRow } from './terminal.tsx'

const PANE = 'twin'
const BUSY_POLL_MS = 8_000
const IDLE_POLL_MS = 30_000
const MAX_BARS = 2

const snapshot = atom({ plugin: 'twin', key: 'snapshot' } as const, null)
const expandedAtom = atom({ plugin: 'twin', key: 'expanded' } as const, [] as string[])
const theirsAtom = atom({ plugin: 'twin', key: 'showTheirs' } as const, false)
const sentAtom = atom({ plugin: 'twin', key: 'sent' } as const, {} as Record<string, Sent>)



// The rainbow mod's stops, loop and speed; the frame flows all the time, not only while Claude works.
const RAINBOW = ['#ff7a90', '#ffb36b', '#f4e07a', '#6fe3a5', '#64c8ff', '#8f86ff', '#e489ff'] as const
const STOPS = [0xff7a90, 0xffb36b, 0xf4e07a, 0x6fe3a5, 0x64c8ff, 0x8f86ff, 0xe489ff] as const
const LOOP_STEPS = 48
const FLOW_MS = 120
const SPAN = (STOPS.length - 1) / STOPS.length
const DEFAULT_COLOR = 0x01000000

const channel = (color: number, shift: number) => (color >> shift) & 0xff
const mix = (a: number, b: number, t: number) =>
  [16, 8, 0].reduce(
    (color, shift) => color | (Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t) << shift),
    0,
  )

function colorAt(position: number): number {
  const at = (((position % 1) + 1) % 1) * STOPS.length
  const stop = Math.floor(at)
  return mix(STOPS[stop]!, STOPS[(stop + 1) % STOPS.length]!, at - stop)
}

/** One row of the frame as a Raster's cells, `step` steps into a rightward flow; `from` and `of` place a slice of the full width. */
function cells(text: string, from: number, of: number, step: number): string {
  const words = new Uint32Array(text.length * 3)
  ;[...text].forEach((char, i) => {
    const x = from + i
    const color = colorAt(-step / LOOP_STEPS + (of === 1 ? 0 : (x / (of - 1)) * SPAN))
    words.set([char.codePointAt(0)!, color, DEFAULT_COLOR], i * 3)
  })
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

const top = (width: number) => `╭${'─'.repeat(Math.max(0, width - 2))}╮`
const bottom = (width: number) => `╰${'─'.repeat(Math.max(0, width - 2))}╯`

/** The frame's four Rasters as last drawn, which a flow tick must blit at the same site and width. */
let frame: { site: string; width: number } | undefined
let flowStep = 0
let flowTimer: Timer | undefined

function stopFlow() {
  flowTimer?.cancel()
  flowTimer = undefined
}

async function flow($: EngineInterface) {
  if (!frame) return stopFlow()
  flowStep = (flowStep + 1) % LOOP_STEPS
  const { site, width } = frame
  for (const [key, text, from] of [
    ['twin-top', top(width), 0],
    ['twin-bottom', bottom(width), 0],
    ['twin-left', '│', 0],
    ['twin-right', '│', width - 1],
  ] as const) {
    const { deny } = await $.ui.blit({ requestId: site, key, cells: cells(text, from, width, flowStep) })
    if (deny !== undefined) return stopFlow()
  }
}

function hueAt(x: number, width: number): Color {
  const at = width <= 1 ? 0 : (x / (width - 1)) * (RAINBOW.length - 1)
  return RAINBOW[Math.min(RAINBOW.length - 1, Math.round(at))]!
}

/** A border row cut into one Text per colour band, not one per cell. */
function Rule({ ui, width, left, right, tint }: { ui: Ui; width: number; left: string; right: string; tint: Color | null }) {
  const { Text } = ui
  const cells = [left, ...'─'.repeat(Math.max(0, width - 2)), right]
  const runs: { color: Color; text: string }[] = []
  cells.forEach((cell, x) => {
    const color = tint ?? hueAt(x, width)
    const last = runs.at(-1)
    if (last && last.color === color) last.text += cell
    else runs.push({ color, text: cell })
  })
  return (
    <Text>
      {runs.map((run, i) => (
        <Text key={String(i)} color={run.color}>
          {run.text}
        </Text>
      ))}
    </Text>
  )
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
      const runs = (await read($, snapshot))?.runs ?? []
      $.clock.after(runs.some(r => r.status === 'running') ? BUSY_POLL_MS : IDLE_POLL_MS, poll)
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
    const snap = await read($, snapshot)
    const now = await $.clock.now()
    const runs = snap?.runs ?? []
    const open = runs.filter(run => stage(run, now).lane !== 'done')
    const waitingElsewhere = snap ? split(snap.theirs, now).decide.length : 0
    if (!root || !snap || (open.length === 0 && waitingElsewhere === 0) || e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const openPane = () => void $.ui.open({ id: PANE, title: name })
    const ctl = await controls($, key => void update($, expandedAtom, list => (list.includes(key) ? list : [...list, key])).then(openPane))
    if (e.surface !== 'terminal') return <DesktopBand ui={$.ui.resolve(e)} snap={snap} now={now} ctl={ctl} open={openPane} />

    const { decide, moving } = split(runs, now)
    const counts = [
      { key: 'you', icon: '◆', color: 'warning' as Color, n: decide.length, label: 'waiting' },
      { key: 'running', icon: '●', color: 'permission' as Color, n: moving.length, label: 'in progress' },
    ].filter(c => c.n > 0)
    const width = e.props.bodyColumns
    const tint: Color | null = decide.length > 0 ? 'warning' : null
    const isFlowing = tint === null
    const ui = $.ui.resolve(e)
    if (isFlowing) {
      frame = { site: e.requestId, width }
      flowTimer ??= $.clock.every(FLOW_MS, () => void flow($))
    } else {
      frame = undefined
      stopFlow()
    }
    const side = (key: 'twin-left' | 'twin-right', x: number) =>
      isFlowing && 'Raster' in ui ? (
        <ui.Raster key={key} columns={1} rows={1} cells={cells('│', x, width, flowStep)} />
      ) : (
        <Text key={key} color={tint ?? hueAt(x, width)}>
          │
        </Text>
      )
    const rule = (key: 'twin-top' | 'twin-bottom', text: string) =>
      isFlowing && 'Raster' in ui ? (
        <ui.Raster key={key} columns={width} rows={1} cells={cells(text, 0, width, flowStep)} />
      ) : (
        <Rule ui={ui} width={width} left={text[0]!} right={text.at(-1)!} tint={tint} />
      )
    const row = (body: RenderChildren, key: string) => (
      <Box key={key}>
        {side('twin-left', 0)}
        <Text> </Text>
        <Box flexGrow={1}>{body}</Box>
        <Text> </Text>
        {side('twin-right', width - 1)}
      </Box>
    )

    return (
      <Box flexDirection="column" width={width}>
        {rule('twin-top', top(width))}
        {decide.slice(0, MAX_BARS).map(run => row(<TerminalDecisionRow ui={ui} run={run} now={now} ctl={ctl} />, `row-${run.id}`))}
        {row(
          <Button key="open" plain label={`Open ${name}`} onPress={openPane}>
            <Text bold>{name}</Text>
            {counts.map(c => (
              <Text key={c.key}>
                {'   '}
                <Text color={c.color}>{c.icon}</Text>
                <Text bold={c.key === 'you'}> {c.n}</Text>
                <Text dimColor> {c.label}</Text>
              </Text>
            ))}
            {bandFacts(snap, now, MAX_BARS)
              .filter(f => !/in progress$/.test(f))
              .map(f => (
                <Text key={f} color={/waiting/.test(f) ? 'warning' : undefined} dimColor={!/waiting/.test(f)}>{`   ${f}`}</Text>
              ))}
          </Button>,
          'status',
        )}
        {rule('twin-bottom', bottom(width))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const now = await $.clock.now()
    if (!snap || snap.runs.length + snap.theirs.length === 0) return <ui.Text dimColor>Nothing open</ui.Text>
    const ctl = await controls($)
    return e.surface === 'terminal' ? <TerminalBoard ui={ui} snap={snap} now={now} ctl={ctl} /> : <DesktopBoard ui={ui} snap={snap} now={now} ctl={ctl} />
  })
}
