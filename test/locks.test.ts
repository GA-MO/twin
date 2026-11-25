import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lockProblems } from "../lib/dispatch.ts";
import { parseAsks, parseBrief, parseLocks } from "../lib/briefs.ts";
import { evidenceDirs } from "../lib/verify.ts";
import { sandbox, STUB_NO_VERIFIER, type Sandbox } from "./harness.ts";

const BASE = { outcome: "needs-input", did: "ทำภาพนิ่ง", pending: "-", discovered: "-", verified: "-", clicked: [], inputs_tried: [], design: [], removed: [], ideas: [], gates_requested: [], ledger: [], review: { rounds: 0, findings: [] } };
const brief = (lock: string, kind = "feature") => `ชนิด: ${kind}
ขนาด: กลาง
เป้าหมาย: คนขายเห็นราคาชุดชัด
อ้างอิง: src/bundle.tsx
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: ราคาชุดแสดงครบทุกแบบ
ลงที่: push branch นี้เท่านั้น
คนใช้: คนขายหน้าร้าน
flow: เปิดชุด เห็นราคา
ต้นแบบ: หน้าสินค้าเดี่ยว
คงไว้: หน้ารายการ
${lock}`;
const LEAN = { kind: "lean" as const };

let s: Sandbox;
let project = "";

beforeAll(() => {
  s = sandbox("twin-locks-");
  const count = join(s.work, "count");
  writeFileSync(
    join(s.bin, "claude"),
    `#!/bin/sh\nif [ "$1" = agents ]; then echo "[]"; exit 0; fi\n${STUB_NO_VERIFIER}\ncase "$*" in *--json-schema*) ;; *) echo '{}'; exit 0;; esac\nn=$(cat ${JSON.stringify(count)} 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${JSON.stringify(count)}\n[ -f ${JSON.stringify(s.work)}/act-$n.sh ] && sh ${JSON.stringify(s.work)}/act-$n.sh\nprintf '{"subtype":"success","is_error":false,"result":"ok","structured_output":%s}' "$(cat ${JSON.stringify(s.work)}/report-$n.json)"\n`,
    { mode: 0o755 },
  );
  project = join(s.work, "proj");
  mkdirSync(project, { recursive: true });
  s.git(project, "init", "-q", "-b", "main");
  writeFileSync(join(project, "bundle.tsx"), "export const Bundle = 1;\n");
  s.git(project, "add", "-A");
  s.git(project, "commit", "-q", "-m", "base");
  expect(s.twin(["setup", "gamo", "--no-schedule"]).code).toBe(0);
}, 120_000);

afterAll(() => s.remove());

test("a lock line names the parts to settle first; a part with = and a real file is already approved and becomes an ask", () => {
  const still = join(process.cwd(), "README.md");
  const locks = parseLocks("feature", `layout หน้ารายละเอียดชุด · ราคาชุด = ${still}`);
  expect(locks).toEqual([
    { id: "l1", part: "layout หน้ารายละเอียดชุด", approved: [], waived: false },
    { id: "l2", part: "ราคาชุด", approved: [still], waived: false },
  ]);
  expect(parseLocks("feature", `layout=${still}`)).toEqual([{ id: "l1", part: "layout", approved: [still], waived: false }]);
  expect(parseAsks(brief(`ล็อก: layout · ราคาชุด = ${still}`)).filter((a) => a.from === "ล็อก")).toEqual([{ id: "l2", from: "ล็อก", text: `ราคาชุด ตรงกับภาพที่เจ้าของอนุมัติใน ${still} ส่วนที่ต่างอยู่ใน report พร้อมเหตุผล` }]);
  expect(parseLocks("feature", "")).toEqual([]);
});

test("a lock line is refused on kinds that build nothing, and when its approved file is missing, a scratchpad, or not a path", () => {
  for (const kind of ["design", "plan", "release", "deps", "ci"]) expect(() => parseLocks(kind, "layout")).toThrow(`ไม่ใช้กับชนิด ${kind}`);
  expect(() => parseLocks("feature", "layout = /Users/nobody/none.png")).toThrow("ไม่มีอยู่");
  expect(() => parseLocks("feature", "layout = notes/2099-01-01-none/a.png")).toThrow("ไม่มีอยู่");
  expect(() => parseLocks("feature", "layout = /tmp/x.png")).toThrow("scratchpad");
  expect(() => parseLocks("feature", "layout = เดี๋ยวส่งให้")).toThrow("หลัง = ต้องเป็น path");
  expect(() => parseLocks("feature", " = /tmp")).toThrow();
});

test("the worker is told to lock first only while a locked part is unapproved", () => {
  expect(parseBrief(brief("ล็อก: layout หน้ารายละเอียดชุด"), "gamo", LEAN).prompt).toContain("Lock first. l1 (layout หน้ารายละเอียดชุด) is costly to undo");
  expect(parseBrief(brief(`ล็อก: layout = ${join(process.cwd(), "README.md")}`), "gamo", LEAN).prompt).not.toContain("Lock first");
  expect(parseBrief(brief(""), "gamo", LEAN).prompt).not.toContain("Lock first");
});

