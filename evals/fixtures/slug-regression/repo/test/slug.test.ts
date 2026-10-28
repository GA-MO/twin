import { expect, test } from "bun:test";
import { slugify } from "../src/slug";
test("ascii", () => expect(slugify("Hello World")).toBe("hello-world"));
