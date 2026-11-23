import { expect, test } from "bun:test";
import { KINDS, parseBrief } from "../lib/briefs.ts";
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

test("with pstack the worker copies the playbook's steps into its task list and names no skills for it", () => {
  const text = contract("nok", { kind: "poteto", dir: "/p/skills/poteto-mode" });
  expect(text).toContain("one TaskCreate item per playbook step");
  expect(text).toContain("skip: <reason>");
  expect(text).toMatch(/deslop skill before the last commit and the no-comments skill/);
  for (const [kind, spec] of Object.entries(KINDS)) {
    const brief = [`ชนิด: ${kind}`, "ขนาด: กลาง", ...["เป้าหมาย", "อ้างอิง", "ห้าม", "เสร็จเมื่อ", "ลงที่", ...spec.lines].map((k) => `${k}: x`)].join("\n");
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

test("a UI brief carries the owner's taste file for every UI reviewer, a bug brief does not", () => {
  const taste = "# What the owner sends UI back for\n\n## 1. The same thing looks the same everywhere\n- 2026-11-17 \"button radius มันดูไม่เท่ากันหลายจุด\"";
  const ui = BRIEF.replace("ชนิด: bug", "ชนิด: ui-vibe").replace(/^อาการ:.*$/m, "คนใช้: เจ้าของ\nแนว: linear.app");
  const prompt = parseBrief(ui, "nok", { kind: "lean" }, taste).prompt;
  expect(prompt).toEndWith("## What the owner sends UI back for\n\n## 1. The same thing looks the same everywhere\n- 2026-11-17 \"button radius มันดูไม่เท่ากันหลายจุด\"");
  expect(parseBrief(BRIEF, "nok", { kind: "lean" }, taste).prompt).not.toContain("radius");
  expect(parseBrief(ui, "nok", { kind: "lean" }).prompt).not.toContain("sends UI back");
  expect(contract("nok", { kind: "lean" })).toContain('ends with "## What the owner sends UI back for": every reviewer that looks at the UI');
});
