import type { Color, RenderChildren } from 'claude-code'

import type { Run } from '../types'
import { COPY, DOT, buttonLabel, isReportOpen, press, reportRows, sentNote, type Action, type Band, type Board, type Card, type Ctl, type Fact, type Progress, type Ui } from './model.ts'

const RAINBOW = [0xff7a90, 0xffb36b, 0xf4e07a, 0x6fe3a5, 0x64c8ff, 0x8f86ff, 0xe489ff] as const
const LOOP_STEPS = 48
const SPAN = (RAINBOW.length - 1) / RAINBOW.length
const DEFAULT_COLOR = 0x01000000

const channel = (color: number, shift: number) => (color >> shift) & 0xff
const mix = (a: number, b: number, t: number) => [16, 8, 0].reduce((color, shift) => color | (Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t) << shift), 0)

function colorAt(position: number) {
  const at = (((position % 1) + 1) % 1) * RAINBOW.length
  const stop = Math.floor(at)
  return mix(RAINBOW[stop]!, RAINBOW[(stop + 1) % RAINBOW.length]!, at - stop)
}

const hueAt = (x: number, width: number): Color => `#${colorAt(width <= 1 ? 0 : (x / (width - 1)) * SPAN).toString(16).padStart(6, '0')}`

function cells(text: string, from: number, of: number, step: number) {
  const words = new Uint32Array(text.length * 3)
  ;[...text].forEach((char, i) => {
    const x = from + i
    words.set([char.codePointAt(0)!, colorAt(-step / LOOP_STEPS + (of === 1 ? 0 : (x / (of - 1)) * SPAN)), DEFAULT_COLOR], i * 3)
  })
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

const top = (width: number) => `╭${'─'.repeat(Math.max(0, width - 2))}╮`
const bottom = (width: number) => `╰${'─'.repeat(Math.max(0, width - 2))}╯`

export const nextStep = (step: number) => (step + 1) % LOOP_STEPS

export function frameBlits(width: number, rows: number, step: number) {
  return [
    { key: 'twin-top', cells: cells(top(width), 0, width, step) },
    { key: 'twin-bottom', cells: cells(bottom(width), 0, width, step) },
    ...Array.from({ length: rows }, (_, i) => [
      { key: `twin-left-${i}`, cells: cells('│', 0, width, step) },
      { key: `twin-right-${i}`, cells: cells('│', width - 1, width, step) },
    ]).flat(),
  ]
}

function Frame({ ui, width, step, rows }: { ui: Ui; width: number; step: number; rows: { key: string; body: RenderChildren }[] }) {
  const { Box, Text } = ui
  const Raster = 'Raster' in ui ? ui.Raster : null
  const rule = (key: string, text: string) =>
    Raster ? (
      <Raster key={key} columns={width} rows={1} cells={cells(text, 0, width, step)} />
    ) : (
      <Text key={key}>
        {[...text].map((c, x) => (
          <Text key={`${key}-${x}`} color={hueAt(x, width)}>
            {c}
          </Text>
        ))}
      </Text>
    )
  const side = (key: string, x: number) =>
    Raster ? (
      <Raster key={key} columns={1} rows={1} cells={cells('│', x, width, step)} />
    ) : (
      <Text key={key} color={hueAt(x, width)}>
        │
      </Text>
    )
  return (
    <Box flexDirection="column" width={width}>
      {rule('twin-top', top(width))}
      {rows.map((row, i) => (
        <Box key={row.key}>
          {side(`twin-left-${i}`, 0)}
          <Text> </Text>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            {row.body}
          </Box>
          <Text> </Text>
          {side(`twin-right-${i}`, width - 1)}
        </Box>
      ))}
      {rule('twin-bottom', bottom(width))}
    </Box>
  )
}

function Buttons({ ui, run, list, ctl, now, keyPrefix = '' }: { ui: Ui; run: Run; list: Action[]; ctl: Ctl; now: number; keyPrefix?: string }) {
  const { Box, Button, Text } = ui
  const sent = sentNote(run, ctl, now)
  if (sent) return <Text dimColor>{sent}</Text>
  return (
    <Box gap={1} flexShrink={0}>
      {list.map(b => (
        <Button key={`${keyPrefix}${run.id}-${b.label}`} variant={b.isPrimary ? 'primary' : 'secondary'} label={buttonLabel(ctl, run, b)} onPress={() => press(ctl, run, b)} />
      ))}
    </Box>
  )
}

function Report({ ui, run }: { ui: Ui; run: Run }) {
  const { Box, Text } = ui
  const rows = reportRows(run.report)
  if (!rows) return <Text dimColor>{COPY.noReport}</Text>
  return (
    <Box flexDirection="column">
      {rows.map(r => (
        <Box key={r.key} flexDirection="column">
          <Text dimColor bold>
            {r.label}
          </Text>
          {r.lines.map((line, i) => (
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

function Facts({ ui, facts }: { ui: Ui; facts: Fact[] }) {
  const { Text } = ui
  return (
    <Text wrap="truncate-end">
      {facts.map((f, i) => (
        <Text key={f.text} bold={f.isStrong} dimColor={!f.isStrong}>
          {i > 0 ? ' · ' : ''}
          {f.text}
        </Text>
      ))}
    </Text>
  )
}

function Status({ ui, band, name, open }: { ui: Ui; band: Band; name: string; open: () => void }) {
  const { Box, Button, Text } = ui
  return (
    <Box justifyContent="space-between" flexGrow={1} gap={2}>
      <Button key="open" plain label={`${COPY.open} ${name}`} onPress={open}>
        <Text color={band.isLive ? DOT.live : DOT.idle}>●</Text> <Text bold>{name}</Text>
      </Button>
      <Facts ui={ui} facts={band.facts} />
    </Box>
  )
}

function BandRow({ ui, card, ctl, now }: { ui: Ui; card: Card; ctl: Ctl; now: number }) {
  const { Box, Text } = ui
  return (
    <Box justifyContent="space-between" flexGrow={1} gap={1}>
      <Text wrap="truncate-end">
        <Text color={card.color} bold>
          {card.label}
        </Text>
        {'  '}
        <Text bold>{card.ask}</Text>
        <Text dimColor>
          {'  '}
          {card.meta}
        </Text>
      </Text>
      <Buttons ui={ui} run={card.run} list={card.actions} ctl={ctl} now={now} keyPrefix="bar-" />
    </Box>
  )
}

export function TerminalBand({ ui, band, ctl, now, name, width, step, open }: { ui: Ui; band: Band; ctl: Ctl; now: number; name: string; width: number; step: number; open: () => void }) {
  const { Box } = ui
  const status = <Status ui={ui} band={band} name={name} open={open} />
  if (band.cards.length === 0) return <Frame ui={ui} width={width} step={step} rows={[{ key: 'status', body: status }]} />
  return (
    <Box flexDirection="column" width={width}>
      <Frame ui={ui} width={width} step={step} rows={band.cards.map(card => ({ key: `row-${card.key}`, body: <BandRow ui={ui} card={card} ctl={ctl} now={now} /> }))} />
      <Box paddingX={2}>{status}</Box>
    </Box>
  )
}

export const frameRows = (band: Band) => Math.max(1, band.cards.length)

function CardBox({ ui, card, ctl, now, isElsewhere = false }: { ui: Ui; card: Card; ctl: Ctl; now: number; isElsewhere?: boolean }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="round" borderColor={isElsewhere ? 'inactive' : card.color}>
      <Box justifyContent="space-between" gap={1}>
        <Text color={card.color} bold>
          {card.label}
        </Text>
        <Text dimColor wrap="truncate-end">
          {card.meta}
        </Text>
      </Box>
      <Text bold>{card.ask}</Text>
      {card.detail !== '' && (
        <Text dimColor wrap="truncate-end">
          {card.detail}
        </Text>
      )}
      <Buttons ui={ui} run={card.run} list={card.actions} ctl={ctl} now={now} />
      {isReportOpen(ctl, card.run) && <Report ui={ui} run={card.run} />}
    </Box>
  )
}

function Moving({ ui, p, ctl }: { ui: Ui; p: Progress; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Box justifyContent="space-between" gap={1}>
        <Text bold wrap="truncate-end">
          <Text color={p.isQuiet ? DOT.quiet : DOT.live}>●</Text> {p.run.slug}
          <Text dimColor bold={false}> {p.run.project}</Text>
        </Text>
        <Text color={p.isQuiet ? DOT.quiet : undefined} dimColor={!p.isQuiet}>
          {p.age}
        </Text>
      </Box>
      {p.doing !== '' && (
        <Text dimColor wrap="truncate-end">
          {p.doing}
        </Text>
      )}
      {p.agentsLine !== '' && <Text dimColor>{p.agentsLine}</Text>}
      {p.agents.map((a, i) => {
        const isLast = i === p.agents.length - 1
        return (
          <Box key={a.id} flexDirection="column">
            <Box justifyContent="space-between" gap={1}>
              <Text wrap="truncate-end" dimColor={!a.isRunning}>
                <Text dimColor>{isLast ? '└ ' : '├ '}</Text>
                <Text color={a.isRunning ? DOT.live : DOT.idle}>{a.isRunning ? '●' : '✓'}</Text> {a.description}
              </Text>
              <Text dimColor>{a.role}</Text>
            </Box>
            <Text dimColor wrap="truncate-end">
              {isLast ? '    ' : '│   '}
              {a.status}
            </Text>
          </Box>
        )
      })}
      {p.more && (
        <Box>
          <Button key={`${p.run.id}-more`} label={p.more} onPress={() => ctl.toggle(p.run.id)} />
        </Box>
      )}
    </Box>
  )
}

export function TerminalBoard({ ui, board, now, ctl }: { ui: Ui; board: Board; now: number; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column">
      <Text bold>{board.title}</Text>
      <Text dimColor>{board.summary}</Text>
      {board.decide.map(card => (
        <CardBox key={card.key} ui={ui} card={card} ctl={ctl} now={now} />
      ))}
      {board.elsewhere.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            {COPY.elsewhere}
          </Text>
          {board.elsewhere.map(card => (
            <CardBox key={card.key} ui={ui} card={card} ctl={ctl} now={now} isElsewhere />
          ))}
        </Box>
      )}
      {board.moving.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            {COPY.moving}
          </Text>
          {board.moving.map(p => (
            <Moving key={p.run.id} ui={ui} p={p} ctl={ctl} />
          ))}
        </Box>
      )}
      {board.rest.length > 0 && (
        <Box marginTop={1} gap={1}>
          <Text dimColor>{board.footer}</Text>
          <Button key="theirs" label={ctl.showTheirs ? COPY.hide : COPY.show} onPress={() => ctl.setShowTheirs(!ctl.showTheirs)} />
        </Box>
      )}
      {ctl.showTheirs &&
        board.rest.map(line => (
          <Box key={line.run.id} justifyContent="space-between" paddingX={1} gap={1}>
            <Text wrap="truncate-end">
              <Text color={DOT.live}>✓</Text> {line.run.slug}
              <Text dimColor> {line.detail}</Text>
            </Text>
            <Text dimColor>{line.age}</Text>
          </Box>
        ))}
    </Box>
  )
}
