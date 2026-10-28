import { expect, test, beforeEach } from "bun:test";
import { cached, clearCache } from "../src/cache";
beforeEach(clearCache);
test("concurrent callers share one load", async () => {
  let calls = 0;
  const load = async () => { calls++; await Bun.sleep(20); return calls; };
  const [a, b, c] = await Promise.all([cached("k", 1000, load), cached("k", 1000, load), cached("k", 1000, load)]);
  expect(calls).toBe(1); expect([a, b, c]).toEqual([1, 1, 1]);
});
test("a failed load is not cached and every waiter sees the error", async () => {
  let calls = 0;
  const bad = async () => { calls++; await Bun.sleep(5); throw new Error("boom"); };
  const r = await Promise.allSettled([cached("e", 1000, bad), cached("e", 1000, bad)]);
  expect(r.every((x) => x.status === "rejected")).toBe(true); expect(calls).toBe(1);
  expect(await cached("e", 1000, async () => 7)).toBe(7);
});
test("expired entry reloads", async () => {
  let t = 0; const now = () => t;
  expect(await cached("x", 100, async () => 1, now)).toBe(1);
  t = 150; expect(await cached("x", 100, async () => 2, now)).toBe(2);
});
test("keys are independent", async () => {
  expect(await cached("p", 1000, async () => "p")).toBe("p");
  expect(await cached("q", 1000, async () => "q")).toBe("q");
});
test("keep: fresh hit does not reload", async () => {
  let calls = 0; const load = async () => ++calls;
  await cached("h", 1000, load); await cached("h", 1000, load); expect(calls).toBe(1);
});
