import { expect, test } from "bun:test";
import { parseCoverage, starterCoverage, todaysQuestions, type CoverageRow } from "../lib/identity.ts";

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
