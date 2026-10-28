import { expect, test } from "bun:test";
import { cartTotal } from "../src/cart";
test("empty cart", () => expect(cartTotal([])).toBe("$0.00"));
