import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const NOW = 1_800_000_000_000

const RUNS = {
  runs: [
    { id: 'a', project: 'booking-site', slug: 'tour-map', status: 'running', outcome: null, answered: false, gates: [], turn: 3, doing: 'merge popup branch', agents: [{ id: 's1', type: 'poteto-agent', description: 'Implement VAT breakdown', model: 'opus', isRunning: true, doing: 'writing the receipt test', activeAt: NOW - 60_000 }, { id: 's2', type: 'Explore', description: 'Map header surfaces', model: 'opus', isRunning: false, doing: 'done', activeAt: NOW - 300_000 }], commits: 5, pushed: false, activeAt: NOW - 120_000 },
    { id: 'b', project: 'booking-site', slug: 'cms-error', status: 'finished', outcome: 'done', answered: false, gates: [], turn: 1, doing: 'fetchData throws', agents: [], commits: 1, pushed: false, activeAt: NOW - 600_000 },
    { id: 'c', project: 'ops', slug: 'deploy', status: 'finished', outcome: 'needs-approval', answered: false, gates: ['push'], turn: 1, doing: '', agents: [], commits: 1, pushed: false, activeAt: NOW },
    { id: 'd', project: 'nok', slug: 'stuck', status: 'running', outcome: null, answered: false, gates: [], turn: 1, doing: 'waiting on CI', agents: [], commits: 0, pushed: false, activeAt: NOW - 15 * 60_000 },
    { id: 'e', project: 'demo', slug: 'cli-quote', status: 'finished', outcome: null, answered: true, gates: [], turn: 1, doing: 'bun test passes 38', agents: [], commits: 1, pushed: false, activeAt: NOW },
  ],
}

const SURFACES = ['terminal', 'desktop'] as const

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} }

async function start($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], root: string, data: { runs: unknown[] } = RUNS) {
  on('session.root', () => ({ value: root }))
  on('session.id', () => ({ value: 'me' }))
  on('fs.stat', (_, e) => (e.path === '/dev/nok/twin.ts' ? { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } } : { deny: 'missing' }))
  on('fs.read', (_, e) => (e.path === '/dev/nok/profile/twin.json' ? { value: JSON.stringify({ name: 'nok', bun: '/opt/bun' }) } : { deny: 'missing' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(data), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => ({ deny: 'no timers in tests' }))
  on('command.register', () => ({ value: { command: 'twin' } }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  return opened
}

const PANE_PROPS = { title: 'nok', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

test('on the terminal the band frames a row per decision in the rainbow, with the status line beneath', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await start($, on, '/dev/nok')
  const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface: 'terminal', props: BAND_PROPS })
  expect(await ui.find({ type: 'Text', text: /Approve push for deploy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /in progress/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeDefined()
  expect(await ui.find({ type: 'Raster', key: 'twin-top' })).toBeDefined()
  expect(await ui.find({ type: 'Raster', key: 'twin-left-2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeDefined()
  await ui.press({ key: 'bar-c-Approve push' })
  expect(sent).toEqual(['ok push c'])
  await ui.unmount()
})

test('on desktop each decision gets its own bar above the status line, and its approve button sends the prompt', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await start($, on, '/dev/nok')
  const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface: 'desktop', props: BAND_PROPS })
  expect(await ui.find({ type: 'Text', text: /Approve push for deploy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bun test passes 38/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /in progress/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  await ui.press({ key: 'bar-c-Approve push' })
  expect(sent).toEqual(['ok push c'])
  await ui.unmount()
})

test('on the terminal the pane leads with decisions, shows live subagents, and opens a report in place', async ($, on) => {
  await start($, on, '/dev/nok')
  const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface: 'terminal', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /3 waiting on you/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Approve push for deploy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /merge popup branch/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Implement VAT breakdown/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /writing the receipt test/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /quiet for 15m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No report yet/ })).toBeUndefined()
  await ui.press({ key: 'c-Report' })
  expect(await ui.find({ type: 'Text', text: /No report yet/ })).toBeDefined()
  await ui.unmount()
})

test('on desktop the pane leads with the decisions and shows what each subagent of a running run is doing', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await start($, on, '/dev/nok')
  const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface: 'desktop', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /3 waiting on you/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /merge popup branch/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Implement VAT breakdown/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /writing the receipt test/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /quiet for 15m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  await ui.press({ key: 'c-Approve push' })
  expect(sent).toEqual(['ok push c'])
  await ui.unmount()
})

for (const surface of SURFACES) {
  test(`on ${surface} the band carries the same status line and the same decisions`, async ($, on) => {
    await start($, on, '/dev/nok')
    const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface, props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /3 waiting on you/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 in progress/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ops · just now/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Needs attention$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'bar-e-Report' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'bar-b-Ship UAT' })).toBeUndefined()
    await ui.unmount()
  })

  test(`on ${surface} the pane shows the same sections in the same order`, async ($, on) => {
    await start($, on, '/dev/nok')
    const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface, props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /^3 waiting on you$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^2 in progress · 1 agent working$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^In progress$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'b-Ship UAT' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'e-Answer' })).toBeUndefined()
    await ui.unmount()
  })

  test(`pressing the band opens the pane on ${surface}`, async ($, on) => {
    const opened = await start($, on, '/dev/nok')
    const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface, props: BAND_PROPS })
    await ui.press({ key: 'open' })
    expect(opened).toContain('twin')
    await ui.unmount()
  })
}

