import { expect, test } from "bun:test";
import { slugify } from "../src/slug";
test("thai kept", () => expect(slugify("บ้าน เทพา")).toBe("บ้าน-เทพา"));
test("thai mixed", () => expect(slugify("Menu เมนู 2026")).toBe("menu-เมนู-2026"));
test("keep: ascii", () => expect(slugify("Hello World")).toBe("hello-world"));
test("keep: collapse", () => expect(slugify("a -- b__c")).toBe("a-b-c"));
test("keep: emoji stripped", () => expect(slugify("Party 🎉 time")).toBe("party-time"));
test("keep: trim dashes", () => expect(slugify("  --x--  ")).toBe("x"));
test("keep: punctuation", () => expect(slugify("What's up?")).toBe("what-s-up"));
