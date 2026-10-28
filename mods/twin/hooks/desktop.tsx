import type { RenderChildren } from 'claude-code'

import type { ReportSummary, Run, Snapshot, Subagent } from '../types'
import { KIND_LABEL, REPORT_ROWS, actions, ago, ask, bandFacts, context, hereActions, isQuiet, kindOf, press, reportKey, role, sentFor, since, split, stage, whereLabel, type Action, type Ctl, type Kind, type Ui } from './model.ts'

export type { Ctl } from './model.ts'

const LIVE = '#8B7CF6'
const QUIET = '#E6A23C'
const IDLE = 'rgba(128,128,128,0.55)'
const GUIDE = 'rgba(128,128,128,0.32)'
const RIM = 'rgba(0,0,0,0.28)'
const PALETTE = ['#6E7BF2', '#2BA59A', '#E07A5F', '#C2649A', '#5B8DEF', '#8C7AE6', '#3FA35B', '#C99A2E']
const SHOWN_AGENTS = 3
const MAX_BARS = 2

const KIND: Record<Kind, { hex: string }> = {
  approve: { hex: '#8B7CF6' },
  question: { hex: '#4FA3FF' },
  ship: { hex: '#3DB37A' },
  stuck: { hex: '#EF6461' },
}



const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
const hueOf = (name: string) => PALETTE[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length]!
const tint = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
const pulse = (cx: number, cy: number, r: number, hex: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${hex}" stroke-width="1.5"><animate attributeName="r" values="${r};${r + 5}" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="1.8s" repeatCount="indefinite"/></circle>`


function initials(name: string) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('')
}

const monogram = (name: string, size: number) =>
  svg(size, size, `<rect width="${size}" height="${size}" rx="${size / 4}" fill="${hueOf(name)}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="-apple-system, system-ui, sans-serif" font-size="${size * 0.42}" font-weight="600" fill="#fff">${esc(initials(name))}</text>`)

function avatar(a: Subagent, cx: number, r: number, isLead: boolean) {
  const cy = r + 3
  const halo = a.isRunning && isLead ? pulse(cx, cy, r, LIVE) : ''
  return `${halo}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${a.isRunning ? hueOf(a.id + a.description) : 'rgba(128,128,128,0.35)'}" stroke="${a.isRunning ? LIVE : RIM}" stroke-width="${a.isRunning ? 1.6 : 1.2}"/>`
}

function presence(agents: Subagent[], r = 9, max = 6) {
  const ordered = [...agents].sort((a, b) => Number(b.isRunning) - Number(a.isRunning))
  const shown = ordered.slice(0, max)
  const step = r * 1.45
  const extra = agents.length - shown.length
  const w = Math.ceil((shown.length - 1) * step + r * 2 + 6 + (extra > 0 ? r * 2.4 : 0))
  const more = extra > 0 ? `<text x="${(shown.length - 1) * step + r * 2 + 8}" y="${r + 3}" dy="0.35em" font-family="-apple-system, system-ui, sans-serif" font-size="${r}" font-weight="600" fill="#9A9893">+${extra}</text>` : ''
  return { source: svg(w, r * 2 + 6, shown.map((a, i) => avatar(a, r + 3 + i * step, r, i === 0)).reverse().join('') + more), width: w, height: r * 2 + 6 }
}

function branch(isLast: boolean, isRunning: boolean) {
  const hex = isRunning ? LIVE : IDLE
  return svg(24, 44, `<path d="M7 0V${isLast ? 22 : 44}M7 22H14" stroke="${GUIDE}" stroke-width="1.4" fill="none" stroke-linecap="round"/>${isRunning ? pulse(18, 22, 3.2, hex) : ''}<circle cx="18" cy="22" r="3.2" fill="${hex}"/>`)
}

const pip = (hex: string, isPulsing = false) => svg(16, 16, `${isPulsing ? pulse(8, 8, 3.5, hex) : ''}<circle cx="8" cy="8" r="3.5" fill="${hex}"/>`)








