import { afterAll, expect, test } from "bun:test";
import { readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_ID, sandbox } from "./harness.ts";

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

test("the main number is the share of settled handed-off runs the owner never had to touch again; the rest split into sent back as wrong, more asked, and work thrown away, and each project shows its own share", () => {
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null }));
  run("one-turn", [{ prompt: "brief" }]);
  run("system-check", [{ prompt: "brief" }, { prompt: "turn นี้แก้ code ...", marks: ["check"] }]);
  run("approved", [{ prompt: "brief" }, { prompt: "อนุมัติแล้ว: push (เฉพาะ turn นี้)\npush ได้" }]);
  run("fixed", [{ prompt: "brief" }, { prompt: "ปุ่มยังเพี้ยน แก้ใหม่" }]);
  run("fixed-with-a-check", [{ prompt: "brief" }, { prompt: "ปุ่มยังเพี้ยน\n\nturn นี้แก้ไฟล์ที่รับ input: src/parse.ts ลอง input ที่ brief ไม่ได้บอก แล้วรายงานใหม่", marks: ["check", "touch"] }]);
  run("still-running", [{ prompt: "brief" }], { finished: false });
  run("eval-run", [{ prompt: "brief" }, { prompt: "แก้" }], { isolated: true });
  run("broken", [{ prompt: "brief" }], { runJson: "{ not json" });
  run("accepted", [{ prompt: "brief" }, { prompt: "อนุมัติแล้ว: push (เฉพาะ turn นี้)\nเก็บงาน: เจ้าของรับผลแล้ว แก้เฉพาะบั๊ก", marks: ["touch"] }]);
  const shop = (id: string) => JSON.stringify({ id, isolated: false, project: "shop" });
  run("thrown-away", [{ prompt: "brief" }], { runJson: shop("thrown-away") });
  run("sent-back-with-the-flag", [{ prompt: "brief" }, { prompt: "อนุมัติแล้ว: push (เฉพาะ turn นี้)\nทำหน้า about ตามแบบนี้", marks: ["touch"] }], { runJson: shop("sent-back-with-the-flag") });
  sb.write("runs/sent-back-with-the-flag/turn-2/touch", "fix");
  run("asked-for-more", [{ prompt: "brief" }, { prompt: "อนุมัติแล้ว: push (เฉพาะ turn นี้)\nเพิ่มหน้า about ด้วย", marks: ["touch"] }], { runJson: shop("asked-for-more") });
  sb.write("runs/thrown-away/closed.md", "closed 2026-11-01T00:00:00.000Z · 2 commits · pushed false · discard true · dropped true\n");
  run("closed-by-an-older-engine", [{ prompt: "brief" }]);
  sb.write("runs/closed-by-an-older-engine/closed.md", "closed 2026-11-01T00:00:00.000Z · 2 commits · pushed false · discard true\n");
  run("own-repo", [{ prompt: "brief" }], { runJson: JSON.stringify({ id: "own-repo", isolated: false, repo: realpathSync(sb.repo) }) });
  const r = sb.twin(["sync", "audit"]);
  expect(r.err).toBe("");
  const index = readFileSync(join(sb.repo, "state/audit/index.md"), "utf8");
  expect(index).toContain("ตัวชี้วัดหลัก: งานที่ส่งแล้วไม่ต้องแตะอีก 5/11 (45%) + ยังไม่นับ 1");
  expect(index).toContain("ที่เหลือ: เจ้าของส่งกลับไปแก้ของผิดอย่างน้อย 3 · เพิ่มโจทย์หรือตอบคำถาม 2 · ปิดแบบทิ้งงาน 1");
  expect(index).toContain("งานที่ส่ง 12: ในโปรเจกต์อื่น 11 · ของ nok เอง 1");
  expect(index).toContain("- shop: 0/3 (0%) · แก้ของผิด 1 · เพิ่มโจทย์หรือตอบคำถาม 1 · ทิ้งงาน 1\n- ไม่ระบุโปรเจกต์: 5/8 (63%) + ยังไม่นับ 1 · แก้ของผิด 2 · เพิ่มโจทย์หรือตอบคำถาม 1 · ทิ้งงาน 0");
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
  expect(readFileSync(join(sb.repo, "state/audit/ledger.jsonl"), "utf8")).not.toContain("header");
  expect(readFileSync(join(sb.repo, "state/audit/decisions.md"), "utf8")).toContain("ตอบ worker · 1101-0900-shop-overruled · งานแจ้งว่าเสร็จ · เจ้าของสั่งแก้ทีหลัง\n");
  expect(sb.twin(["profile", "source.claudeCode=on"]).code).toBe(0);
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  const index = readFileSync(join(sb.repo, "state/audit/index.md"), "utf8");
  expect(index).toContain("ตัวชี้วัดหลัก: งานที่ส่งแล้วไม่ต้องแตะอีก 10/19 (53%) + ยังไม่นับ 1");
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

