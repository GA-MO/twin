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

test("reviewed owner turns show average rounds, turns left with an important finding open, findings by tag, important ones by resolution, and the reviewer's noise; eval runs are left out", () => {
  const review = (rounds: number, findings: { tag: string; resolution: string }[]) => JSON.stringify({ subtype: "success", is_error: false, structured_output: { outcome: "done", review: { rounds, findings: findings.map((f) => ({ ...f, class: "c", where: "a.ts:1" })) } } });
  run("reviewed-once", [{ prompt: "brief" }]);
  sb.write("runs/reviewed-once/turn-1/result.json", review(1, [{ tag: "important", resolution: "fixed" }, { tag: "nit", resolution: "not-worth" }]));
  run("reviewed-stuck", [{ prompt: "brief" }]);
  sb.write("runs/reviewed-stuck/turn-1/result.json", review(3, [{ tag: "important", resolution: "open" }, { tag: "important", resolution: "wrong" }, { tag: "pre-existing", resolution: "open" }]));
  run("not-reviewed", [{ prompt: "brief" }]);
  sb.write("runs/not-reviewed/turn-1/result.json", review(0, []));
  run("eval-reviewed", [{ prompt: "brief" }], { isolated: true });
  sb.write("runs/eval-reviewed/turn-1/result.json", review(2, [{ tag: "important", resolution: "wrong" }]));
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  const index = readFileSync(join(sb.repo, "state/audit/index.md"), "utf8");
  expect(index).toContain("- turn ที่มีรีวิว 2 · เฉลี่ย 2.0 รอบต่อ turn · เกิน 3 รอบ 0 · จบโดยยังค้าง important 1");
  expect(index).toContain("- finding 5: important 3 · nit 1 · pre-existing 1");
  expect(index).toContain("- important: แก้แล้ว 1 · reviewer ผิด 1 · ตั้งใจ 0 · ไม่คุ้มแก้ 0 · ค้าง 1");
  expect(index).toContain("- noise (reviewer ผิด): 1/5 (20%)");
});
