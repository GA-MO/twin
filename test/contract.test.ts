import { expect, test } from "bun:test";
import { join } from "node:path";
import { KINDS, designRefs, parseBrief } from "../lib/briefs.ts";
import { ROOT } from "../lib/profile.ts";
import { FINDING_TAGS, RESOLUTIONS, REVIEW_ROUNDS, contract, tasteSection } from "../lib/contract.ts";

const BRIEF = `ชนิด: bug
ขนาด: เล็ก
เป้าหมาย: ปุ่มบันทึกกดได้อีกครั้ง
อ้างอิง: src/save.ts
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: กดบันทึกแล้วข้อมูลขึ้นในรายการ
ลงที่: push branch นี้เท่านั้น
อาการ: กดบันทึกแล้วไม่มีอะไรเกิดขึ้น
ทำซ้ำที่: ในเครื่อง ด้วย test
คงไว้: หน้ารายการเดิม`;

test("without pstack the worker gets the lean method and no poteto pointers", () => {
  const text = contract("nok", { kind: "lean" });
  expect(text).toContain("nok-mode");
  expect(text).toContain("No method plugin is installed");
  expect(text).not.toContain("poteto");
  expect(parseBrief(BRIEF, "nok", { kind: "lean" }).prompt).not.toContain("poteto");
});

test("with pstack the worker is pointed at poteto-mode's playbook", () => {
  const text = contract("nok", { kind: "poteto", dir: "/p/skills/poteto-mode" });
  expect(text).toContain("/p/skills/poteto-mode/SKILL.md");
  expect(parseBrief(BRIEF, "nok", { kind: "poteto", dir: "/p" }).prompt).toContain("bug-fix playbook");
});

test("with pstack the worker copies the playbook's steps into its task list and names no skills for it", () => {
  const text = contract("nok", { kind: "poteto", dir: "/p/skills/poteto-mode" });
  expect(text).toContain("one TaskCreate item per playbook step");
  expect(text).toContain("skip: <reason>");
  expect(text).toMatch(/deslop skill before the last commit and the no-comments skill/);
  for (const [kind, spec] of Object.entries(KINDS)) {
    const brief = [`ชนิด: ${kind}`, "ขนาด: กลาง", ...["เป้าหมาย", "อ้างอิง", "ห้าม", "เสร็จเมื่อ", "ลงที่", ...spec.lines].map((k) => `${k}: ${k === "แบบ" ? "https://x.test/mock" : "x"}`)].join("\n");
    expect(parseBrief(brief, "nok", { kind: "poteto", dir: "/p" }).prompt).not.toMatch(/often fit|blast-radius|swarm|arena|fix-ci/);
  }
});

test("a brief missing its kind's lines is refused with what is missing", () => {
  expect(() => parseBrief(BRIEF.replace(/^คงไว้:.*$/m, ""), "nok", { kind: "lean" })).toThrow("คงไว้");
});

test("a secret line below the header, as in a pasted note, is ignored", () => {
  const brief = parseBrief(`${BRIEF}\n\nnote text\nsecret: trello-key`, "nok", { kind: "lean" });
  expect(brief.secrets).toEqual([]);
});

test("a secret that would overwrite a system variable is refused", () => {
  expect(() => parseBrief(BRIEF.replace("ชนิด: bug", "ชนิด: bug\nsecret: path"), "nok", { kind: "lean" })).toThrow("PATH");
});

test("both methods ask the worker to try unlisted inputs and list them, and put a reviewer on กลาง", () => {
  for (const method of [{ kind: "lean" } as const, { kind: "poteto", dir: "/p" } as const]) {
    const text = contract("nok", method);
    expect(text).toContain("inputs_tried");
    expect(text).toContain("design reviewer, a subagent that did not write the change");
    expect(text).toMatch(/- กลาง: .*One independent reviewer/);
    expect(text).toMatch(/- เล็ก: .*No reviewer/);
  }
  expect(contract("nok", { kind: "poteto", dir: "/p" })).toContain("pstack:thermo-nuclear-review-subagent");
});

test("both methods cap review rounds, tag every finding and name every resolution the report schema takes", () => {
  for (const method of [{ kind: "lean" } as const, { kind: "poteto", dir: "/p" } as const]) {
    const text = contract("nok", method);
    expect(text).toContain(`at most ${REVIEW_ROUNDS} per turn`);
    expect(text).toContain(`raised in round ${REVIEW_ROUNDS} is not fixed`);
    for (const tag of FINDING_TAGS) expect(text).toContain(`${tag} (`);
    const resolutions = text.slice(text.indexOf("with its resolution:"));
    for (const r of RESOLUTIONS) expect(resolutions).toMatch(new RegExp(`\\b${r}\\b`));
  }
});

test("the owner's taste becomes a section of the terms with its headings one level down and its intro left out", () => {
  const file = "# What the owner sends UI back for\n\nNotes for improve only.\n\n## 1. The same thing looks the same everywhere\n- 2026-11-17 \"button radius มันดูไม่เท่ากันหลายจุด\"\n";
  expect(tasteSection(file)).toBe('## What the owner sends UI back for\n\n### 1. The same thing looks the same everywhere\n- 2026-11-17 "button radius มันดูไม่เท่ากันหลายจุด"');
  expect(tasteSection("# only a title\n")).toBe("");
});