test("what Claude Code deletes stays counted, an unreadable history is flagged, and a change is called worse only when it stands out from noise", () => {
  const transcripts = join(sb.home, ".claude", "projects", realpathSync(sb.repo).replace(/[^A-Za-z0-9]/g, "-"));
  const main = () => readFileSync(join(sb.repo, "state/audit/index.md"), "utf8").match(/ไม่ต้องแตะอีก (\S+ \S+)/)?.[1];
  const items = () => readFileSync(join(sb.repo, "state/brief/audit.json"), "utf8");
  expect(main()).toBe("10/19 (53%)");

  sb.write("runs/one-turn/turn-2/pid", "1");
  sb.write("runs/one-turn/turn-2/prompt.md", "ต่อจาก Desktop");
  sb.write("runs/one-turn/turn-2/touch", "");
  utimesSync(sb.write("runs/one-turn/turn-2/exit", "0"), DAY_AGO, DAY_AGO);
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  expect(main()).toBe("9/19 (47%)");

  rmSync(transcripts, { recursive: true });
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  const kept = readFileSync(join(sb.repo, "state/audit/index.md"), "utf8");
  expect(main()).toBe("9/19 (47%)");
  expect(kept).toContain(": 5 ครั้ง · เจ้าของสั่งแก้ run เดียวกันทีหลัง 1 ครั้ง");
  expect(readFileSync(join(sb.repo, "state/audit/decisions.md"), "utf8")).toContain("ตอบ worker · 1101-0900-shop-overruled");
  expect(items()).toContain("audit อ่านประวัติ session ไม่ได้");

  sb.write(join("..", "home", ".claude", "settings.json"), JSON.stringify({ cleanupPeriodDays: 0 }));
  sb.write(join("..", "home", ".claude", "projects", realpathSync(sb.repo).replace(/[^A-Za-z0-9]/g, "-"), "later.jsonl"), JSON.stringify({ type: "assistant", timestamp: new Date().toISOString(), message: { model: "claude-test", content: [{ type: "text", text: "เสร็จแล้ว" }] } }));
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const ddmm = (d: Date) => d.toLocaleDateString("sv-SE").slice(5).split("-").reverse().join("/");
  const dated = (id: string, n: number, turnPrompts: string[], repo?: string) => run(id, turnPrompts.map((prompt) => ({ prompt })), { runJson: JSON.stringify({ id, isolated: false, startedAt: daysAgo(n).toISOString(), repo }) });
  for (const n of [12, 13, 14, 15, 16]) for (const half of ["a", "b"]) dated(`before-${n}${half}`, n, ["brief"]);
  dated("before-fixture", 12, ["brief", "แก้"], join(tmpdir(), "twin-arms-1", "repo"));
  dated("before-fixture-scheduler", 12, ["brief", "แก้"], "/var/folders/zz/T/twin-arms-2/repo");
  for (const n of [3, 4, 5, 6, 7]) for (const half of ["a", "b"]) dated(`after-${n}${half}`, n, ["brief", "ยังผิด แก้ใหม่"]);
  const commit = (subject: string, at: Date) =>
    Bun.spawnSync(["git", "-C", sb.repo, "commit", "-q", "--allow-empty", "-m", subject], { env: { ...process.env, ...GIT_ID, HOME: sb.home, GIT_AUTHOR_DATE: at.toISOString(), GIT_COMMITTER_DATE: at.toISOString() } });
  sb.git(sb.repo, "init", "-q");
  commit("improve: stricter review", daysAgo(10));
  commit("improve: shorter replies", new Date());
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  const index = readFileSync(join(sb.repo, "state/audit/index.md"), "utf8");
  expect(index).toContain(": 5 ครั้ง · เจ้าของสั่งแก้ run เดียวกันทีหลัง 1 ครั้ง");
  expect(index).toContain(`- improve ${ddmm(daysAgo(10))}: งานที่ส่งแล้วไม่ต้องแตะอีก 10/10 (100%) → 0/10 (0%) · แย่ลง`);
  expect(index).toContain(`- improve ${ddmm(new Date())}: ยังเร็วไป อีก 8 วันจึงเทียบได้`);
  expect(items()).toContain(`หลัง improve ${ddmm(daysAgo(10))} งานที่ส่งแล้วไม่ต้องแตะอีกลดจาก 100% เป็น 0% เกินความแกว่งปกติ`);
  expect(items()).not.toContain("audit อ่านประวัติ session ไม่ได้");
  expect(items()).not.toContain("ลดเป็นถามก่อน");

  const ledger = join(sb.repo, "state/audit/ledger.jsonl");
  writeFileSync(ledger, readFileSync(ledger, "utf8").replace(/"touch":"(none|more|fix)"/g, (_, touch) => `"touched":${touch !== "none"}`).replace(/"dropped":/g, '"discarded":'));
  rmSync(join(sb.repo, "runs/accepted"), { recursive: true });
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  expect(readFileSync(ledger, "utf8")).not.toContain('"touched"');
  expect(readFileSync(ledger, "utf8")).toContain('{"id":"accepted","project":null,"touch":"more","settled":true,"dropped":false}');
  const before = readFileSync(ledger, "utf8");
  expect(sb.twin(["profile", "collector.audit=off"]).code).toBe(0);
  sb.twin(["sync"]);
  expect(readFileSync(ledger, "utf8")).toBe(before);
  expect(sb.twin(["profile", "collector.audit=on"]).code).toBe(0);
  writeFileSync(ledger, `${before}{ broken\n`);
  expect(sb.twin(["sync", "audit"]).out).toContain("audit: error");
  expect(readFileSync(ledger, "utf8")).toBe(`${before}{ broken\n`);
});

