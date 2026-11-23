import { afterAll, expect, test } from "bun:test";
import { readFileSync, statSync, utimesSync } from "node:fs";
import { sandbox } from "./harness.ts";

const sb = sandbox("twin-logs-");
afterAll(() => sb.remove());

test("logs under state keep their last 5000 lines and their modified time, so the hourly backup timer is not reset; the clean log starts at a whole entry and daily.log, written by the running job, is left alone", () => {
  const lines = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag} ${i}`).join("\n") + "\n";
  const sync = sb.write("state/sync.log", lines(6000, "sync"));
  const backup = sb.write("state/backup.log", lines(10, "backup"));
  const daily = sb.write("state/daily.log", lines(6000, "daily"));
  const cleanLog = sb.write("state/clean/log.md", Array.from({ length: 2600 }, (_, i) => `## ${i} · ลบแล้ว\n- item ${i}\n`).join("\n"));
  const hourAgo = new Date(Date.now() - 3_600_000);
  utimesSync(sync, hourAgo, hourAgo);
  const r = Bun.spawnSync([process.execPath, "-e", 'import { trimLogs } from "./lib/clean.ts"; trimLogs();'], { cwd: sb.repo });
  expect(r.stderr.toString()).toBe("");
  const kept = readFileSync(sync, "utf8").split("\n");
  expect(kept).toHaveLength(5001);
  expect(kept[0]).toBe("sync 1000");
  expect(kept.at(-2)).toBe("sync 5999");
  expect(kept.at(-1)).toBe("");
  expect(Math.round(statSync(sync).mtimeMs / 1000)).toBe(Math.round(hourAgo.getTime() / 1000));
  expect(readFileSync(backup, "utf8")).toBe(lines(10, "backup"));
  expect(readFileSync(daily, "utf8")).toBe(lines(6000, "daily"));
  const entries = readFileSync(cleanLog, "utf8").split("\n");
  expect(entries[0]).toMatch(/^## \d+ · ลบแล้ว$/);
  expect(entries.length).toBeLessThanOrEqual(5001);
  expect(entries.at(-3)).toBe("## 2599 · ลบแล้ว");
});
