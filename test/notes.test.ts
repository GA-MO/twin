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