function ReportBlock({ ui, report }: { ui: Ui; report: ReportSummary | null | undefined }) {
  const { Box, Text } = ui
  if (!report) {
    return (
      <Text size="footnote" color="inactive">
        No report yet: the worker has not finished a turn.
      </Text>
    )
  }
  const rows = REPORT_ROWS.map(r => ({ ...r, value: report[r.key] })).filter(r => (Array.isArray(r.value) ? r.value.length > 0 : r.value && r.value.trim() !== '' && r.value.trim() !== '-'))
  return (
    <Box flexDirection="column" gap="sm" paddingTop="xs" minWidth={0}>
      {rows.map(r => (
        <Box key={r.key} flexDirection="column" minWidth={0}>
          <Text size="caption" weight="semibold" color="inactive">
            {r.label}
          </Text>
          {Array.isArray(r.value) ? (
            r.value.slice(0, 6).map((line, i) => (
              <Text key={`${r.key}-${i}`} size="footnote" color="subtle">
                {line}
              </Text>
            ))
          ) : (
            <Text size="footnote" color="subtle">
              {r.value}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}

function Buttons({ ui, run, list, ctl, now, keyPrefix = '' }: { ui: Ui; run: Run; list: Action[]; ctl: Ctl; now: number; keyPrefix?: string }) {
  const { Box, Button, Text } = ui
  const isOpen = ctl.expanded.includes(reportKey(run.id))
  const sent = sentFor(run, ctl, now)
  if (sent) {
    return (
      <Text size="footnote" color="inactive">
        Sent: {sent.label}. Waiting for {ctl.name}
      </Text>
    )
  }
  return (
    <Box gap="sm" flexWrap="wrap">
      {list.map(b => (
        <Button
          key={`${keyPrefix}${run.id}-${b.label}`}
          variant={b.isPrimary && !(b.isReport && isOpen) ? 'primary' : 'secondary'}
          label={b.isReport && isOpen ? 'Hide report' : b.label}
          onPress={() => press(ctl, run, b)}
        />
      ))}
    </Box>
  )
}



function Elsewhere({ ui, run, now, ctl }: { ui: Ui; run: Run; now: number; ctl: Ctl }) {
  const { Box, Text } = ui
  const s = stage(run, now)
  const kind = kindOf(run, s)
  return (
    <Box flexDirection="column" gap="sm" padding="md" minWidth={0} borderStyle="round" borderColor="rgba(128,128,128,0.22)">
      <Box flexDirection="column" gap="xs" minWidth={0}>
        <Box gap="sm" minWidth={0}>
          <Text size="caption" weight="semibold" color={KIND[kind].hex}>
            {KIND_LABEL[kind]}
          </Text>
          <Text size="caption" color="inactive" wrap="truncate-end">
            {ago(run.activeAt, now)}
          </Text>
        </Box>
        <Text size="footnote" weight="semibold">
          {ask(run, s)}
        </Text>
        <Text size="caption" color="subtle">
          Waiting in {whereLabel(run)}
        </Text>
      </Box>
      <Buttons ui={ui} run={run} list={hereActions(run, s)} ctl={ctl} now={now} />
      {ctl.expanded.includes(reportKey(run.id)) && <ReportBlock ui={ui} report={run.report} />}
    </Box>
  )
}

function Decision({ ui, run, now, ctl }: { ui: Ui; run: Run; now: number; ctl: Ctl }) {
  const { Box, Text } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  const s = stage(run, now)
  const kind = kindOf(run, s)
  const extra = context(run)
  return (
    <Box flexDirection="column" padding="md" minWidth={0} borderStyle="round" borderColor={tint(KIND[kind].hex, 0.28)} backgroundColor={tint(KIND[kind].hex, 0.045)} hover={{ backgroundColor: tint(KIND[kind].hex, 0.08), scope: `d-${run.id}` }}>
      <Box flexDirection="column" gap="sm" minWidth={0}>
        <Box flexDirection="column" gap="xs" minWidth={0}>
          <Text size="caption" weight="semibold" color={KIND[kind].hex}>
            {KIND_LABEL[kind]}
          </Text>
          <Text size="body" weight="semibold">
            {ask(run, s)}
          </Text>
          {extra !== '' && (
            <Text size="footnote" color="subtle">
              {extra}
            </Text>
          )}
          <Box alignItems="center" gap="sm" minWidth={0}>
            {Svg && <Svg source={monogram(run.project, 16)} alt={run.project} width={16} height={16} />}
            <Box flexShrink={1} minWidth={0}>
              <Text size="caption" color="inactive" wrap="truncate-end">
                {run.project}
              </Text>
            </Box>
            <Text size="caption" color="inactive">
              {ago(run.activeAt, now)}
            </Text>
            {run.agents.length > 0 && Svg && <Svg {...presence(run.agents, 7, 4)} alt={`${run.agents.length} agents`} />}
          </Box>
        </Box>
        <Buttons ui={ui} run={run} list={actions(run, s)} ctl={ctl} now={now} />
        {ctl.expanded.includes(reportKey(run.id)) && <ReportBlock ui={ui} report={run.report} />}
      </Box>
    </Box>
  )
}

function AgentRow({ ui, agent, isLast, now }: { ui: Ui; agent: Subagent; isLast: boolean; now: number }) {
  const { Box, Text } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  return (
    <Box alignItems="center" gap="sm" minWidth={0}>
      {Svg && <Svg source={branch(isLast, agent.isRunning)} alt={agent.isRunning ? 'working' : 'done'} width={24} height={44} isInteractive={agent.isRunning || undefined} />}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text size="footnote" weight={agent.isRunning ? 'medium' : 'regular'} color={agent.isRunning ? 'text' : 'inactive'} wrap="truncate-end">
          {agent.description}
        </Text>
        <Text size="caption" color="inactive" wrap="truncate-end">
          {agent.isRunning ? agent.doing || 'working' : `done ${ago(agent.activeAt, now)}`}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text size="caption" color="inactive" wrap="truncate">
          {role(agent.type)}
        </Text>
      </Box>
    </Box>
  )
}

function Moving({ ui, run, now, ctl }: { ui: Ui; run: Run; now: number; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  const s = stage(run, now)
  const quiet = isQuiet(s)
  const isOpen = ctl.expanded.includes(run.id)
  const live = run.agents.filter(a => a.isRunning)
  const finished = run.agents.filter(a => !a.isRunning)
  const shown = isOpen ? [...live, ...finished] : live.slice(0, SHOWN_AGENTS)
  const hidden = run.agents.length - shown.length
  return (
    <Box flexDirection="column" gap="sm" padding="md" minWidth={0} borderStyle="round" borderColor="rgba(128,128,128,0.16)" hover={{ borderColor: 'rgba(128,128,128,0.3)', scope: `m-${run.id}` }}>
      <Box alignItems="center" gap="sm" minWidth={0}>
        {Svg && <Svg source={monogram(run.project, 28)} alt={run.project} width={28} height={28} />}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="footnote" weight="semibold" wrap="truncate-end">
            {run.slug}
          </Text>
          <Text size="caption" color="inactive" wrap="truncate-end">
            {run.project}
          </Text>
        </Box>
        <Box alignItems="center" gap="xs" flexShrink={0}>
          {Svg && <Svg source={pip(quiet ? QUIET : LIVE, !quiet)} alt={quiet ? 'quiet' : 'working'} width={16} height={16} isInteractive={!quiet || undefined} />}
          <Text size="caption" color={quiet ? QUIET : 'inactive'}>
            {quiet ? `quiet for ${since(run.activeAt, now)}` : ago(run.activeAt, now)}
          </Text>
        </Box>
      </Box>
      {run.doing !== '' && (
        <Text size="footnote" color="subtle" wrap={isOpen ? 'wrap' : 'truncate-end'}>
          {run.doing}
        </Text>
      )}
      {run.agents.length > 0 && (
        <Box alignItems="center" gap="sm">
          {Svg && <Svg {...presence(run.agents)} alt={`${run.agents.length} agents`} isInteractive={live.length > 0 || undefined} />}
          <Text size="caption" color="inactive">
            {live.length > 0 ? `${live.length} of ${run.agents.length} agents working` : `${run.agents.length} agents done`}
          </Text>
        </Box>
      )}
      {shown.length > 0 && (
        <Box flexDirection="column" minWidth={0}>
          {shown.map((a, i) => (
            <AgentRow key={a.id} ui={ui} agent={a} isLast={i === shown.length - 1} now={now} />
          ))}
        </Box>
      )}
      {(hidden > 0 || isOpen) && run.agents.length > 0 && (
        <Box>
          <Button key={`${run.id}-more`} variant="secondary" label={isOpen ? 'Show less' : `Show all ${run.agents.length} agents`} onPress={() => ctl.toggle(run.id)} />
        </Box>
      )}
    </Box>
  )
}

function Line({ ui, run, now }: { ui: Ui; run: Run; now: number }) {
  const { Box, Text } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  return (
    <Box alignItems="center" gap="sm" paddingY="xs" minWidth={0}>
      {Svg && <Svg source={monogram(run.project, 20)} alt={run.project} width={20} height={20} />}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text size="footnote" weight="medium" wrap="truncate-end">
          {run.slug}
        </Text>
        <Text size="caption" color="inactive" wrap="truncate-end">
          {run.doing || run.project}
        </Text>
      </Box>
      <Text size="caption" color="inactive">
        {ago(run.activeAt, now)}
      </Text>
    </Box>
  )
}

function Facts({ ui, items, size }: { ui: Ui; items: string[]; size: 'caption' | 'footnote' }) {
  const { Box, Text } = ui
  return (
    <Box gap="md" flexWrap="wrap" flexShrink={1} minWidth={0}>
      {items.filter(Boolean).map(item => (
        <Text key={item} size={size} color="inactive" wrap="truncate">
          {item}
        </Text>
      ))}
    </Box>
  )
}


export function DesktopBoard({ ui, snap, now, ctl }: { ui: Ui; snap: Snapshot; now: number; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  const { decide, moving, done } = split(snap.runs, now)
  const elsewhere = split(snap.theirs, now).decide
  const agents = moving.flatMap(r => r.agents)
  const live = agents.filter(a => a.isRunning).length
  const quietTheirs = snap.theirs.filter(r => !elsewhere.includes(r))
  const rest = [...done, ...quietTheirs]
  return (
    <Box flexDirection="column" gap="lg" padding="md" minWidth={0}>
      <Box flexDirection="column" gap="sm">
        <Text size="title" weight="semibold">
          {decide.length > 0 ? `${decide.length} waiting on you` : 'Nothing waiting on you'}
        </Text>
        <Box alignItems="center" gap="sm" flexWrap="wrap" minWidth={0}>
          {Svg && agents.length > 0 && <Svg {...presence(agents, 9, 7)} alt={`${live} agents working`} isInteractive={live > 0 || undefined} />}
          <Text size="footnote" color="subtle">
            {moving.length > 0 ? `${moving.length} in progress${live > 0 ? `, ${live} agents working` : ''}` : snap.runs.length > 0 ? 'All workers idle' : 'No runs from this session yet'}
          </Text>
        </Box>
      </Box>
      {decide.length > 0 && (
        <Box flexDirection="column" gap="sm">
          {decide.map(run => (
            <Decision key={run.id} ui={ui} run={run} now={now} ctl={ctl} />
          ))}
        </Box>
      )}
      {elsewhere.length > 0 && (
        <Box flexDirection="column" gap="sm">
          <Text size="footnote" weight="semibold" color="subtle">
            Waiting in other sessions
          </Text>
          {elsewhere.map(run => (
            <Elsewhere key={run.id} ui={ui} run={run} now={now} ctl={ctl} />
          ))}
        </Box>
      )}
      {moving.length > 0 && (
        <Box flexDirection="column" gap="sm">
          <Text size="footnote" weight="semibold" color="subtle">
            In progress
          </Text>
          {moving.map(run => (
            <Moving key={run.id} ui={ui} run={run} now={now} ctl={ctl} />
          ))}
        </Box>
      )}
      {rest.length > 0 && (
        <Box justifyContent="space-between" alignItems="center" gap="sm">
          <Facts ui={ui} size="footnote" items={[done.length > 0 ? `${done.length} done` : '', quietTheirs.length > 0 ? `${quietTheirs.length} running in other sessions` : '']} />
          <Button key="theirs" variant="secondary" label={ctl.showTheirs ? 'Hide' : 'Show'} onPress={() => ctl.setShowTheirs(!ctl.showTheirs)} />
        </Box>
      )}
      {ctl.showTheirs && rest.map(run => <Line key={run.id} ui={ui} run={run} now={now} />)}
    </Box>
  )
}

const RAINBOW = [0xff7a90, 0xffb36b, 0xf4e07a, 0x6fe3a5, 0x64c8ff, 0x8f86ff, 0xe489ff]
const STRIP_SEGMENTS = 36
const STRIP_H = 0.12
const STRIP_W = 0.25
const hex6 = (n: number) => `#${n.toString(16).padStart(6, '0')}`

function rainbowAt(t: number) {
  const at = Math.min(0.9999, Math.max(0, t)) * (RAINBOW.length - 1)
  const i = Math.floor(at)
  const f = at - i
  const a = RAINBOW[i]!
  const b = RAINBOW[i + 1]!
  return hex6([16, 8, 0].reduce((c, sh) => c | (Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * f) << sh), 0))
}

function Strip({ ui, id }: { ui: Ui; id: string }) {
  const { Box } = ui
  return (
    <Box height={STRIP_H} flexGrow={1} minWidth={0}>
      {Array.from({ length: STRIP_SEGMENTS }, (_, i) => (
        <Box key={`${id}-${i}`} flexGrow={1} flexShrink={1} minWidth={0} height={STRIP_H} backgroundColor={rainbowAt(i / (STRIP_SEGMENTS - 1))} />
      ))}
    </Box>
  )
}

const CORNER = 14
const LINE = 2.2

function corner(at: 'tl' | 'tr' | 'bl' | 'br', hex: string) {
  const r = CORNER - LINE / 2
  const o = LINE / 2
  const d = {
    tl: `M${o} ${CORNER}A${r} ${r} 0 0 1 ${CORNER} ${o}`,
    tr: `M0 ${o}A${r} ${r} 0 0 1 ${CORNER - o} ${CORNER}`,
    bl: `M${o} 0A${r} ${r} 0 0 0 ${CORNER} ${CORNER - o}`,
    br: `M0 ${CORNER - o}A${r} ${r} 0 0 0 ${CORNER - o} 0`,
  }[at]
  return svg(CORNER, CORNER, `<path d="${d}" fill="none" stroke="${hex}" stroke-width="${LINE}"/>`)
}

function Edge({ ui, at }: { ui: Ui; at: 'top' | 'bottom' }) {
  const { Box } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  const [left, right] = at === 'top' ? (['tl', 'tr'] as const) : (['bl', 'br'] as const)
  return (
    <Box alignItems={at === 'top' ? 'flex-start' : 'flex-end'} minWidth={0}>
      {Svg && <Svg source={corner(left, rainbowAt(0))} alt="frame corner" width={CORNER} height={CORNER} />}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Strip ui={ui} id={at} />
      </Box>
      {Svg && <Svg source={corner(right, rainbowAt(1))} alt="frame corner" width={CORNER} height={CORNER} />}
    </Box>
  )
}

function RainbowFrame({ ui, children }: { ui: Ui; children: RenderChildren }) {
  const { Box } = ui
  return (
    <Box flexDirection="column" minWidth={0}>
      <Edge ui={ui} at="top" />
      <Box minWidth={0}>
        <Box width={STRIP_W} flexShrink={0} backgroundColor={rainbowAt(0)} />
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          {children}
        </Box>
        <Box width={STRIP_W} flexShrink={0} backgroundColor={rainbowAt(1)} />
      </Box>
      <Edge ui={ui} at="bottom" />
    </Box>
  )
}

export function DesktopBand({ ui, snap, now, ctl, open }: { ui: Ui; snap: Snapshot; now: number; ctl: Ctl; open: () => void }) {
  const { Box, Text, Button } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  const { decide, moving } = split(snap.runs, now)
  const agents = moving.flatMap(r => r.agents)
  const live = agents.filter(a => a.isRunning).length
  return (
    <Box flexDirection="column" gap="xs" minWidth={0}>
      {decide.slice(0, MAX_BARS).map(run => {
        const s = stage(run, now)
        const kind = kindOf(run, s)
        return (
          <Box key={run.id} alignItems="center" justifyContent="space-between" gap="md" paddingX="sm" paddingY="sm" minWidth={0} borderStyle="round" borderColor={tint(KIND[kind].hex, 0.3)} backgroundColor={tint(KIND[kind].hex, 0.05)}>
            <Box alignItems="center" gap="sm" flexShrink={1} minWidth={0}>
              <Box flexDirection="column" flexShrink={1} minWidth={0}>
                <Box gap="sm" minWidth={0}>
                  <Text size="footnote" weight="semibold" color={KIND[kind].hex}>
                    {KIND_LABEL[kind]}
                  </Text>
                  <Text size="footnote" weight="semibold" wrap="truncate-end">
                    {ask(run, s)}
                  </Text>
                </Box>
                <Box gap="sm" minWidth={0}>
                  <Text size="caption" color="inactive" wrap="truncate-end">
                    {run.project}
                  </Text>
                  <Text size="caption" color="inactive">
                    {ago(run.activeAt, now)}
                  </Text>
                </Box>
              </Box>
            </Box>
            <Box flexShrink={0}>
              <Buttons ui={ui} run={run} list={actions(run, s)} ctl={ctl} now={now} keyPrefix="bar-" />
            </Box>
          </Box>
        )
      })}
      <RainbowFrame ui={ui}>
      <Box alignItems="center" justifyContent="space-between" gap="md" paddingX="sm" paddingY="xs" minWidth={0}>
        <Box alignItems="center" gap="sm" flexShrink={1} minWidth={0}>
          <Text size="footnote" weight="semibold">
            {snap.name}
          </Text>
          {Svg && agents.length > 0 && <Svg {...presence(agents, 8, 6)} alt={`${live} agents working`} isInteractive={live > 0 || undefined} />}
          <Facts ui={ui} size="caption" items={bandFacts(snap, now, MAX_BARS)} />
        </Box>
        <Button key="open" variant="secondary" label="Open" onPress={open} />
      </Box>
      </RainbowFrame>
    </Box>
  )
}
