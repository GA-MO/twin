import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandbox } from "./harness.ts";

test("a sandbox built from a checkout whose profile is a symlink to a real profile never writes through to it", () => {
  const outside = mkdtempSync(join(tmpdir(), "twin-real-profile-"));
  const checkout = mkdtempSync(join(tmpdir(), "twin-linked-checkout-"));
  writeFileSync(join(outside, "rules.json"), "real");
  Bun.spawnSync(["git", "init", "-q", checkout]);
  writeFileSync(join(checkout, ".gitignore"), "profile/\n");
  writeFileSync(join(checkout, "twin.ts"), "");
  symlinkSync(outside, join(checkout, "profile"));
  const sb = sandbox("twin-harness-", checkout);
  try {
    expect(existsSync(join(sb.repo, "twin.ts"))).toBe(true);
    expect(existsSync(join(sb.repo, "profile"))).toBe(false);
    sb.write("profile/rules.json", "test");
    expect(readFileSync(join(outside, "rules.json"), "utf8")).toBe("real");
  } finally {
    sb.remove();
    rmSync(outside, { recursive: true, force: true });
    rmSync(checkout, { recursive: true, force: true });
  }
});
