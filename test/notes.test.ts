import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandbox } from "./harness.ts";

const sb = sandbox("twin-notes-");
afterAll(() => sb.remove());

test("a note's attachments live in the folder named after it, and a folder with no note of that name reaches the brief", () => {
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: null, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null }));
  sb.write("notes/2026-11-01-qa.md", "---\nkind: todo\n---\n# QA รอบสอง\n");
  sb.write("notes/2026-11-01-qa/shot.png", "png");
  sb.write("notes/2026-11-02-loose-shots/a.png", "png");
  mkdirSync(join(sb.repo, "notes/.cache"), { recursive: true });
  writeFileSync(join(sb.repo, "notes/2026-11-03-plain.md"), "---\nkind: fact\n---\n# plain\n");
  expect(sb.twin(["sync", "notes"]).out).toContain("notes: ok");
  const titles: string[] = JSON.parse(readFileSync(join(sb.repo, "state/brief/notes.json"), "utf8")).items.map((i: { title: string }) => i.title);
  expect(titles).toContain("ไฟล์แนบ notes/2026-11-02-loose-shots/ ไม่มีโน้ตชื่อเดียวกัน: เขียน notes/2026-11-02-loose-shots.md หรือย้ายไปโฟลเดอร์ของโน้ตที่ใช้");
  expect(titles.filter((t) => t.startsWith("ไฟล์แนบ"))).toHaveLength(1);
  expect(titles).toContain("todo: QA รอบสอง (notes/2026-11-01-qa.md)");
});

test("closing a run writes the note for an evidence folder it used that has no note yet, listing every run that named it, and leaves folders only open runs use", () => {
  const runJson = (id: string, slug: string, startedAt: string) =>
    JSON.stringify({ id, project: "shop", repo: "/work/shop", slug, worktree: "/work/shop/.claude/worktrees/nok-x", branch: `nok/${slug}`, base: "origin/develop", session: "s", port: 4101, startedAt, kind: "ui" });
  sb.write("notes/2026-11-05-shop-qa/round1/a.png", "png");
  sb.write("notes/2026-11-05-shop-qa/b.mp4", "mp4");
  sb.write("notes/2026-11-05-wip/a.png", "png");
  sb.write("notes/2026-11-06-QA_รอบ2/a.png", "png");
  sb.write("notes/2026-11-05-shop-bugs.md", "---\nkind: todo\n---\n# bugs\nภาพอยู่ที่ notes/2026-11-05-shop-qa/round1/\n");
  sb.write("runs/1105-0900-shop-qa-fixes/run.json", runJson("1105-0900-shop-qa-fixes", "qa-fixes", "2026-11-05T02:00:00.000Z"));
  sb.write("runs/1105-0900-shop-qa-fixes/turn-1/prompt.md", `ชนิด: bug\nเก็บภาพที่ ${join(sb.repo, "notes/2026-11-05-shop-qa")}/round1/ และ notes/2026-11-06-QA_รอบ2/`);
  sb.write("runs/1105-0900-shop-qa-fixes/closed.md", "closed\n");
  sb.write("runs/1105-1000-shop-retest/run.json", runJson("1105-1000-shop-retest", "retest", "2026-11-05T03:00:00.000Z"));
  sb.write("runs/1105-1000-shop-retest/turn-1/prompt.md", "ชนิด: ui");
  sb.write("runs/1105-1000-shop-retest/queue/1.json", JSON.stringify({ message: "ดู notes/2026-11-05-shop-qa/b.mp4 ด้วย", approve: [] }));
  sb.write("runs/1105-1100-shop-wip/run.json", runJson("1105-1100-shop-wip", "wip", "2026-11-05T04:00:00.000Z"));
  sb.write("runs/1105-1100-shop-wip/turn-1/prompt.md", "เก็บที่ notes/2026-11-05-wip/");
  const adopt = (dry: boolean) => Bun.spawnSync([process.execPath, "-e", `import { adoptAttachments } from "./lib/dispatch.ts"; console.log(JSON.stringify(adoptAttachments(${dry})));`], { cwd: sb.repo });
  expect(JSON.parse(adopt(true).stdout.toString())).toEqual(["2026-11-05-shop-qa", "2026-11-06-QA_รอบ2"]);
  expect(() => readFileSync(join(sb.repo, "notes/2026-11-05-shop-qa.md"), "utf8")).toThrow();
  sb.write("notes/2026-11-06-QA_รอบ2.md", "---\nkind: fact\n---\n# written meanwhile\n");
  expect(JSON.parse(adopt(false).stdout.toString())).toEqual(["2026-11-05-shop-qa"]);
  expect(readFileSync(join(sb.repo, "notes/2026-11-05-shop-qa.md"), "utf8")).toBe(
    [
      "---",
      "kind: fact",
      "status: done",
      "project: shop",
      "---",
      "# ไฟล์แนบจากงาน shop: qa-fixes, retest",
      "",
      "2 ไฟล์ใน notes/2026-11-05-shop-qa/ ที่งานเหล่านี้ใช้ โน้ตนี้เขียนตอนปิดงาน เพราะโฟลเดอร์ยังไม่มีโน้ตชื่อเดียวกัน",
      "",
      "งานที่อ้างถึง:",
      "- 1105-0900-shop-qa-fixes · ui · ปิดแล้ว",
      "- 1105-1000-shop-retest · ui · ยังเปิด",
      "",
      "โน้ตที่อ้างถึง:",
      "- notes/2026-11-05-shop-bugs.md",
      "",
    ].join("\n"),
  );
  expect(JSON.parse(adopt(false).stdout.toString())).toEqual([]);
  expect(sb.twin(["sync", "notes"]).out).toContain("notes: ok");
  const titles: string[] = JSON.parse(readFileSync(join(sb.repo, "state/brief/notes.json"), "utf8")).items.map((i: { title: string }) => i.title);
  expect(titles.some((t) => t.includes("notes/2026-11-05-shop-qa/"))).toBe(false);
  expect(titles.some((t) => t.includes("notes/2026-11-05-wip/"))).toBe(true);
});
