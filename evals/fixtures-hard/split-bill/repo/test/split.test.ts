import { expect, test } from "bun:test";
import { splitBill } from "../src/split";
test("even", () => expect(splitBill(900, 3)).toEqual([300, 300, 300]));
