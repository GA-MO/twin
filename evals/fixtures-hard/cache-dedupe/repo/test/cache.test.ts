import { expect, test, beforeEach } from "bun:test";
import { cached, clearCache } from "../src/cache";
beforeEach(clearCache);
test("returns loaded value", async () => expect(await cached("a", 1000, async () => 1)).toBe(1));
