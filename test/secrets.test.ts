import { expect, test } from "bun:test";
import { parseBrief } from "../lib/briefs.ts";
import { findSecret, servicesFor, storesFor, workerEnv, type Store } from "../lib/secrets.ts";

const BRIEF = `ชนิด: bug
ขนาด: เล็ก
เป้าหมาย: เรียก API ได้
อ้างอิง: src/api.ts
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: เรียก API แล้วได้ 200
ลงที่: push branch นี้เท่านั้น
secret: maps-api-key, trello-token
อาการ: 401
คงไว้: หน้าเดิม`;

const fakeStore = (items: Record<string, string>, seen: string[] = []): Store => ({
  async get(service, name) {
    seen.push(`${service}/${name}`);
    return items[`${service}/${name}`] ?? null;
  },
  async set() {},
});

test("secrets are looked up under the agent's own service first, then the twin service earlier versions used", async () => {
  expect(servicesFor("gamo")).toEqual(["gamo", "twin"]);
  expect(servicesFor("twin")).toEqual(["twin"]);
  expect(servicesFor(null)).toEqual(["twin"]);
  const seen: string[] = [];
  const store = fakeStore({ "gamo/maps-api-key": "from-gamo", "twin/maps-api-key": "from-twin", "twin/old": "kept" }, seen);
  expect(await findSecret("maps-api-key", servicesFor("gamo"), () => [store])).toBe("from-gamo");
  expect(seen).toEqual(["gamo/maps-api-key"]);
  expect(await findSecret("old", servicesFor("gamo"), () => [store])).toBe("kept");
  expect(await findSecret("none", servicesFor("gamo"), () => [store])).toBeNull();
});

test("every supported OS has a store: Keychain through security first on macOS, Bun.secrets on Linux and Windows", () => {
  const [cli, bun] = storesFor("darwin", true, "gamo");
  expect(storesFor("darwin", true, "gamo")).toHaveLength(2);
  expect(storesFor("darwin", true, "twin")).toEqual([bun!, cli!]);
  expect(storesFor("darwin", false, "gamo")).toEqual([cli!]);
  expect(storesFor("linux", true, "gamo")).toEqual([bun!]);
  expect(storesFor("win32", true, "gamo")).toEqual([bun!]);
  expect(storesFor("linux", false, "gamo")).toEqual([]);
});

test("a brief's secret line becomes the worker's environment, and a missing secret stops the turn with how to set it", async () => {
  const brief = parseBrief(BRIEF, "gamo", { kind: "lean" });
  expect(brief.secrets).toEqual(["maps-api-key", "trello-token"]);
  expect(brief.prompt).toContain("MAPS_API_KEY, TRELLO_TOKEN");
  const store = fakeStore({ "gamo/maps-api-key": "k1", "twin/trello-token": "k2" });
  const get = (name: string) => findSecret(name, servicesFor("gamo"), () => [store]);
  expect(await workerEnv(brief.secrets, get)).toEqual({ MAPS_API_KEY: "k1", TRELLO_TOKEN: "k2" });
  await expect(workerEnv(["gone"], get)).rejects.toThrow("bun twin.ts secret gone");
});
