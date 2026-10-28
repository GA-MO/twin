import { expect, test } from "bun:test";
import { cartTotal } from "../src/cart";
import { invoiceLine } from "../src/invoice";
import { receiptTotal } from "../src/receipt";
test("cart", () => expect(cartTotal([{ name: "a", cents: 1200, qty: 1 }, { name: "b", cents: 250, qty: 2 }])).toBe("$17.00"));
test("invoice", () => expect(invoiceLine("Design", 150000)).toBe("Design ... $1,500.00"));
test("receipt eur", () => expect(receiptTotal(999, "EUR")).toBe("TOTAL €9.99"));
test("keep: zero", () => expect(cartTotal([])).toBe("$0.00"));
