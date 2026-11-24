import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sandbox } from "./harness.ts";

const sb = sandbox("twin-projects-");
afterAll(() => sb.remove());

test("a project's open notes are in its state file, which dispatch reads before every brief, even when the repo has been quiet", () => {
  const dev = join(sb.work, "dev");
  for (const [name, date] of [["shop", new Date().toISOString()], ["old", "2026-01-01T00:00:00Z"]] as const) {
    mkdirSync(join(dev, name), { recursive: true });
    sb.git(join(dev, name), "init", "-q");
    Bun.spawnSync(["git", "-C", join(dev, name), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "start"], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  }
  sb.write("profile/twin.json", JSON.stringify({ name: "nok", os: process.platform, devRoot: dev, capabilities: { pstack: false, browser: "none", claude: false }, collectors: {}, radar: null, onboarded: null }));
  sb.write("notes/2026-11-02-feedback-delete-red.md", "---\nkind: feedback\nproject: shop\n---\n# อย่าเปลี่ยนสีปุ่ม Delete\n");
  sb.write("notes/2026-11-03-shop-done.md", "---\nkind: todo\nstatus: done\nproject: shop\n---\n# งานที่ปิดแล้ว\n");
  sb.write("notes/2026-11-04-shop-idea.md", "---\nkind: idea\nproject: shop\n---\n# ไอเดียที่ยังไม่ตัดสิน\n");
  sb.write("notes/2026-11-05-old-decision.md", "---\nkind: decision\nproject: old\n---\n# old ลง main ตรง\n");
  expect(sb.twin(["sync", "projects"]).out).toContain("projects: ok");
  const shop = readFileSync(join(sb.repo, "state/projects/shop.md"), "utf8");
  expect(shop).toContain("- feedback · อย่าเปลี่ยนสีปุ่ม Delete (notes/2026-11-02-feedback-delete-red.md)");
  expect(shop).not.toContain("งานที่ปิดแล้ว");
  expect(shop).not.toContain("ไอเดียที่ยังไม่ตัดสิน");
  expect(readFileSync(join(sb.repo, "state/projects/old.md"), "utf8")).toContain("- decision · old ลง main ตรง");
  sb.write("notes/2026-11-05-old-decision.md", "---\nkind: decision\nstatus: done\nproject: old\n---\n# old ลง main ตรง\n");
  sb.twin(["sync", "projects"]);
  expect(existsSync(join(sb.repo, "state/projects/old.md"))).toBe(false);
}, 60_000);