test("an action the twin took on its own and the owner then corrected three times or more reaches the brief as one to consider asking about first", () => {
  const ledger = join(sb.repo, "state/audit/ledger.jsonl");
  writeFileSync(ledger, readFileSync(ledger, "utf8").replace("{ broken\n", ""));
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const lines = ["a", "b", "c"].flatMap((run, i) => [
    { type: "user", timestamp: at(40 - 10 * i), message: { content: "<task-notification> <task-id>x</task-id> done" } },
    { type: "assistant", timestamp: at(39 - 10 * i), message: { content: [{ type: "tool_use", name: "Bash", input: { command: `bun twin.ts followup 1101-0900-shop-${run} "ใช้ทางที่แนะนำ"` } }] } },
    { type: "user", timestamp: at(38 - 10 * i), message: { content: "ไม่ใช่ ต้องถามผมก่อน" } },
    { type: "assistant", timestamp: at(37 - 10 * i), message: { content: [{ type: "tool_use", name: "Bash", input: { command: `bun twin.ts followup 1101-0900-shop-${run} "ถอยกลับ"` } }] } },
  ]);
  sb.write(join("..", "home", ".claude", "projects", realpathSync(sb.repo).replace(/[^A-Za-z0-9]/g, "-"), "overruled.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
  expect(sb.twin(["sync", "audit"]).err).toBe("");
  expect(readFileSync(join(sb.repo, "state/audit/index.md"), "utf8")).toContain("- 30 วัน เจ้าของสั่งแก้ทีหลัง: ตอบ worker 4/7 · อนุมัติ gate 0/1 · ปิดงาน 0/0 · ส่งงานใหม่ 0/0");
  expect(readFileSync(join(sb.repo, "state/brief/audit.json"), "utf8")).toContain('nok ตอบ worker เอง 7 ครั้งใน 30 วัน เจ้าของสั่งแก้ทีหลัง 4 ครั้ง → พิมพ์ \\"improve\\" เพื่อพิจารณาลดเป็นถามก่อน');
});
