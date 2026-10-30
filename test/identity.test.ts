import { expect, test } from "bun:test";
import { parseCoverage, starterCoverage, todaysQuestions, type CoverageRow } from "../lib/identity.ts";
import { cueOf, importLine, quotes, tailLine } from "../lib/mode.ts";

test("the starter coverage lists every layer and reads back as unknown", () => {
  const { rows, problems } = parseCoverage(starterCoverage());
  expect(problems).toEqual([]);
  expect(new Set(rows.map((r) => r.layer)).size).toBe(6);
  expect(rows.every((r) => r.confidence === 0 && r.lastAsked === null)).toBe(true);
});

test("rows written with layer ids or bold labels are read; rows that cannot be read are reported", () => {
  const { rows, problems } = parseCoverage(["| identity | บทบาท | 2 | 1 | - |", "| **งาน** | ลูกค้า | 1 | 0 | 2026-10-28 |", "| งาน | ลูกค้า | 7 | 1 | - |", "| งาน | ทีม |  | 1 | - |", "| งาน | ทีม | 1 | 1 | - | note |"].join("\n"));
  expect(rows.map((r) => r.layer)).toEqual(["identity", "work"]);
  expect(problems).toHaveLength(3);
});

test("daily questions come from the shallowest layers, one per layer, at most three a day", () => {
  const row = (layer: CoverageRow["layer"], topic: string, confidence: number, lastAsked: string | null = null): CoverageRow => ({ layer, topic, confidence, evidence: confidence, lastAsked });
  const rows = [row("identity", "บทบาท", 3), row("work", "ลูกค้า", 2), row("life", "หาความรู้", 0), row("life", "งานอดิเรก", 1), row("collab", "ละเอียดแค่ไหน", 1), row("tools", "แชท", 2, "2026-10-28")];
  const picks = todaysQuestions(rows, "2026-10-28");
  expect(picks.map((r) => r.topic)).toEqual(["หาความรู้", "ละเอียดแค่ไหน"]);
  expect(todaysQuestions(rows.map((r) => ({ ...r, lastAsked: "2026-10-28" })), "2026-10-28")).toEqual([]);
});

test("the mode import line survives spaces and Windows separators, which Claude Code would otherwise cut", () => {
  expect(importLine("/Users/a b/twin/state/mode.md")).toBe("@/Users/a\\ b/twin/state/mode.md");
  expect(importLine("C:\\Users\\John Doe\\twin\\state\\mode.md")).toBe("@C:/Users/John\\ Doe/twin/state/mode.md");
});

test("the identity probe expects the mode's last line and accepts it quoted loosely, never an empty or NONE answer", () => {
  const text = "<EXTREMELY_IMPORTANT>\n# x-mode\n\n## กฎ\n- ตรวจบนของจริงก่อนบอกว่าเสร็จ   งาน UI ต้องกดจริง\n</EXTREMELY_IMPORTANT>\n";
  const want = tailLine(text);
  expect(want).toBe("- ตรวจบนของจริงก่อนบอกว่าเสร็จ   งาน UI ต้องกดจริง");
  expect(want.replace(/^- /, "").startsWith(cueOf(want))).toBe(true);
  expect(quotes(want, cueOf(want))).toBe(false);
  expect(quotes("- short rule", cueOf("- short rule"))).toBe(false);
  expect(quotes(want, "ตรวจบนของจริงก่อนบอกว่าเสร็จ งาน UI ต้องกดจริง")).toBe(true);
  expect(quotes(want, "> - ตรวจบนของจริงก่อนบอกว่าเสร็จ งาน UI ต้องกดจริง เพราะ ...")).toBe(true);
  expect(quotes(want, "NONE")).toBe(false);
  expect(quotes(want, "")).toBe(false);
  expect(quotes("", "anything")).toBe(false);
  expect(tailLine("no marker\nlast line\n")).toBe("last line");
});
