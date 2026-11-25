import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Case, firstSkill, grade, parseOptions, readCases } from "../evals/triggers.ts";

let dir = "";
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

const file = (text: string) => {
  dir = mkdtempSync(join(tmpdir(), "twin-triggers-"));
  const at = join(dir, "triggers.json");
  writeFileSync(at, text);
  return at;
};

const assistant = (content: unknown[]) => JSON.stringify({ type: "assistant", message: { content } });

test("the first Skill tool call in the stream names the skill Claude picked", () => {
  expect(firstSkill(assistant([{ type: "text", text: "ok" }, { type: "tool_use", name: "Skill", input: { skill: "mac", args: "x" } }]))).toEqual({ skill: "mac" });
  expect(firstSkill(assistant([{ type: "tool_use", name: "Bash", input: { command: "ls" } }]))).toBeNull();
  expect(firstSkill(JSON.stringify({ type: "result", subtype: "success" }))).toEqual({ skill: null });
  expect(firstSkill(JSON.stringify({ type: "system", subtype: "init" }))).toBeNull();
});

test("a malformed stream line is skipped, and a Skill call with no name is an error, not a pick", () => {
  expect(firstSkill("not json")).toBeNull();
  expect(firstSkill("")).toBeNull();
  expect(firstSkill(JSON.stringify([1, 2]))).toBeNull();
  expect(firstSkill(assistant([{ type: "tool_use", name: "Skill", input: {} }]))).toEqual({ error: "Skill tool_use with no skill name" });
});

test("a case passes only on its own skill, and a no-skill case passes when none of ours fires", () => {
  const ours = new Set(["mac", "computer"]);
  const mac: Case = { prompt: "เตือนผม", expect: "mac", from: "example" };
  const none: Case = { prompt: "zod?", expect: null, from: "example" };
  expect(grade(mac, "mac", ours)).toBe(true);
  expect(grade(mac, "computer", ours)).toBe(false);
  expect(grade(mac, null, ours)).toBe(false);
  expect(grade(none, null, ours)).toBe(true);
  expect(grade(none, "pstack:how", ours)).toBe(true);
  expect(grade(none, "mac", ours)).toBe(false);
});

test("a cases file that is not JSON, empty, or has a blank prompt or wrong field is refused with what to fix", () => {
  expect(() => readCases(file("{oops"))).toThrow("อ่านเป็น JSON ไม่ได้");
  expect(() => readCases(file("[]"))).toThrow("ผิดรูป");
  expect(() => readCases(file(JSON.stringify([{ prompt: "  ", expect: "mac", from: "history" }])))).toThrow("[0.prompt]");
  expect(() => readCases(file(JSON.stringify([{ prompt: "x", expect: "mac", from: "made-up" }])))).toThrow("[0.from]");
  expect(() => readCases(file(JSON.stringify([{ prompt: "x", expect: "", from: "example" }])))).toThrow("[0.expect]");
  expect(readCases(file(JSON.stringify([{ prompt: " เตือนผม ", expect: null, from: "history" }])))).toEqual([{ prompt: "เตือนผม", expect: null, from: "history" }]);
});

test("options take --reps 1-10, --model and --again, and refuse anything else", () => {
  expect(parseOptions([])).toEqual({ reps: 1, again: false, model: "opus" });
  expect(parseOptions(["--reps", "3", "--model", "sonnet", "--again"])).toEqual({ reps: 3, again: true, model: "sonnet" });
  for (const bad of [["--reps", "0"], ["--reps", "11"], ["--reps", "1.5"], ["--reps", "-2"], ["--reps", "abc"], ["--reps"], ["--model"], ["--fast"]]) expect(() => parseOptions(bad)).toThrow();
});
