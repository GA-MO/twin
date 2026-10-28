import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";

type Space = number | "xs" | "sm" | "md" | "lg" | "xl";
type Hover = { scope?: string; backgroundColor?: string; borderColor?: string; display?: "flex" };
type Props = Record<string, unknown> & { children?: ReactNode };

const STEP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
const CELL_W = 8.5;
const CELL_H = 20;
const space = (v: unknown) => (v === undefined ? undefined : typeof v === "number" ? v * 4 : STEP[v as keyof typeof STEP]);

const THEME_KEYS = new Set(["text", "inverseText", "inactive", "subtle", "suggestion", "remember", "success", "error", "warning", "merged", "claude", "permission"]);
const color = (v: unknown) => (typeof v !== "string" ? undefined : THEME_KEYS.has(v) ? `var(--${v})` : v);

const defined = (style: CSSProperties) => Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined)) as CSSProperties

const SIZE = { caption: 11, footnote: 12, body: 14, heading: 17, title: 22 } as const;
const WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

const Scopes = createContext<{ hovered: Set<string>; set: (scope: string, on: boolean) => void }>({ hovered: new Set(), set: () => {} });

export function HoverScopes({ children }: { children: ReactNode }) {
  const [hovered, setHovered] = useState(new Set<string>());
  const set = (scope: string, on: boolean) =>
    setHovered((prev) => {
      const next = new Set(prev);
      if (on) next.add(scope);
      else next.delete(scope);
      return next;
    });
  return <Scopes.Provider value={{ hovered, set }}>{children}</Scopes.Provider>;
}

function useHover(hover: Hover | undefined) {
  const scopes = useContext(Scopes);
  const [own, setOwn] = useState(false);
  const isOn = hover ? (hover.scope ? scopes.hovered.has(hover.scope) : own) : false;
  const handlers = hover
    ? {
        onMouseEnter: () => (hover.scope ? scopes.set(hover.scope, true) : setOwn(true)),
        onMouseLeave: () => (hover.scope ? scopes.set(hover.scope, false) : setOwn(false)),
      }
    : {};
  return { isOn, handlers };
}

function Box(p: Props) {
  const hover = p.hover as Hover | undefined;
  const { isOn, handlers } = useHover(hover);
  const isRevealed = p.display === "none" && hover?.display === "flex";
  const style: CSSProperties = {
    display: isOn && hover?.display ? hover.display : ((p.display as string) ?? "flex"),
    flexDirection: (p.flexDirection as CSSProperties["flexDirection"]) ?? "row",
    flexGrow: p.flexGrow as number,
    flexShrink: (p.flexShrink as number) ?? 1,
    flexWrap: p.flexWrap as CSSProperties["flexWrap"],
    alignItems: p.alignItems as string,
    alignSelf: p.alignSelf as string,
    justifyContent: p.justifyContent as string,
    rowGap: space(p.rowGap ?? p.gap),
    columnGap: space(p.columnGap ?? p.gap),
    width: typeof p.width === "number" ? p.width * CELL_W : (p.width as string | undefined),
    height: typeof p.height === "number" ? p.height * CELL_H : (p.height as string | undefined),
    minWidth: p.minWidth as number,
    minHeight: p.minHeight as number,
    marginTop: space(p.marginTop ?? p.marginY ?? p.margin),
    marginBottom: space(p.marginBottom ?? p.marginY ?? p.margin),
    marginLeft: space(p.marginLeft ?? p.marginX ?? p.margin),
    marginRight: space(p.marginRight ?? p.marginX ?? p.margin),
    paddingTop: space(p.paddingTop ?? p.paddingY ?? p.padding),
    paddingBottom: space(p.paddingBottom ?? p.paddingY ?? p.padding),
    paddingLeft: space(p.paddingLeft ?? p.paddingX ?? p.padding),
    paddingRight: space(p.paddingRight ?? p.paddingX ?? p.padding),
    overflow: p.overflow as string,
    backgroundColor: color(isOn && hover?.backgroundColor ? hover.backgroundColor : p.backgroundColor),
    border: p.borderStyle ? `1px solid ${color(isOn && hover?.borderColor ? hover.borderColor : p.borderColor) ?? "var(--line)"}` : undefined,
    borderRadius: p.borderStyle === "round" ? 10 : p.borderStyle ? 3 : undefined,
    boxSizing: "border-box",
    transition: "background-color 120ms, border-color 120ms",
  };
  return (
    <div style={defined(style)} {...(isRevealed ? {} : handlers)} data-el="Box">
      {p.children}
    </div>
  );
}

const InText = createContext(false);

function Text(p: Props) {
  const isNested = useContext(InText);
  const wrap = p.wrap as string | undefined;
  const truncate = wrap !== undefined && wrap.startsWith("truncate");
  const style: CSSProperties = {
    color: color(p.color) ?? (isNested ? undefined : "var(--text)"),
    backgroundColor: color(p.backgroundColor),
    fontSize: p.size ? SIZE[p.size as keyof typeof SIZE] : isNested ? undefined : 14,
    fontWeight: p.weight ? WEIGHT[p.weight as keyof typeof WEIGHT] : p.bold ? 600 : undefined,
    fontStyle: p.italic ? "italic" : undefined,
    textDecoration: p.underline ? "underline" : p.strikethrough ? "line-through" : undefined,
    opacity: p.dimColor ? 0.6 : undefined,
    fontVariantNumeric: p.tabular ? "tabular-nums" : undefined,
    fontFamily: p.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
    whiteSpace: truncate ? "nowrap" : "pre-wrap",
    overflow: truncate ? "hidden" : undefined,
    textOverflow: truncate ? "ellipsis" : undefined,
    display: isNested ? "inline" : "block",
    minWidth: truncate ? 0 : undefined,
    lineHeight: 1.45,
  };
  return (
    <InText.Provider value={true}>
      <span style={defined(style)} data-el="Text">
        {p.children}
      </span>
    </InText.Provider>
  );
}

function Button(p: Props) {
  const isPrimary = p.variant === "primary";
  return (
    <button
      data-el="Button"
      data-key={p.key as string}
      onClick={() => (p.onPress as (() => void) | undefined)?.()}
      style={{
        background: isPrimary ? "var(--btn-primary)" : "var(--btn)",
        color: isPrimary ? "var(--btn-primary-text)" : "var(--text)",
        border: "none",
        borderRadius: 7,
        padding: "4px 10px",
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontFamily: "inherit",
      }}
    >
      {(p.label as string) ?? p.children}
    </button>
  );
}

function Svg(p: Props) {
  return (
    <img
      data-el="Svg"
      alt={p.alt as string}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.source as string)}`}
      width={p.width as number}
      height={p.height as number}
      style={p.width === undefined ? { display: "block", flex: "1 1 0", minWidth: 0, objectFit: "contain", objectPosition: "center" } : { display: "block", flexShrink: 0, maxWidth: "100%" }}
    />
  );
}

function Select(p: Props) {
  const options = p.options as { value: string; label: string }[];
  return (
    <select
      data-el="Select"
      value={p.value as string}
      onChange={(e) => (p.onSelect as (v: string) => void)(e.target.value)}
      style={{ background: "var(--btn)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", fontSize: 13, fontFamily: "inherit" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const Plain = (p: Props) => <span>{p.children}</span>;

export const desktopUi = { Box, Text, Button, Svg, Select, Input: Plain, Link: Plain, Code: Plain, Markdown: Plain, Client: Plain };
