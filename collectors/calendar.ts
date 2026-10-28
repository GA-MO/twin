import { $ } from "bun";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector, type AttentionItem } from "../lib/collector.ts";
import { ROOT } from "../lib/profile.ts";

const SOURCE = join(ROOT, "native/calendar.swift");
const PLIST = join(ROOT, "native/Info.plist");
const BIN = join(ROOT, "state/bin/twin-calendar");
const DAYS_AHEAD = 7;
const SOON_MINUTES = 90;
const TOMORROW_LINES = 3;
const JOIN_LINK = /https:\/\/(?:[\w-]+\.)?(?:teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|zoom\.us)\/[^\s<>"')]+/;

const Event = z.object({
  title: z.string(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  allDay: z.boolean(),
  calendar: z.string(),
  location: z.string(),
  url: z.string(),
  notes: z.string(),
  attendees: z.number(),
});
const Output = z.object({ calendars: z.array(z.string()), events: z.array(Event) });
type Event = z.infer<typeof Event>;

async function ensureBinary() {
  if (existsSync(BIN) && statSync(BIN).mtimeMs >= statSync(SOURCE).mtimeMs) return;
  const r = await $`swiftc -O ${SOURCE} -o ${BIN} -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker ${PLIST}`.quiet().nothrow();
  if (r.exitCode !== 0) throw new Error(`คอมไพล์ตัวอ่าน Calendar ไม่ได้: ${r.stderr.toString().trim().split("\n")[0]}`);
}

const day = (d: Date) => d.toLocaleDateString("sv-SE");
const hm = (iso: string) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
const joinLink = (e: Event) => [e.url, e.location, e.notes].join(" ").match(JOIN_LINK)?.[0] ?? null;
const platform = (link: string | null) => (!link ? "" : link.includes("teams") ? " · Teams" : link.includes("meet.google") ? " · Meet" : " · Zoom");

const line = (e: Event) =>
  e.allDay ? `- ทั้งวัน: ${e.title} (${e.calendar})` : `- ${hm(e.start)}–${hm(e.end)} ${e.title}${platform(joinLink(e))}${e.attendees > 1 ? ` · ${e.attendees} คน` : ""}`;

const detail = (e: Event) => {
  const link = joinLink(e);
  return [line(e), `  ปฏิทิน: ${e.calendar}`, ...(e.location ? [`  ที่: ${e.location}`] : []), ...(link ? [`  ลิงก์: ${link}`] : [])].join("\n");
};

export default defineCollector({
  title: "ประชุม / นัด",
  order: 5,
  everyMinutes: 10,
  timeoutSeconds: 180,
  keep: "snapshot",
  defaultOn: false,
  requires: ["macos"],
  async run({ now }) {
    await ensureBinary();
    const r = await $`${BIN} ${DAYS_AHEAD}`.quiet().nothrow();
    if (r.exitCode === 2) return { kind: "off", why: `ยังไม่ได้อนุญาตให้อ่าน Calendar: รัน ${BIN} ใน Terminal แล้วกด Allow` };
    if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `twin-calendar exit ${r.exitCode}`);
    const { calendars, events } = Output.parse(JSON.parse(r.stdout.toString()));
    const sorted = events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const on = (d: Date) => sorted.filter((e) => day(new Date(e.start)) === day(d));
    const today = on(now).filter((e) => e.allDay || Date.parse(e.end) > now.getTime());
    const next = on(tomorrow);
    const byDay = new Map<string, Event[]>();
    for (const e of sorted) byDay.set(day(new Date(e.start)), [...(byDay.get(day(new Date(e.start))) ?? []), e]);
    const index = [`# นัด ${DAYS_AHEAD} วันข้างหน้า`, `ปฏิทินที่เห็น: ${calendars.join(", ")}`, ""];
    for (const [d, es] of byDay) index.push(`## ${d}`, ...es.map(detail), "");
    const items: AttentionItem[] = sorted
      .filter((e) => !e.allDay)
      .map((e) => ({ e, minutes: Math.round((Date.parse(e.start) - now.getTime()) / 60_000) }))
      .filter(({ minutes }) => minutes >= -5 && minutes <= SOON_MINUTES)
      .map(({ e, minutes }) => ({
        key: `calendar:${e.start}:${e.title}`,
        title: `ประชุม ${hm(e.start)} ${e.title}${minutes > 0 ? ` อีก ${minutes} นาที` : " กำลังเริ่ม"}${joinLink(e) ? ` · ${joinLink(e)}` : ""}`,
        score: 80,
      }));
    const brief = [
      ...(today.length ? today.map(line) : ["- วันนี้ไม่มีนัดเหลือ"]),
      ...(next.length ? [`พรุ่งนี้: ${next.slice(0, TOMORROW_LINES).map((e) => (e.allDay ? e.title : `${hm(e.start)} ${e.title}`)).join(" · ")}`] : []),
    ].join("\n");
    return { kind: "ok", files: { "index.md": index.join("\n") }, brief, items };
  },
});