test("an unapproved lock passes only with 2-4 named stills that exist, no tracked change, and needs-input", () => {
  const png = join(s.work, "a.png");
  writeFileSync(png, "x");
  const locks = [{ id: "l1", part: "layout", approved: [], waived: false }];
  const opt = (name: string, file = png) => ({ name, file, why: "-" });
  const good = { outcome: "needs-input" as const, locks: [{ lock: "l1", options: [opt("A"), opt("B")] }] };
  expect(lockProblems(locks, good, [".twin-scratch/a.png"])).toEqual([]);
  expect(lockProblems([{ id: "l1", part: "layout", approved: [png], waived: false }], { outcome: "done", locks: [] }, ["src/x.tsx"])).toEqual([]);
  expect(lockProblems([{ id: "l1", part: "layout", approved: [], waived: true }], { outcome: "done", locks: [] }, ["src/x.tsx"])).toEqual([]);
  const problems = (report: Parameters<typeof lockProblems>[1], changed: string[] = []) => lockProblems(locks, report, changed).join("\n");
  expect(problems(good, ["src/bundle.tsx"])).toContain("แก้ไฟล์ที่ track: src/bundle.tsx");
  expect(problems({ ...good, outcome: "done" })).toContain("outcome ต้องเป็น needs-input");
  expect(problems({ ...good, locks: [] })).toContain("l1 (layout) ยังไม่มีแบบให้เลือก");
  expect(problems({ ...good, locks: [{ lock: "l1", options: [opt("A")] }] })).toContain("l1 มี 1 แบบ ต้องมี 2-4");
  expect(problems({ ...good, locks: [{ lock: "l1", options: ["A", "B", "C", "D", "E"].map((n) => opt(n)) }] })).toContain("l1 มี 5 แบบ");
  expect(problems({ ...good, locks: [{ lock: "l1", options: [opt("A"), opt("a")] }] })).toContain("ไม่ซ้ำกัน");
  expect(problems({ ...good, locks: [{ lock: "l1", options: [opt("A"), opt(" ")] }] })).toContain("ไม่ว่าง");
  for (const file of ["a.png", join(s.work, "missing.png"), join(s.work, "a.exe"), ""]) expect(problems({ ...good, locks: [{ lock: "l1", options: [opt("A"), opt("B", file)] }] })).toContain("absolute path");
});

const idFrom = (out: string) => out.match(/ส่งแล้ว (\S+)/)?.[1] ?? "";

test("the verifier gets read access to the still a lock ask names", () => {
  const dir = join(s.work, "picked");
  mkdirSync(dir, { recursive: true });
  const still = join(dir, "l1-2.png");
  writeFileSync(still, "x");
  const ask = { id: "l1", from: "ล็อก" as const, text: `ราคาชุด ตรงกับภาพที่เจ้าของอนุมัติใน ${still} ส่วนที่ต่างอยู่ใน report พร้อมเหตุผล` };
  expect(evidenceDirs({ asks: [{ ask, claim: null }] })).toEqual([dir]);
});

