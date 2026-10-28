import { afterAll, expect, test } from "bun:test";
import { readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { sandbox } from "./harness.ts";

const sb = sandbox("twin-audit-");
afterAll(() => sb.remove());

const DAY_AGO = new Date(Date.now() - 86_400_000);

function run(id: string, turns: { prompt: string; marks?: string[] }[], opts: { isolated?: boolean; finished?: boolean; runJson?: string } = {}) {
  sb.write(`runs/${id}/run.json`, opts.runJson ?? JSON.stringify({ id, isolated: opts.isolated ?? false }));
  turns.forEach((t, i) => {
    sb.write(`runs/${id}/turn-${i + 1}/pid`, "1");
    sb.write(`runs/${id}/turn-${i + 1}/prompt.md`, t.prompt);
    for (const m of t.marks ?? []) sb.write(`runs/${id}/turn-${i + 1}/${m}`, "");
  });
  if (opts.finished ?? true) utimesSync(sb.write(`runs/${id}/turn-${turns.length}/exit`, "0"), DAY_AGO, DAY_AGO);
}

test("the main number is the share of settled handed-off runs the owner never had to touch again", () => {
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null }));
  run("one-turn", [{ prompt: "brief" }]);
  run("system-check", [{ prompt: "brief" }, { prompt: "turn นี้แก้ code ...", marks: ["check"] }]);
  run("approved", [{ prompt: "brief" }, { prompt: "อนุมัติแล้ว: push (เฉพาะ turn นี้)\npush ได้" }]);
  run("fixed", [{ prompt: "brief" }, { prompt: "ปุ่มยังเพี้ยน แก้ใหม่" }]);
  run("fixed-with-a-check", [{ prompt: "brief" }, { prompt: "turn นี้แก้ code ...\n\nปุ่มยังเพี้ยน", marks: ["check", "touch"] }]);
  run("still-running", [{ prompt: "brief" }], { finished: false });
  run("eval-run", [{ prompt: "brief" }, { prompt: "แก้" }], { isolated: true });
  run("broken", [{ prompt: "brief" }], { runJson: "{ not json" });
  const r = sb.twin(["sync", "audit"]);
  expect(r.err).toBe("");
  expect(readFileSync(join(sb.repo, "state/audit/index.md"), "utf8")).toContain("ตัวชี้วัดหลัก: งานที่ส่งแล้วไม่ต้องแตะอีก 3/5 (60%) + ยังไม่นับ 1");
});
