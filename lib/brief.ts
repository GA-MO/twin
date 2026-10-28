import type { AttentionItem, Fragment } from "./collector.ts";

export type Viewer = { session: string | null; isOther(owner: string): boolean };

const BRIEF_MAX_CHARS = 4500;
const BRIEF_TOP_ITEMS = 8;
const BRIEF_ITEMS_PER_PROJECT = 2;
const TITLE_CHARS = 140;
const DAY = 86_400_000;

export function rank(items: AttentionItem[], now: Date): AttentionItem[] {
  const effective = (i: AttentionItem) => {
    if (!i.due) return i.score;
    const days = (Date.parse(i.due) - now.getTime()) / DAY;
    return i.score + (days < 0 ? 40 : days < 1 ? 30 : days < 3 ? 15 : 0);
  };
  return [...items].sort((a, b) => effective(b) - effective(a));
}

export function age(iso: string | undefined, now: Date): string {
  if (!iso) return "ไม่เคย";
  const m = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (m < 60) return `${m}m`;
  if (m < 60 * 48) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

const dateTh = (now: Date) =>
  now.toLocaleString("th-TH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const itemLine = (i: AttentionItem, viewer: Viewer, max = Infinity) =>
  `- ${i.owner && viewer.isOther(i.owner) ? "session อื่น: " : ""}${i.project ? `${i.project} · ` : ""}${clip(i.title, max)}${i.due ? ` (due ${i.due.slice(0, 10)})` : ""}`;

function spread(items: AttentionItem[]): AttentionItem[] {
  const perProject = new Map<string, number>();
  return items.filter((i) => {
    const n = perProject.get(i.project ?? "") ?? 0;
    perProject.set(i.project ?? "", n + 1);
    return !i.project || n < BRIEF_ITEMS_PER_PROJECT;
  });
}

function healthLine(fragments: Fragment[], now: Date): string | null {
  const errors = fragments.filter((f) => f.status === "error").map((f) => `${f.name} ล้ม ${age(f.okAt, now)}: ${f.why}`);
  const off = fragments.filter((f) => f.status === "off").map((f) => f.name);
  const parts = [...errors.map((e) => `⚠ ${e}`), ...(off.length ? [`ปิด: ${off.join(", ")}`] : [])];
  return parts.length ? parts.join(" · ") : null;
}

function body(f: Fragment, viewer: Viewer): string {
  const owned = f.owned ?? [];
  const mine = owned.filter((l) => !viewer.isOther(l.owner)).map((l) => l.text);
  const others = owned.filter((l) => viewer.isOther(l.owner)).map((l) => l.text.replace(/^- /, "- session อื่น: "));
  return [f.body, ...mine, ...others].filter(Boolean).join("\n");
}

export function renderBrief(name: string, fragments: Fragment[], now: Date, viewer: Viewer, notices: string[] = []): string {
  const items = rank(fragments.flatMap((f) => f.items), now);
  const head = [`# ${name} · ${dateTh(now)}`];
  const health = healthLine(fragments, now);
  if (health) head.push(health);
  if (notices.length) head.push(`⚠ ของที่เพิ่มเองใน profile/: ${notices.join(" · ")}`);
  const top = spread(items).slice(0, BRIEF_TOP_ITEMS);
  if (top.length) {
    head.push("", `## ต้องดู (${top.length} จาก ${items.length} · ทั้งหมด: bun twin.ts todo)`);
    head.push(...top.map((i) => itemLine(i, viewer, TITLE_CHARS)));
  }
  const sections = fragments
    .filter((f) => f.inBrief !== false)
    .map((f) => ({ f, text: body(f, viewer) }))
    .filter(({ text }) => text)
    .map(({ f, text }) => `## ${f.title} · ${age(f.ranAt, now)} · ${f.dir}\n${text}`);
  let out = [...head, "", ...sections].join("\n");
  while (out.length > BRIEF_MAX_CHARS && sections.length) {
    sections.pop();
    out = [...head, "", ...sections].join("\n");
  }
  return out.trimEnd();
}

export function renderTodo(fragments: Fragment[], now: Date, viewer: Viewer): string {
  const items = rank(fragments.flatMap((f) => f.items), now);
  return items.length ? items.map((i) => itemLine(i, viewer)).join("\n") : "ไม่มีอะไรค้าง";
}
