import type { Color } from 'claude-code'

import type { ReportSummary, Run, Snapshot, Subagent } from '../types'
import { KIND_LABEL, REPORT_ROWS, actions, ago, ask, context, hereActions, isQuiet, kindOf, press, reportKey, role, sentFor, since, split, stage, whereLabel, type Action, type Ctl, type Kind, type Ui } from './model.ts'

export const KIND_COLOR: Record<Kind, Color> = { approve: 'permission', question: 'suggestion', ship: 'success', stuck: 'error' }
const SHOWN_AGENTS = 3

function Buttons({ ui, run, list, ctl, now, keyPrefix = '' }: { ui: Ui; run: Run; list: Action[]; ctl: Ctl; now: number; keyPrefix?: string }) {
  const { Box, Button, Text } = ui
  const isOpen = ctl.expanded.includes(reportKey(run.id))
  const sent = sentFor(run, ctl, now)
  if (sent) return <Text dimColor>Sent: {sent.label}. Waiting for {ctl.name}</Text>
  return (
    <Box gap={1} flexWrap="wrap" flexShrink={0}>
      {list.map(b => (
        <Button key={`${keyPrefix}${run.id}-${b.label}`} label={b.isReport && isOpen ? 'Hide report' : b.label} onPress={() => press(ctl, run, b)} />
      ))}
    </Box>
  )
}

