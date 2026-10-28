import type { RenderChildren } from 'claude-code'

import type { Run } from '../types'
import { COPY, DOT, buttonLabel, isReportOpen, press, reportRows, sentNote, type Action, type Band, type Board, type Card, type Ctl, type Fact, type Progress, type Ui } from './model.ts'

export type { Ctl } from './model.ts'

const GUIDE = 'rgba(128,128,128,0.32)'
const HAIRLINE = 'rgba(128,128,128,0.18)'

const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
const tint = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
const pulse = (cx: number, cy: number, r: number, hex: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${hex}" stroke-width="1.5"><animate attributeName="r" values="${r};${r + 5}" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="1.8s" repeatCount="indefinite"/></circle>`

const pip = (hex: string, isPulsing = false) => svg(16, 16, `${isPulsing ? pulse(8, 8, 3.5, hex) : ''}<circle cx="8" cy="8" r="3.5" fill="${hex}"/>`)

function branch(isLast: boolean, isRunning: boolean) {
  const hex = isRunning ? DOT.live : DOT.idle
  return svg(24, 44, `<path d="M7 0V${isLast ? 22 : 44}M7 22H14" stroke="${GUIDE}" stroke-width="1.4" fill="none" stroke-linecap="round"/>${isRunning ? pulse(18, 22, 3.2, hex) : ''}<circle cx="18" cy="22" r="3.2" fill="${hex}"/>`)
}

function Dot({ ui, hex, isPulsing, alt }: { ui: Ui; hex: string; isPulsing: boolean; alt: string }) {
  const Svg = 'Svg' in ui ? ui.Svg : null
  return Svg ? <Svg source={pip(hex, isPulsing)} alt={alt} width={16} height={16} isInteractive={isPulsing || undefined} /> : null
}

function Buttons({ ui, run, list, ctl, now, keyPrefix = '' }: { ui: Ui; run: Run; list: Action[]; ctl: Ctl; now: number; keyPrefix?: string }) {
  const { Box, Button, Text } = ui
  const sent = sentNote(run, ctl, now)
  if (sent) {
    return (
      <Text size="footnote" color="inactive">
        {sent}
      </Text>
    )
  }
  return (
    <Box gap="sm" flexWrap="wrap">
      {list.map(b => (
        <Button
          key={`${keyPrefix}${run.id}-${b.label}`}
          variant={b.isPrimary && !(b.isReport && isReportOpen(ctl, run)) ? 'primary' : 'secondary'}
          label={buttonLabel(ctl, run, b)}
          onPress={() => press(ctl, run, b)}
        />
      ))}
    </Box>
  )
}

function Report({ ui, run }: { ui: Ui; run: Run }) {
  const { Box, Text } = ui
  const rows = reportRows(run.report)
  if (!rows) {
    return (
      <Text size="footnote" color="inactive">
        {COPY.noReport}
      </Text>
    )
  }
  return (
    <Box flexDirection="column" gap="sm" paddingTop="xs" minWidth={0}>
      {rows.map(r => (
        <Box key={r.key} flexDirection="column" minWidth={0}>
          <Text size="caption" weight="semibold" color="inactive">
            {r.label}
          </Text>
          {r.lines.map((line, i) => (
            <Text key={`${r.key}-${i}`} size="footnote" color="subtle">
              {line}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

function CardHead({ ui, card, size }: { ui: Ui; card: Card; size: 'caption' | 'footnote' }) {
  const { Box, Text } = ui
  return (
    <Box justifyContent="space-between" alignItems="center" gap="md" minWidth={0}>
      <Text size={size} weight="semibold" color={card.color}>
        {card.label}
      </Text>
      <Box flexShrink={1} minWidth={0}>
        <Text size="caption" color="inactive" wrap="truncate-end">
          {card.meta}
        </Text>
      </Box>
    </Box>
  )
}

function CardBox({ ui, card, ctl, now, isElsewhere = false }: { ui: Ui; card: Card; ctl: Ctl; now: number; isElsewhere?: boolean }) {
  const { Box, Text } = ui
  const border = isElsewhere ? 'rgba(128,128,128,0.22)' : tint(card.color, 0.32)
  return (
    <Box flexDirection="column" gap="sm" padding="md" minWidth={0} borderStyle="round" borderColor={border} backgroundColor={isElsewhere ? undefined : tint(card.color, 0.045)}>
      <Box flexDirection="column" gap="xs" minWidth={0}>
        <CardHead ui={ui} card={card} size="caption" />
        <Text size="body" weight="semibold">
          {card.ask}
        </Text>
        {card.detail !== '' && (
          <Text size="footnote" color="subtle">
            {card.detail}
          </Text>
        )}
      </Box>
      <Buttons ui={ui} run={card.run} list={card.actions} ctl={ctl} now={now} />
      {isReportOpen(ctl, card.run) && <Report ui={ui} run={card.run} />}
    </Box>
  )
}

function Moving({ ui, p, ctl }: { ui: Ui; p: Progress; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  const Svg = 'Svg' in ui ? ui.Svg : null
  return (
    <Box flexDirection="column" gap="xs" padding="md" minWidth={0} borderStyle="round" borderColor="rgba(128,128,128,0.16)">
      <Box alignItems="center" justifyContent="space-between" gap="sm" minWidth={0}>
        <Box alignItems="center" gap="xs" flexShrink={1} minWidth={0}>
          <Dot ui={ui} hex={p.isQuiet ? DOT.quiet : DOT.live} isPulsing={!p.isQuiet} alt={p.isQuiet ? 'quiet' : 'working'} />
          <Box flexShrink={1} minWidth={0}>
            <Text size="footnote" weight="semibold" wrap="truncate-end">
              {p.run.slug}
            </Text>
          </Box>
          <Box flexShrink={2} minWidth={0}>
            <Text size="caption" color="inactive" wrap="truncate-end">
              {p.run.project}
            </Text>
          </Box>
        </Box>
        <Text size="caption" color={p.isQuiet ? DOT.quiet : 'inactive'}>
          {p.age}
        </Text>
      </Box>
      {p.doing !== '' && (
        <Text size="footnote" color="subtle" wrap="truncate-end">
          {p.doing}
        </Text>
      )}
      {p.agentsLine !== '' && (
        <Text size="caption" color="inactive">
          {p.agentsLine}
        </Text>
      )}
      {p.agents.length > 0 && (
        <Box flexDirection="column" minWidth={0}>
          {p.agents.map((a, i) => (
            <Box key={a.id} alignItems="center" gap="sm" minWidth={0}>
              {Svg && <Svg source={branch(i === p.agents.length - 1, a.isRunning)} alt={a.isRunning ? 'working' : 'done'} width={24} height={44} isInteractive={a.isRunning || undefined} />}
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                <Text size="footnote" weight={a.isRunning ? 'medium' : 'regular'} color={a.isRunning ? 'text' : 'inactive'} wrap="truncate-end">
                  {a.description}
                </Text>
                <Text size="caption" color="inactive" wrap="truncate-end">
                  {a.status}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text size="caption" color="inactive" wrap="truncate">
                  {a.role}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {p.more && (
        <Box>
          <Button key={`${p.run.id}-more`} variant="secondary" label={p.more} onPress={() => ctl.toggle(p.run.id)} />
        </Box>
      )}
    </Box>
  )
}

function Section({ ui, title, children }: { ui: Ui; title: string; children: RenderChildren }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" gap="sm">
      <Text size="footnote" weight="semibold" color="subtle">
        {title}
      </Text>
      {children}
    </Box>
  )
}

export function DesktopBoard({ ui, board, now, ctl }: { ui: Ui; board: Board; now: number; ctl: Ctl }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" gap="lg" padding="md" minWidth={0}>
      <Box flexDirection="column" gap="xs">
        <Text size="title" weight="semibold">
          {board.title}
        </Text>
        <Text size="footnote" color="subtle">
          {board.summary}
        </Text>
      </Box>
      {board.decide.length > 0 && (
        <Box flexDirection="column" gap="sm">
          {board.decide.map(card => (
            <CardBox key={card.key} ui={ui} card={card} ctl={ctl} now={now} />
          ))}
        </Box>
      )}
      {board.elsewhere.length > 0 && (
        <Section ui={ui} title={COPY.elsewhere}>
          {board.elsewhere.map(card => (
            <CardBox key={card.key} ui={ui} card={card} ctl={ctl} now={now} isElsewhere />
          ))}
        </Section>
      )}
      {board.moving.length > 0 && (
        <Section ui={ui} title={COPY.moving}>
          {board.moving.map(p => (
            <Moving key={p.run.id} ui={ui} p={p} ctl={ctl} />
          ))}
        </Section>
      )}
      {board.rest.length > 0 && (
        <Box flexDirection="column" gap="xs">
          <Box justifyContent="space-between" alignItems="center" gap="sm">
            <Text size="footnote" color="inactive">
              {board.footer}
            </Text>
            <Button key="theirs" variant="secondary" label={ctl.showTheirs ? COPY.hide : COPY.show} onPress={() => ctl.setShowTheirs(!ctl.showTheirs)} />
          </Box>
          {ctl.showTheirs &&
            board.rest.map(line => (
              <Box key={line.run.id} alignItems="center" justifyContent="space-between" gap="sm" paddingY="xs" minWidth={0}>
                <Box alignItems="center" gap="sm" flexShrink={1} minWidth={0}>
                  <Text size="footnote" color={DOT.live}>
                    ✓
                  </Text>
                  <Text size="footnote" weight="medium">
                    {line.run.slug}
                  </Text>
                  <Box flexShrink={1} minWidth={0}>
                    <Text size="caption" color="inactive" wrap="truncate-end">
                      {line.detail}
                    </Text>
                  </Box>
                </Box>
                <Text size="caption" color="inactive">
                  {line.age}
                </Text>
              </Box>
            ))}
        </Box>
      )}
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

function Facts({ ui, facts }: { ui: Ui; facts: Fact[] }) {
  const { Box, Text } = ui
  return (
    <Box gap="xs" flexWrap="wrap" justifyContent="flex-end" flexShrink={1} minWidth={0}>
      {facts.map((f, i) => (
        <Text key={f.text} size="caption" weight={f.isStrong ? 'semibold' : 'regular'} color={f.isStrong ? 'text' : 'inactive'} wrap="truncate">
          {i > 0 ? `· ${f.text}` : f.text}
        </Text>
      ))}
    </Box>
  )
}

function Status({ ui, band, name, open }: { ui: Ui; band: Band; name: string; open: () => void }) {
  const { Box, Text, Button } = ui
  return (
    <Box alignItems="center" justifyContent="space-between" gap="md" paddingX="sm" paddingY="xs" minWidth={0}>
      <Box alignItems="center" gap="xs" flexShrink={0}>
        <Dot ui={ui} hex={band.isLive ? DOT.live : DOT.idle} isPulsing={band.isLive} alt={band.isLive ? 'working' : 'idle'} />
        <Text size="footnote" weight="semibold">
          {name}
        </Text>
      </Box>
      <Box alignItems="center" gap="md" flexShrink={1} minWidth={0}>
        <Facts ui={ui} facts={band.facts} />
        <Button key="open" variant="secondary" label={COPY.open} onPress={open} />
      </Box>
    </Box>
  )
}

function BandCard({ ui, card, ctl, now }: { ui: Ui; card: Card; ctl: Ctl; now: number }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" gap="xs" paddingX="md" paddingY="sm" minWidth={0}>
      <CardHead ui={ui} card={card} size="footnote" />
      <Text size="footnote" weight="semibold" wrap="truncate-end">
        {card.ask}
      </Text>
      <Buttons ui={ui} run={card.run} list={card.actions} ctl={ctl} now={now} keyPrefix="bar-" />
    </Box>
  )
}

export function DesktopBand({ ui, band, ctl, now, name, open }: { ui: Ui; band: Band; ctl: Ctl; now: number; name: string; open: () => void }) {
  const { Box } = ui
  const status = <Status ui={ui} band={band} name={name} open={open} />
  if (band.cards.length === 0) return <RainbowFrame ui={ui}>{status}</RainbowFrame>
  return (
    <Box flexDirection="column" gap="xs" minWidth={0}>
      <RainbowFrame ui={ui}>
        {band.cards.map((card, i) => (
          <Box key={card.key} flexDirection="column" minWidth={0}>
            {i > 0 && <Box height={STRIP_W} marginX="md" marginY="sm" backgroundColor={HAIRLINE} />}
            <BandCard ui={ui} card={card} ctl={ctl} now={now} />
          </Box>
        ))}
      </RainbowFrame>
      {status}
    </Box>
  )
}
