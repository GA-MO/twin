import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { DesktopBand, DesktopBoard, type Ctl } from "../twin/hooks/desktop.tsx";
import type { Sent, Ui } from "../twin/hooks/model.ts";
import { SCENARIOS } from "./fixture.ts";
import { HoverScopes, desktopUi } from "./ui.tsx";

const ui = desktopUi as unknown as Ui;


const THEMES = {
  dark: {
    page: "#141413", chat: "#1f1e1d", pane: "#1a1918", side: "#262624", line: "rgba(255,255,255,0.08)",
    text: "#ECEBE7", inverseText: "#1f1e1d", subtle: "#B4B2AC", inactive: "#8F8D88", suggestion: "#7AA7FF", remember: "#7AA7FF",
    success: "#5FB383", error: "#E5716F", warning: "#E3A13B", merged: "#A68BF2", claude: "#D97757", permission: "#B18CFF",
    btn: "rgba(255,255,255,0.09)", "btn-primary": "#ECEBE7", "btn-primary-text": "#1f1e1d", input: "#2a2927",
  },
  light: {
    page: "#EDEBE4", chat: "#FAF9F5", pane: "#F5F4EE", side: "#EEECE4", line: "rgba(0,0,0,0.09)",
    text: "#1F1E1D", inverseText: "#FAF9F5", subtle: "#5E5D59", inactive: "#87857F", suggestion: "#2F6FEB", remember: "#2F6FEB",
    success: "#2F8A57", error: "#C9423F", warning: "#B7791F", merged: "#7C5CD6", claude: "#C2603F", permission: "#7C5CD6",
    btn: "rgba(0,0,0,0.06)", "btn-primary": "#1F1E1D", "btn-primary-text": "#FAF9F5", input: "#FFFFFF",
  },
} as const;

type Theme = keyof typeof THEMES;

function useLiveReload() {
  useEffect(() => {
    let last = "";
    const timer = setInterval(async () => {
      const v = await fetch("/version").then((r) => r.text()).catch(() => last);
      if (last && v !== last) location.reload();
      last = v;
    }, 800);
    return () => clearInterval(timer);
  }, []);
}

function useSaved<T extends string>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => (new URLSearchParams(location.search).get(key) as T | null) ?? (localStorage.getItem(key) as T | null) ?? initial);
  return [value, (v: T) => (localStorage.setItem(key, v), setValue(v))] as const;
}

function App() {
  useLiveReload();
  const [theme, setTheme] = useSaved<Theme>("theme", "dark");
  const [scenario, setScenario] = useSaved<string>("scenario", "typical");
  const [paneWidth, setPaneWidth] = useSaved<string>("paneWidth", "360");
  const [chatWidth, setChatWidth] = useSaved<string>("chatWidth", "820");
  const [expanded, setExpanded] = useState<string[]>(() => (new URLSearchParams(location.search).get("expand") ?? "").split(",").filter(Boolean));
  const [showTheirs, setShowTheirs] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [marked, setMarked] = useState<Record<string, Sent>>({});
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const snap = (SCENARIOS[scenario] ?? SCENARIOS["typical"]!)();
  const act = (text: string) => setSent((s) => [text, ...s].slice(0, 4));
  const ctl: Ctl = {
    act,
    fill: setDraft,
    sent: marked,
    markSent: (run, label) => setMarked((m) => ({ ...m, [run.id]: { label, at: Date.now(), turn: run.turn, status: run.status } })),
    expanded,
    toggle: (id) => setExpanded((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id])),
    showTheirs,
    setShowTheirs,
    name: snap.name,
  };
  const vars = Object.fromEntries(Object.entries(THEMES[theme]).map(([k, v]) => [`--${k}`, v]));

  const control = { background: "var(--btn)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", fontSize: 12, fontFamily: "inherit" };
  return (
    <div style={{ ...vars, background: "var(--page)", minHeight: "100vh", color: "var(--text)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Sukhumvit Set', 'Noto Sans Thai', sans-serif" } as React.CSSProperties}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--line)", fontSize: 12, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>twin mod preview</b>
        <span style={{ color: "var(--inactive)" }}>real components from mods/twin/hooks/desktop.tsx, reloads on save</span>
        <span style={{ flex: 1 }} />
        <select style={control} value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {Object.keys(SCENARIOS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <select style={control} value={paneWidth} onChange={(e) => setPaneWidth(e.target.value)}>
          {["300", "360", "440", "560"].map((w) => (
            <option key={w} value={w}>
              pane {w}px
            </option>
          ))}
        </select>
        <select style={control} value={chatWidth} onChange={(e) => setChatWidth(e.target.value)}>
          {["560", "820", "1000"].map((w) => (
            <option key={w} value={w}>
              chat {w}px
            </option>
          ))}
        </select>
        <button style={control} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☾ dark" : "☀ light"}
        </button>
      </div>
      <HoverScopes>
        <div style={{ display: "flex", justifyContent: "center", padding: 24, gap: 0 }}>
          <div style={{ width: Number(chatWidth), background: "var(--chat)", borderRadius: "12px 0 0 12px", border: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 760 }}>
            <div style={{ flex: 1, padding: 28, color: "var(--inactive)", fontSize: 13 }}>
              <div style={{ marginLeft: "auto", width: "fit-content", background: "var(--btn)", color: "var(--text)", padding: "8px 14px", borderRadius: 12 }}>how is it going?</div>
              {sent.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  {sent.map((s, i) => (
                    <div key={i} style={{ opacity: 1 - i * 0.2 }}>
                      sent to chat: <code style={{ color: "var(--claude)" }}>{s}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "0 24px" }}>
              <DesktopBand ui={ui} snap={snap} now={now} ctl={{ ...ctl, toggle: (key) => setExpanded((x) => (x.includes(key) ? x : [...x, key])) }} open={() => act("(open pane)")} />
            </div>
            <div style={{ margin: "8px 24px 24px", background: "var(--input)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", color: "var(--inactive)", fontSize: 14 }}>{draft || "Type / for commands"}</div>
          </div>
          <div style={{ width: Number(paneWidth), background: "var(--pane)", borderRadius: "0 12px 12px 0", border: "1px solid var(--line)", borderLeft: "none", overflow: "auto", maxHeight: "calc(100vh - 120px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", fontSize: 13, borderBottom: "1px solid var(--line)" }}>
              <span>{snap.name}</span>
              <span style={{ color: "var(--inactive)" }}>⤢ ✕</span>
            </div>
            <DesktopBoard ui={ui} snap={snap} now={now} ctl={ctl} />
          </div>
        </div>
      </HoverScopes>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
