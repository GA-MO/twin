import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { dashboardView, parseDashboard } from './dashboard.ts'

const NOW = Date.parse('2026-11-21T18:10:00Z')

const rate = (runs: number, untouched: number, extra: Partial<Record<'fixed' | 'more' | 'dropped' | 'waiting', number>> = {}) => ({ runs, untouched, fixed: 0, more: 0, dropped: 0, waiting: 0, ...extra })

const DASHBOARD = {
  name: 'nok',
  asOf: '2026-11-21T15:10:00Z',
  week: { handed: rate(57, 31, { fixed: 11, more: 14, dropped: 1, waiting: 7 }), prev: rate(10, 7), sent: 64, prompts: 374, corrections: 30, prevCorrections: 5 },
  trend: ['10-03', '10-10', '10-17', '10-24', '10-31', '11-07', '11-14', '11-21'].map((md, i) => ({ from: `2026-${md}`, to: `2026-${md}`, runs: i < 3 ? 0 : 10 * i, untouched: i < 3 ? 0 : 7 * i })),
  decisions: { week: 85, prev: 19, byAction: { answer: 44, approve: 6, close: 30, dispatch: 5 }, made30: 306, corrected30: 12 },
  followed: { agreed: 20, judged: 22 },
  projects: [
    ['shop', 0, 3],
    ['twin-template', 1, 4],
    [null, 7, 16],
    ['framer-templates', 4, 9],
    ['klip-takra', 5, 10],
    ['prime', 4, 7],
    ['rov-draft', 5, 8],
    ['booth-site', 5, 8],
    ['baton', 4, 7],
    ['geno', 9, 10],
  ].map(([project, untouched, runs]) => ({ project, runs, untouched, fixed: 0 })),
}

const PANE_PROPS = { title: 'nok dashboard', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

async function start($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], file: () => string | null) {
  on('session.root', () => ({ value: '/dev/nok' }))
  on('session.id', () => ({ value: 'me' }))
  on('fs.stat', (_, e) => (e.path === '/dev/nok/twin.ts' ? { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } } : { deny: 'missing' }))
  on('fs.read', (_, e) => (e.path === '/dev/nok/profile/twin.json' ? { value: JSON.stringify({ name: 'nok' }) } : e.path === '/dev/nok/state/audit/dashboard.json' && file() !== null ? { value: file() ?? '' } : { deny: 'missing' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ runs: [] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => ({ deny: 'no timers in tests' }))
  const commands: string[] = []
  on('command.register', (_, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  const opened: { id: string; title?: string }[] = []
  on('ui.open', (_, e) => {
    opened.push({ id: e.id, ...(e.title === undefined ? {} : { title: e.title }) })
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/dev/nok', surface: 'desktop', isInteractive: true })
  return { commands, opened }
}

test('the headline is the share of settled runs never touched again, against last week in points', async () => {
  const view = dashboardView(parseDashboard(JSON.stringify(DASHBOARD)), NOW)
  expect(view?.percent).toBe('54%')
  expect(view?.detail).toBe('31 of 57 runs · last week 70%')
  expect(view?.delta).toEqual({ text: '↓ 16 pts', tone: 'bad' })
  expect(view?.note).toBe('+7 not settled yet · 64 sent this week')
  expect(view?.footer).toBe('Updated 3h ago')
})

test('the trend starts at the first week with runs, oldest first, and the stats say what changed since last week', async () => {
  const view = dashboardView(DASHBOARD as Parameters<typeof dashboardView>[0], NOW)!
  expect(view.trend.map(w => w.percent)).toEqual(['70%', '70%', '70%', '70%', '70%'])
  expect(view.trend.map(w => w.label)).toEqual(['Oct 24', 'Oct 31', 'Nov 7', 'Nov 14', 'Nov 21'])
  expect(view.trend.at(-1)?.isCurrent).toBe(true)
  expect(view.stats.map(s => [s.label, s.value, s.delta?.text ?? null, s.detail.join(' · ')])).toEqual([
    ['Decided for you', '85', '↑ from 19', '44 answered · 6 approved · 30 closed · 5 sent'],
    ['Corrected later', '12 of 306', null, '4% of its calls · last 30 days'],
    ['You took its advice', '91%', null, '20 of 22 times · it recommended'],
    ['Sent back to fix', '11', '↑ from 0', '14 added scope · 1 dropped'],
  ])
  expect(view.stats[3]?.delta?.tone).toBe('bad')
})

test('projects keep the engine order, worst first, eight at most and the rest as one line', async () => {
  const view = dashboardView(DASHBOARD as Parameters<typeof dashboardView>[0], NOW)!
  expect(view.projects.map(p => `${p.name} ${p.ratio}`)).toEqual(['shop 0/3 · 0%', 'twin-template 1/4 · 25%', 'No project 7/16 · 44%', 'framer-templates 4/9 · 44%', 'klip-takra 5/10 · 50%', 'prime 4/7 · 57%', 'rov-draft 5/8 · 63%', 'booth-site 5/8 · 63%'])
  expect(view.more).toBe('+2 more · 13/17 · 76%')
})

test('a file that is missing, not JSON or the wrong shape is no dashboard', async () => {
  expect(parseDashboard(null)).toBeNull()
  expect(parseDashboard('{ nope')).toBeNull()
  expect(parseDashboard(JSON.stringify({ ...DASHBOARD, week: { ...DASHBOARD.week, handed: { runs: -1 } } }))).toBeNull()
  expect(parseDashboard(JSON.stringify({ ...DASHBOARD, decisions: { ...DASHBOARD.decisions, byAction: { answer: 1 } } }))).toBeNull()
  expect(parseDashboard(JSON.stringify({ ...DASHBOARD, addedLater: true }))).not.toBeNull()
})

test('/dashboard is registered with the agent name and opens its own pane', async ($, on) => {
  const { commands, opened } = await start($, on, () => JSON.stringify(DASHBOARD))
  expect(commands).toEqual(['twin', 'dashboard'])
  await $.command.run({ command: 'dashboard', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(opened).toEqual([{ id: 'twin-dashboard', title: 'nok dashboard' }])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`on ${surface} the dashboard pane shows the headline, the trend, the stats and the projects`, async ($, on) => {
    await start($, on, () => JSON.stringify(DASHBOARD))
    const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin-dashboard', surface, props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /^Handed off, never touched again$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /31 of 57 runs · last week 70%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↓ 16 pts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Untouched share by week/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /44 answered · 6 approved/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /30 closed · 5 sent/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^By project \(30 days\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0\/3 · 0%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\+2 more/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`on ${surface} with no audit file the dashboard pane says how to make one`, async ($, on) => {
    await start($, on, () => null)
    const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin-dashboard', surface, props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /No audit yet: run `sync audit`/ })).toBeDefined()
    await ui.unmount()
  })
}

test('an audit file written after the session started is read when a turn completes', async ($, on) => {
  let file: string | null = null
  on('turn.complete', () => ({ text: '' }))
  await start($, on, () => file)
  file = JSON.stringify(DASHBOARD)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin-dashboard', surface: 'desktop', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /31 of 57 runs/ })).toBeDefined()
  await ui.unmount()
})
