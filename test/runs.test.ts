import { afterAll, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandbox } from "./harness.ts";

const sb = sandbox("twin-runs-");
afterAll(() => sb.remove());

test("a closed run is listed from its own files without asking git, and shows the push state it had when it closed", () => {
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null }));
  const id = "1105-0900-shop-done";
  sb.write(`runs/${id}/run.json`, JSON.stringify({ id, project: "shop", repo: "/work/gone-shop", slug: "done", worktree: "/work/gone-shop/.claude/worktrees/nok-done", branch: "nok/done", base: "origin/develop", session: "s", port: 4101, startedAt: "2026-11-05T02:00:00.000Z" }));
  sb.write(`runs/${id}/turn-1/pid`, "1");
  sb.write(`runs/${id}/turn-1/exit`, "0");
  sb.write(`runs/${id}/turn-1/err.log`, "");
  sb.write(`runs/${id}/turn-1/result.json`, "");
  sb.write(`runs/${id}/closed.md`, "closed 2026-11-05T03:00:00.000Z · 2 commits · pushed true · discard false · dropped false\n");
  const calls = join(sb.work, "git-calls.log");
  writeFileSync(join(sb.bin, "git"), `#!/bin/sh\necho "$*" >> ${calls}\nexec /usr/bin/git "$@"\n`, { mode: 0o755 });
  writeFileSync(calls, "");
  const r = sb.twin(["runs", id]);
  expect(r.err).toBe("");
  expect(r.out).toContain(`${id} · closed · turn 1 · 0 commits · pushed`);
  expect(readFileSync(calls, "utf8")).not.toContain("gone-shop");
});