const UI = `ชนิด: ui
ขนาด: เล็ก
เป้าหมาย: เมนูชุดใช้ง่ายขึ้น
อ้างอิง: src/Menu.tsx
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: เมนูตรงแบบ
ลงที่: push branch นี้เท่านั้น
คนใช้: แอดมิน
แบบ: ปุ่มชิดขวา
ต้นแบบ: src/components/SearchSelectInput.tsx · หน้า /orders
คงไว้: บันทึกได้`;

test("a design the brief only describes, keeps in a scratchpad, or cannot find is refused; one it points to becomes an ask", () => {
  const ui = (line: string, kind = "ui") => UI.replace("ชนิด: ui", `ชนิด: ${kind}`).replace(/^แบบ:.*$/m, `แบบ: ${line}`);
  expect(() => parseBrief(ui('ทำตามหน้าแบบส่วน A–E ทุกข้อในคอลัมน์ "แก้เป็น" · A รายการ: ป้ายสถานะเดียวต่อแถว'), "nok", { kind: "lean" })).toThrow("หน้าแบบ");
  expect(() => parseBrief(ui("ภาพจำลอง 4 ภาพข้างบน (จอ 1280 และมือถือ 393)"), "nok", { kind: "lean" })).toThrow("path หรือ URL");
  expect(() => parseBrief(ui("/private/tmp/claude-501/x/scratchpad/mock/index.html ส่วน A–E"), "nok", { kind: "lean" })).toThrow("scratchpad");
  expect(() => parseBrief(ui("/Users/nobody-here/mock.png"), "nok", { kind: "lean" })).toThrow("ไม่มีอยู่");
  expect(() => parseBrief(ui("หน้าใหม่โล่งกว่าเดิม", "ui-redo").replace("คงไว้:", "ของเดิม: https://uat.x.test\nคงไว้:"), "nok", { kind: "lean" })).toThrow("ต้องชี้ไปที่ไฟล์");
  expect(parseBrief(ui("ทำ 2-3 แบบเป็นภาพนิ่งให้เจ้าของเลือกก่อน"), "nok", { kind: "lean" }).asks.filter((a) => a.id.startsWith("m"))).toEqual([]);
  for (const plain of ["ปุ่ม Save ให้เหมือนใน /users/settings", "เหมือนหน้า /home", "รูปสินค้าแสดงภาพแบบเต็มความกว้าง", "ทำให้หน้าแบบเดียวกับหน้า Orders", "ใช้ข้อมูล mock ก่อน"]) {
    const brief = parseBrief(ui(plain), "nok", { kind: "lean" });
    expect([plain, brief.asks.some((a) => a.id.startsWith("m"))]).toEqual([plain, false]);
  }
  expect(designRefs("Figma https://figma.com/x, https://figma.com/y")).toEqual(["https://figma.com/x", "https://figma.com/y"]);
  expect(designRefs('ภาพ "/Users/x/Desktop/Screenshot 2026-11-24 at 10.00.00.png" ส่วน D')).toEqual(["/Users/x/Desktop/Screenshot 2026-11-24 at 10.00.00.png"]);
  expect(designRefs("notes/2026-11-23-flash-schedule-design/")[0]).toBe(join(ROOT, "notes/2026-11-23-flash-schedule-design/"));
  const mock = `${import.meta.dir}/contract.test.ts`;
  const pointed = parseBrief(ui(`${mock} ส่วน D`), "nok", { kind: "lean" }).asks;
  expect(pointed.find((a) => a.id === "m1")?.text).toContain(mock);
});

test("ต้นแบบ names what to match or reuse, one ask each, and ไม่มี needs a reason", () => {
  const asks = parseBrief(UI, "nok", { kind: "lean" }).asks.filter((a) => a.id.startsWith("c"));
  expect(asks.map((a) => a.id)).toEqual(["c1", "c2"]);
  expect(asks[0]?.text).toContain("src/components/SearchSelectInput.tsx");
  expect(() => parseBrief(UI.replace(/^ต้นแบบ:.*$/m, ""), "nok", { kind: "lean" })).toThrow("ต้นแบบ");
  expect(() => parseBrief(UI.replace(/^ต้นแบบ:.*$/m, "ต้นแบบ: ไม่มี"), "nok", { kind: "lean" })).toThrow("เหตุผล");
  expect(parseBrief(UI.replace(/^ต้นแบบ:.*$/m, "ต้นแบบ: ไม่มี: หน้าแรกของ project"), "nok", { kind: "lean" }).asks.some((a) => a.id.startsWith("c"))).toBe(false);
});

test("a bug names where the owner saw it, and that place is an ask", () => {
  expect(() => parseBrief(BRIEF.replace(/^ทำซ้ำที่:.*\n/m, ""), "nok", { kind: "lean" })).toThrow("ทำซ้ำที่");
  expect(parseBrief(BRIEF, "nok", { kind: "lean" }).asks.find((a) => a.id === "r1")?.text).toBe("ในเครื่อง ด้วย test");
});
