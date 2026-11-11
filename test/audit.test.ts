import { afterAll, expect, test } from "bun:test";
import { readFileSync, realpathSync, utimesSync } from "node:fs";
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

test("follow-ups gamo sent on its own after a worker finished count as decisions, not as the owner touching the run, and asks with a recommendation count how often the owner took it", () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  const owner = (m: number, text: string) => ({ type: "user", timestamp: at(m).toISOString(), message: { content: text } });
  const midTurn = (m: number, prompt: string) => ({ type: "attachment", timestamp: at(m).toISOString(), attachment: { type: "queued_command", prompt, origin: { kind: "human" } } });
  const notified = (m: number) => ({ type: "user", timestamp: at(m).toISOString(), message: { content: "<task-notification> <task-id>x</task-id> done" } });
  const says = (m: number, text: string) => ({ type: "assistant", timestamp: at(m).toISOString(), message: { content: [{ type: "text", text }] } });
  const midTurnNote = (m: number) => ({ type: "attachment", timestamp: at(m).toISOString(), attachment: { type: "queued_command", prompt: "<task-notification> done", origin: { kind: "task-notification" } } });
  const runs = (m: number, command: string, id = "") => ({ type: "assistant", timestamp: at(m).toISOString(), message: { content: [{ type: "tool_use", id, name: "Bash", input: { command } }] } });
  const failed = (m: number, id: string, content: string) => ({ type: "user", timestamp: at(m).toISOString(), message: { content: [{ type: "tool_result", tool_use_id: id, is_error: true, content }] } });
  const followed = (id: string, ...minutesAgo: number[]) => {
    run(id, [{ prompt: "brief" }, ...minutesAgo.map(() => ({ prompt: "ต่อ", marks: ["touch"] }))]);
    utimesSync(join(sb.repo, `runs/${id}/turn-1/pid`), at(400), at(400));
    minutesAgo.forEach((m, i) => utimesSync(join(sb.repo, `runs/${id}/turn-${i + 2}/pid`), at(m), at(m)));
  };
  followed("1101-0900-shop-gamo-answered", 299);
  followed("1101-0900-shop-owner-fixed", 249, 199);
  followed("1101-0900-shop-overruled", 149, 99);
  followed("1101-0900-shop-queued", 79);
  followed("1101-0900-shop-next-turn", 69);
  const lines = [
    notified(301),
    runs(300, 'bun twin.ts followup 1101-0900-shop-gamo-answered "ใช้ทางที่แนะนำ"'),
    notified(251),
    runs(250, 'bun twin.ts followup 1101-0900-shop-owner-fixed --approve push "push"'),
    says(240, "ปุ่มแก้แล้ว"),
    owner(201, "ปุ่มยังเพี้ยน แก้ใหม่"),
    runs(200, 'bun twin.ts followup 1101-0900-shop-owner-fixed "ปุ่มยังเพี้ยน แก้ใหม่"'),
    notified(151),
    runs(150, 'bun twin.ts followup 1101-0900-shop-overruled "ทำ footer ต่อ"'),
    owner(101, "ไม่ใช่ ยังต้องแก้ header"),
    runs(100, 'bun twin.ts followup 1101-0900-shop-overruled "ยังต้องแก้ header"'),
    notified(82),
    midTurn(81, "ให้ shop-queued ใช้สีเดิม"),
    runs(80, 'bun twin.ts followup 1101-0900-shop-queued "ใช้สีเดิม"'),
    notified(71),
    runs(70, 'bun twin.ts followup 1101-0900-shop-next-turn "ต่อ"'),
    owner(69.5, "แก้ next-turn ด้วย"),
    runs(68, 'bun twin.ts followup 1101-0900-shop-next-turn "แก้ด้วย"'),
    says(60, "ผมแนะนำทำ cart ก่อน ส่งให้ worker ไหม"),
    owner(59, "ทำ"),
    runs(58, "bun twin.ts dispatch shop cart <<'EOF'"),
    runs(57, "bun twin.ts dispatch --help"),
    midTurnNote(56.5),
    runs(56, 'bun twin.ts followup 1101-0900-shop-gamo-answered "เจ้าของสั่งต่อ"'),
    notified(55),
    runs(54, "python3 - <<'PY'\ncmd = 'bun twin.ts close 1101-0900-shop-gamo-answered'\nPY"),
    runs(53, "bun twin.ts close 1101-0900-shop-owner-fixed", "toolu_refused"),
    failed(52.9, "toolu_refused", "Exit code 1\nงานยังรันอยู่"),
    runs(52, 'bun twin.ts followup 1101-0900-shop-queued "ต่อ"; bun twin.ts wait 1101-0900-shop-queued', "toolu_waited"),
    failed(51.9, "toolu_waited", "Exit code 1\nส่ง turn 3 แล้ว · รอผล\nไม่ได้รอคำตอบอยู่"),
    says(40, "ผมแนะนำ push เลยไหม"),
    owner(39, "ไม่เอา"),
    says(30, "ผมแนะนำใช้ A ไหม"),
    owner(29, "ไม่ใช่ ใช้ B"),
    says(25, "ผมแนะนำแบบ A ไหม"),
    owner(24, "ทำใหม่"),
    says(20, "แก้ตามคำแนะนำของ reviewer แล้ว เปิดดูไหม"),
    owner(19, "เปิด"),
  ];
  sb.write(join("..", "home", ".claude", "projects", realpathSync(sb.repo).replace(/[^A-Za-z0-9]/g, "-"), "s.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  const index = readFileSync(join(sb.repo, "state/audit/index.md"), "utf8");
  expect(index).toContain("ตัวชี้วัดหลัก: งานที่ส่งแล้วไม่ต้องแตะอีก 8/13 (62%) + ยังไม่นับ 1");
  expect(index).toContain("- 7 วัน: 5 ครั้ง · ตอบ worker 4 · อนุมัติ gate 1 · ปิดงาน 0 · ส่งงานใหม่ 0");
  expect(index).toContain(": 5 ครั้ง · เจ้าของสั่งแก้ run เดียวกันทีหลัง 1 ครั้ง");
  expect(index).toContain("- 7 วัน: ถาม 5 · มีคำแนะนำ 4 (ตาม 1 · ค้าน 2 · ตอบอย่างอื่น 1) · ตามที่แนะนำ 1/3 (33%)");
  expect(index).toContain("อนุมัติ gate 0/1 (0%)");
  expect(index).toContain("ส่งงานใหม่ 1/1 (100%)");
  expect(index).toContain('ค้าน "ไม่ใช่ ใช้ B"');
  const log = readFileSync(join(sb.repo, "state/audit/decisions.md"), "utf8");
  expect(log).toContain("# ตัดสินแทน · 5 ครั้ง");
  expect(log).toContain('ตอบ worker · 1101-0900-shop-overruled · งานแจ้งว่าเสร็จ · เจ้าของสั่งแก้ทีหลัง: "ไม่ใช่ ยังต้องแก้ header"');
  expect(log.match(/shop-queued/g)).toHaveLength(1);
  expect(log.match(/shop-gamo-answered/g)).toHaveLength(1);
  expect(log).not.toContain("ปิดงาน");
});
