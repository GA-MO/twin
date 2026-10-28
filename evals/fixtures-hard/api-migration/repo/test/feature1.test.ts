import { expect, test } from "bun:test";
import { greet1 } from "../src/feature1";
test("greet1", async () => expect(await new Promise((r) => greet1(1, r))).toBe("feature1: hello Ann"));