test('with nothing waiting on the user the frame is a rainbow of rasters on the terminal, status dots on desktop', async ($, on) => {
  const calm = { runs: RUNS.runs.filter(r => r.status === 'running') }
  await start($, on, '/dev/nok', calm)
  const terminal = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface: 'terminal', props: BAND_PROPS })
  expect(await terminal.find({ type: 'Raster', key: 'twin-top' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /in progress/ })).toBeDefined()
  await terminal.unmount()
  const desktop = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface: 'desktop', props: BAND_PROPS })
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  await desktop.unmount()
})

test('outside a twin repo the mod draws nothing', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($, on, '/dev/other')
  const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface: 'terminal', props: BAND_PROPS })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test("another session's runs leave the band and show as a count", async ($, on) => {
  const theirs = { ...RUNS.runs[2], id: 'x', slug: 'their-deploy', owner: 'other' }
  await start($, on, '/dev/nok', { runs: [{ ...RUNS.runs[0], owner: 'me' }, theirs] })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface, props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /working|in progress/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /their-deploy/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /other sessions/ }))?.text).toMatch(/1 (waiting )?in other sessions/)
    await ui.unmount()
  }
})

test('a question the twin took on itself leaves the band and shows as in progress with what it is doing', async ($, on) => {
  const handled = { ...RUNS.runs[2], id: 'h', slug: 'receipt-api', outcome: 'needs-input', gates: [], owner: 'me', handling: 'checking the sit pipeline', doing: 'checking the sit pipeline' }
  await start($, on, '/dev/nok', { runs: [handled] })
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface, props: BAND_PROPS })
    expect(await band.find({ type: 'Text', text: /Answer/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /waiting on you/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /1 in progress/ })).toBeDefined()
    await band.unmount()
    const pane = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface, props: PANE_PROPS })
    expect(await pane.find({ type: 'Text', text: /checking the sit pipeline/ })).toBeDefined()
    await pane.unmount()
  }
})

test("the pane lists another session's runs apart from this session's", async ($, on) => {
  const theirs = { ...RUNS.runs[2], id: 'x', slug: 'their-deploy', owner: 'other' }
  await start($, on, '/dev/nok', { runs: [theirs] })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface, props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /Nothing open/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /other sessions/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /their-deploy/ })).toBeDefined()
    await ui.unmount()
  }
})