test("a run with a lock builds nothing until the owner picks: a building turn is sent back, the stills wait for a pick, and the pick becomes an ask", () => {
  const stills = join(s.work, "stills");
  mkdirSync(stills, { recursive: true });
  for (const n of ["a", "b"]) writeFileSync(join(stills, `${n}.png`), n);
  writeFileSync(join(s.work, "act-1.sh"), `echo "export const Bundle = 2;" > bundle.tsx\n`);
  writeFileSync(join(s.work, "report-1.json"), JSON.stringify({ ...BASE, outcome: "done", locks: [] }));
  writeFileSync(join(s.work, "act-2.sh"), "git checkout -- bundle.tsx\n");
  const options = [{ name: "A", file: join(stills, "a.png"), why: "ราคาใหญ่บนสุด" }, { name: "B", file: join(stills, "b.png"), why: "ราคาในตาราง" }];
  writeFileSync(join(s.work, "report-2.json"), JSON.stringify({ ...BASE, locks: [{ lock: "l1", options }, { lock: "l2", options }] }));
  writeFileSync(join(s.work, "report-3.json"), JSON.stringify({ ...BASE, did: "ตอบคำถาม", locks: [] }));
  writeFileSync(join(s.work, "report-4.json"), JSON.stringify({ ...BASE, locks: [{ lock: "l1", options }, { lock: "l2", options }] }));
  writeFileSync(join(s.work, "report-5.json"), JSON.stringify({ ...BASE, did: "รอ l2", locks: [{ lock: "l2", options }] }));
  writeFileSync(join(s.work, "report-6.json"), JSON.stringify({ ...BASE, outcome: "done", locks: [] }));

  const sent = s.twin(["dispatch", project, "bundle-price"], brief("ล็อก: ราคาชุด · ป้ายชุด"));
  expect(sent.err).toBe("");
  const id = idFrom(sent.out);
  const runDir = join(s.repo, "runs", id);
  expect(readFileSync(join(runDir, "turn-1/prompt.md"), "utf8")).toContain("Lock first");
  s.twin(["wait", id]);
  for (let i = 0; i < 50 && !existsSync(join(runDir, "turn-2/exit")); i++) Bun.sleepSync(200);
  const check = readFileSync(join(runDir, "turn-2/prompt.md"), "utf8");
  expect(check).toContain("แก้ไฟล์ที่ track: bundle.tsx");
  expect(check).toContain("l1 (ราคาชุด) ยังไม่มีแบบให้เลือก");
  expect(check).toContain("outcome ต้องเป็น needs-input");
  expect(check).toContain("Lock first");
  s.twin(["wait", id]);
  expect(existsSync(join(runDir, "turn-3"))).toBe(false);
  expect(s.twin(["runs", id]).out).toContain(`ล็อก l1 ราคาชุด: รอเจ้าของเลือก (followup ${id} --pick l1=<แบบ>)`);

  expect(s.twin(["followup", id, "B ต่างจาก A ยังไง"]).err).toBe("");
  s.twin(["wait", id]);
  for (let i = 0; i < 50 && !existsSync(join(runDir, "turn-4/exit")); i++) Bun.sleepSync(200);
  expect(readFileSync(join(runDir, "turn-4/prompt.md"), "utf8")).toContain("l1 (ราคาชุด) ยังไม่มีแบบให้เลือก");
  s.twin(["wait", id]);
  expect(s.twin(["followup", id, "--approve", "push", "push เลย"]).err).toContain("ยังมีล็อกที่เจ้าของยังไม่เลือกแบบ (l1, l2)");
  expect(s.twin(["followup", id, "--approve", "push", "--pick", "l1=A", "push เลย"]).err).toContain("(l2)");
  expect(s.twin(["followup", id, "--pick", "l9=A"]).err).toContain("งานนี้ไม่มีล็อก l9");
  expect(s.twin(["followup", id, "--pick", "l1=Z"]).err).toContain('ไม่มีแบบ "z"');
  expect(s.twin(["followup", id, "--pick", "l1"]).err).toContain("--pick ต้องเป็น <lock>=<แบบ>");
  expect(s.twin(["followup", id, "--pick", "l1=+"]).err).toContain("อย่างน้อยหนึ่งแบบ");
  expect(s.twin(["followup", id, "--pick"]).err).toContain("--pick ต้องตามด้วย");
  expect(s.twin(["followup", id, "--pick", "l1=A", "--pick", "l1=B"]).err).toContain("--pick l1 ซ้ำ");
  expect(JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")).locks.every((l: { approved: string[] }) => !l.approved.length)).toBe(true);

  expect(s.twin(["followup", id, "--pick", "l1=b+a"]).err).toBe("");
  const partial = readFileSync(join(runDir, "turn-5/prompt.md"), "utf8");
  expect(partial).toContain("เจ้าของเลือก l1 (ราคาชุด) แบบ B + A");
  expect(partial).toContain("เก็บไว้ก่อน ยังไม่สร้างจนกว่าจะเลือกครบทุกล็อก");
  expect(partial).toContain("Lock first. l2 (ป้ายชุด)");
  expect(existsSync(join(runDir, "turn-5/touch"))).toBe(false);
  s.twin(["wait", id]);

  const picked = s.twin(["followup", id, "--pick", "l2=skip", "เอาตัวเลขให้ใหญ่ขึ้นอีกนิด"]);
  expect(picked.err).toBe("");
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
  const [b, a] = run.locks[0].approved as string[];
  expect(b!.endsWith(`/runs/${id}/locks/l1-2.png`)).toBe(true);
  expect(a!.endsWith(`/runs/${id}/locks/l1-1.png`)).toBe(true);
  expect(readFileSync(b!, "utf8")).toBe("b");
  expect(run.locks[1]).toEqual({ id: "l2", part: "ป้ายชุด", approved: [], waived: true });
  expect(run.asks.filter((x: { id: string }) => x.id.startsWith("l")).map((x: { id: string }) => x.id)).toEqual(["l1"]);
  const next = readFileSync(join(runDir, "turn-6/prompt.md"), "utf8");
  expect(next).toContain("เจ้าของให้ข้ามการเลือกแบบของ l2 (ป้ายชุด)");
  expect(next).toContain("เอาตัวเลขให้ใหญ่ขึ้นอีกนิด");
  expect(next).not.toContain("Lock first");
  expect(next).toContain("- l1: ราคาชุด ตรงกับภาพที่เจ้าของอนุมัติ");
  expect(existsSync(join(runDir, "turn-6/touch"))).toBe(true);
  s.twin(["wait", id]);
  expect(s.twin(["followup", id, "--pick", "l1=A"]).err).toContain("l1 ตัดสินไปแล้ว");
  expect(s.twin(["followup", id, "--pick", "l2=A"]).err).toContain("เจ้าของให้ข้าม");
  expect(s.twin(["close", id, "--discard"]).code).toBe(0);
}, 120_000);
