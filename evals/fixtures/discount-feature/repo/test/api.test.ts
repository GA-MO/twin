import { expect, test } from "bun:test";
import { checkout } from "../src/api";
test("no code", () => expect(checkout({ subtotal: 1000 })).toEqual({ ok: true, total: 1000 }));
