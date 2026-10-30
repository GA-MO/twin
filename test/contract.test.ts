import { expect, test } from "bun:test";
import { parseBrief } from "../lib/briefs.ts";
import { FINDING_TAGS, RESOLUTIONS, REVIEW_ROUNDS, contract } from "../lib/contract.ts";

const BRIEF = `ชนิด: bug
ขนาด: เล็ก
เป้าหมาย: ปุ่มบันทึกกดได้อีกครั้ง
อ้างอิง: src/save.ts
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: กดบันทึกแล้วข้อมูลขึ้นในรายการ
ลงที่: push branch นี้เท่านั้น
อาการ: กดบันทึกแล้วไม่มีอะไรเกิดขึ้น
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
