import { expect, test } from "bun:test";
import { inside } from "../lib/paths.ts";
import { renameInMode } from "../lib/setup.ts";

test("a folder whose name starts with two dots is still inside", () => {
  expect(inside("/r/state", "/r/state/..x")).toBe(true);
  expect(inside("/r/state", "/r/state/../journal/a.md")).toBe(false);
  expect(inside("/r/state", "/r/state")).toBe(false);
});

test("renaming the agent rewrites its name but not commands or other words", () => {
  const out = renameInMode("name: nok-mode\n# nok-mode\nnok ตัดสินใจแทนวิภา · bun twin.ts profile · nok.ts", "nok", "ploy");
  expect(out).toBe("name: ploy-mode\n# ploy-mode\nploy ตัดสินใจแทนวิภา · bun twin.ts profile · nok.ts");
});
