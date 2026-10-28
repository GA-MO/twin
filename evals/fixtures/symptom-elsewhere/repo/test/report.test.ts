import { expect, test } from "bun:test";
import { weeklyReport } from "../src/report";
test("monday sales", () => expect(weeklyReport([{ date: "2026-10-19", amount: 5 }], new Date("2026-10-21T00:00:00Z"))["2026-10-19"]).toBe(5));
