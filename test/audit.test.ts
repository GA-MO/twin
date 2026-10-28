import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sandbox } from "./harness.ts";

const sb = sandbox("twin-audit-");
afterAll(() => sb.remove());

function run(id: string, turns: { prompt: string; check?: boolean }[], isolated = false) {
  sb.write(`runs/${id}/run.json`, JSON.stringify({ id, isolated }));
  turns.forEach((t, i) => {
    sb.write(`runs/${id}/turn-${i + 1}/pid`, "1");
    sb.write(`runs/${id}/turn-${i + 1}/prompt.md`, t.prompt);
    if (t.check) sb.write(`runs/${id}/turn-${i + 1}/check`, "");
  });
}

test("the main number is the share of handed-off runs the owner never had to touch again", () => {
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null }));
  run("one-turn", [{ prompt: "brief" }]);
  run("system-check", [{ prompt: "brief" }, { prompt: "turn นี้แก้ code ...", check: true }]);
  run("approved", [{ prompt: "brief" }, { prompt: "อนุมัติแล้ว: push (เฉพาะ turn นี้)\npush ได้" }]);
  run("fixed", [{ prompt: "brief" }, { prompt: "ปุ่มยังเพี้ยน แก้ใหม่" }]);
  run("eval-run", [{ prompt: "brief" }, { prompt: "แก้" }], true);
  const r = sb.twin(["sync", "audit"]);
  expect(r.err).toBe("");
  expect(readFileSync(join(sb.repo, "state/audit/index.md"), "utf8")).toContain("ตัวชี้วัดหลัก: งานที่ส่งแล้วไม่ต้องแตะอีก 3/4 (75%)");
});