function Report({ ui, report }: { ui: Ui; report: ReportSummary | null | undefined }) {
  const { Box, Text } = ui
  if (!report) return <Text dimColor>No report yet: the worker has not finished a turn.</Text>
  const rows = REPORT_ROWS.map(r => ({ ...r, value: report[r.key] })).filter(r => (Array.isArray(r.value) ? r.value.length > 0 : r.value && r.value.trim() !== '' && r.value.trim() !== '-'))
  return (
    <Box flexDirection="column">
      {rows.map(r => (
        <Box key={r.key} flexDirection="column">
          <Text dimColor bold>
            {r.label}
          </Text>
          {(Array.isArray(r.value) ? r.value.slice(0, 6) : [r.value]).map((line, i) => (
            <Text key={`${r.key}-${i}`}>
              {'  '}
              {line}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

function Decision({ ui, run, now, ctl, isElsewhere }: { ui: Ui; run: Run; now: number; ctl: Ctl; isElsewhere?: boolean }) {
  const { Box, Text } = ui
  const s = stage(run, now)
  const kind = kindOf(run, s)
  const extra = context(run)
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="round" borderColor={isElsewhere ? 'inactive' : KIND_COLOR[kind]}>
      <Box justifyContent="space-between">
        <Text color={KIND_COLOR[kind]} bold>
          {KIND_LABEL[kind]}
        </Text>
        <Text dimColor>{ago(run.activeAt, now)}</Text>
      </Box>
      <Text bold>{ask(run, s)}</Text>
      {isElsewhere ? (
        <Text dimColor>Waiting in {whereLabel(run)}</Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          {run.project}
          {extra !== '' ? `  ${extra}` : ''}
        </Text>
      )}
      <Buttons ui={ui} run={run} list={isElsewhere ? hereActions(run, s) : actions(run, s)} ctl={ctl} now={now} />
      {ctl.expanded.includes(reportKey(run.id)) && <Report ui={ui} report={run.report} />}
    </Box>
  )
}

function AgentLine({ ui, agent, isLast, now }: { ui: Ui; agent: Subagent; isLast: boolean; now: number }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text wrap="truncate-end" dimColor={!agent.isRunning}>
          <Text dimColor>{isLast ? '└ ' : '├ '}</Text>
          <Text color={agent.isRunning ? 'permission' : 'success'}>{agent.isRunning ? '●' : '✓'}</Text> {agent.description}
        </Text>
        <Text dimColor> {role(agent.type)}</Text>
      </Box>
      <Text dimColor wrap="truncate-end">
        {isLast ? '    ' : '│   '}
        {agent.isRunning ? agent.doing || 'working' : `done ${ago(agent.activeAt, now)}`}
      </Text>
    </Box>
  )
}

function Moving({ ui, run, now, ctl }: { ui: Ui; run: Run; now: number; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  const s = stage(run, now)
  const quiet = isQuiet(s)
  const isOpen = ctl.expanded.includes(run.id)
  const live = run.agents.filter(a => a.isRunning)
  const shown = isOpen ? [...live, ...run.agents.filter(a => !a.isRunning)] : live.slice(0, SHOWN_AGENTS)
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold wrap="truncate-end">
          <Text color={quiet ? 'warning' : 'permission'}>●</Text> {run.slug}
          <Text dimColor bold={false}> {run.project}</Text>
        </Text>
        <Text color={quiet ? 'warning' : undefined} dimColor={!quiet}>
          {quiet ? `quiet for ${since(run.activeAt, now)}` : ago(run.activeAt, now)}
        </Text>
      </Box>
      {run.doing !== '' && (
        <Text dimColor wrap="truncate-end">
          {run.doing}
        </Text>
      )}
      {run.agents.length > 0 && <Text dimColor>{live.length > 0 ? `${live.length} of ${run.agents.length} agents working` : `${run.agents.length} agents done`}</Text>}
      {shown.map((a, i) => (
        <AgentLine key={a.id} ui={ui} agent={a} isLast={i === shown.length - 1} now={now} />
      ))}
      {run.agents.length > shown.length || isOpen ? (
        <Box>
          <Button key={`${run.id}-more`} label={isOpen ? 'Show less' : `Show all ${run.agents.length} agents`} onPress={() => ctl.toggle(run.id)} />
        </Box>
      ) : null}
    </Box>
  )
}

export function TerminalBoard({ ui, snap, now, ctl }: { ui: Ui; snap: Snapshot; now: number; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  const { decide, moving, done } = split(snap.runs, now)
  const elsewhere = split(snap.theirs, now).decide
  const live = moving.flatMap(r => r.agents).filter(a => a.isRunning).length
  const quietTheirs = snap.theirs.filter(r => !elsewhere.includes(r))
  const rest = [...done, ...quietTheirs]
  return (
    <Box flexDirection="column">
      <Text bold>{decide.length > 0 ? `${decide.length} waiting on you` : 'Nothing waiting on you'}</Text>
      <Text dimColor>{moving.length > 0 ? `${moving.length} in progress${live > 0 ? `, ${live} agents working` : ''}` : snap.runs.length > 0 ? 'All workers idle' : 'No runs from this session yet'}</Text>
      {decide.map(run => (
        <Decision key={run.id} ui={ui} run={run} now={now} ctl={ctl} />
      ))}
      {elsewhere.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Waiting in other sessions
          </Text>
          {elsewhere.map(run => (
            <Decision key={run.id} ui={ui} run={run} now={now} ctl={ctl} isElsewhere />
          ))}
        </Box>
      )}
      {moving.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            In progress
          </Text>
          {moving.map(run => (
            <Moving key={run.id} ui={ui} run={run} now={now} ctl={ctl} />
          ))}
        </Box>
      )}
      {rest.length > 0 && (
        <Box marginTop={1} gap={1}>
          <Text dimColor>{[done.length > 0 ? `${done.length} done` : '', quietTheirs.length > 0 ? `${quietTheirs.length} running in other sessions` : ''].filter(Boolean).join(', ')}</Text>
          <Button key="theirs" label={ctl.showTheirs ? 'Hide' : 'Show'} onPress={() => ctl.setShowTheirs(!ctl.showTheirs)} />
        </Box>
      )}
      {ctl.showTheirs &&
        rest.map(run => (
          <Box key={run.id} justifyContent="space-between" paddingX={1}>
            <Text wrap="truncate-end">
              <Text color="success">✓</Text> {run.slug}
              <Text dimColor> {run.doing || run.project}</Text>
            </Text>
            <Text dimColor> {ago(run.activeAt, now)}</Text>
          </Box>
        ))}
    </Box>
  )
}

export function TerminalDecisionRow({ ui, run, now, ctl }: { ui: Ui; run: Run; now: number; ctl: Ctl }) {
  const { Box, Text } = ui
  const s = stage(run, now)
  const kind = kindOf(run, s)
  return (
    <Box justifyContent="space-between" flexGrow={1} gap={1}>
      <Text wrap="truncate-end">
        <Text color={KIND_COLOR[kind]} bold>
          {KIND_LABEL[kind]}
        </Text>{' '}
        <Text bold>{ask(run, s)}</Text>
        <Text dimColor>
          {'  '}
          {run.project} {ago(run.activeAt, now)}
        </Text>
      </Text>
      <Buttons ui={ui} run={run} list={actions(run, s)} ctl={ctl} now={now} keyPrefix="bar-" />
    </Box>
  )
}
