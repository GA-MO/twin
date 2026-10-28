import { expect, test } from "bun:test";
import { parseDuration } from "../src/duration";
test("1h30m", () => expect(parseDuration("1h30m")).toBe(5_400_000));
