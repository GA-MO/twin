import { expect, test } from "bun:test";
import { resolveFile } from "../src/files";
test("index", () => expect(resolveFile("/srv/public", "/index.html")).toBe("/srv/public/index.html"));