test('on desktop Report opens the run report inside its card, without a prompt', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  const withReport = { ...RUNS.runs[2], report: { did: 'Rebuilt SIT', pending: 'Push to develop', discovered: '-', verified: 'smoke 12/12', question: null, clicked: [], ideas: [], commits: ['a1c9e2f Merge fix'] } }
  await start($, on, '/dev/nok', { runs: [withReport] })
  const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface: 'desktop', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /smoke 12\/12/ })).toBeUndefined()
  await ui.press({ key: 'c-Report' })
  expect(await ui.find({ type: 'Text', text: /smoke 12\/12/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /a1c9e2f Merge fix/ })).toBeDefined()
  expect(sent).toEqual([])
  await ui.unmount()
})

test('on desktop a decision waiting in another session names that session and can be approved here', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  const elsewhere = { ...RUNS.runs[2], id: 'x', slug: 'their-deploy', owner: 'other', ownerSession: { state: 'live', name: 'release talk', where: 'desktop', status: 'idle' } }
  await start($, on, '/dev/nok', { runs: [elsewhere] })
  const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface: 'desktop', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /Waiting in other sessions/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /release talk.*Claude Desktop/ })).toBeDefined()
  await ui.press({ key: 'x-Approve push here' })
  expect(sent).toEqual(['Take x into this session and approve push'])
  await ui.unmount()
})

for (const surface of SURFACES) {
  test(`on ${surface} a pressed action turns into a sent note so it cannot be sent twice`, async ($, on) => {
    on('prompt.submit', (_, e) => ({ text: e.text }))
    await start($, on, '/dev/nok')
    const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface, props: PANE_PROPS })
    await ui.press({ key: 'c-Approve push' })
    expect(await ui.find({ type: 'Text', text: /Sent: Approve push/ })).toBeDefined()
    await ui.unmount()
  })
}

test('Answer puts a reply line in the prompt box instead of starting a turn', async ($, on) => {
  const filled: string[] = []
  const sent: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  const question = { ...RUNS.runs[2], id: 'q', slug: 'faq', outcome: 'needs-input', gates: [], doing: 'Which copy?' }
  await start($, on, '/dev/nok', { runs: [question] })
  const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface: 'desktop', props: PANE_PROPS })
  await ui.press({ key: 'q-Answer' })
  expect(filled).toEqual(['Answer for q: '])
  expect(sent).toEqual([])
  await ui.unmount()
})

for (const surface of SURFACES) {
  test(`on ${surface} the band names the agent from the profile`, async ($, on) => {
    await start($, on, '/dev/nok')
    const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface, props: BAND_PROPS })
    expect((await ui.find({ type: 'Text', text: /^nok$/ }))?.text).toBe('nok')
    await ui.unmount()
  })
}

test('a run whose session has closed comes back to this session with its buttons', async ($, on) => {
  const orphan = { ...RUNS.runs[2], owner: 'gone', ownerSession: { state: 'closed' } }
  await start($, on, '/dev/nok', { runs: [orphan] })
  const ui = await $.ui.mount({ plugin: 'twin', component: 'AbovePrompt', surface: 'desktop', props: BAND_PROPS })
  expect(await ui.find({ type: 'Text', text: /Approve push for deploy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /other sessions/ })).toBeUndefined()
  await ui.unmount()
})

test('a refresh that fails leaves the mod quiet instead of breaking the session', async ($, on) => {
  on('session.root', () => ({ value: '/dev/nok' }))
  on('session.id', () => ({ value: 'me' }))
  on('fs.stat', (_, e) => (e.path === '/dev/nok/twin.ts' ? { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } } : { deny: 'missing' }))
  on('fs.read', () => ({ deny: 'missing' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'not json', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => ({ deny: 'no timers in tests' }))
  on('command.register', () => ({ value: { command: 'twin' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/dev/nok', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'twin', component: 'Pane', requestId: 'twin', surface: 'desktop', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /Nothing open/ })).toBeDefined()
  await ui.unmount()
})
