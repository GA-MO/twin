import { expect, test } from "bun:test";
import { weeklyReport } from "../src/report";
import { weekDays } from "../src/dates";
const wed = new Date("2026-10-21T00:00:00Z");
test("sunday in report", () => expect(weeklyReport([{ date: "2026-10-25", amount: 7 }], wed)["2026-10-25"]).toBe(7));
test("week has 7 days mon..sun", () => expect(weekDays(wed)).toEqual(["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25"]));
test("from sunday itself", () => expect(weekDays(new Date("2026-10-25T00:00:00Z"))[6]).toBe("2026-10-25"));
test("keep: monday", () => expect(weeklyReport([{ date: "2026-10-19", amount: 5 }], wed)["2026-10-19"]).toBe(5));
