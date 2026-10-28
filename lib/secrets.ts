import { $ } from "bun";
import { readProfile } from "./profile.ts";

export const LEGACY_SERVICE = "twin";

export const SECRET_NAME = /^[a-z0-9][a-z0-9-]*$/;

export const secretEnv = (name: string) => name.toUpperCase().replaceAll("-", "_");

export type Store = {
  get(service: string, name: string): Promise<string | null>;
  set(service: string, name: string, value: string): Promise<void>;
};

const bunStore: Store = {
  async get(service, name) {
    try {
      return (await Bun.secrets.get({ service, name })) || null;
    } catch {
      return null;
    }
  },
  set: (service, name, value) => Bun.secrets.set({ service, name, value }),
};

const keychainCli: Store = {
  async get(service, name) {
    const r = await $`security find-generic-password -s ${service} -a ${name} -w`.quiet().nothrow();
    return r.exitCode === 0 ? r.text().trim() || null : null;
  },
  async set(service, name, value) {
    await $`security add-generic-password -U -s ${service} -a ${name} -w ${value}`.quiet();
  },
};

export function storesFor(platform: NodeJS.Platform, hasBunSecrets: boolean, service: string): Store[] {
  const bun = hasBunSecrets ? [bunStore] : [];
  if (platform !== "darwin") return bun;
  return service === LEGACY_SERVICE ? [...bun, keychainCli] : [keychainCli, ...bun];
}

export const servicesFor = (agent: string | null) => [...new Set([agent ?? LEGACY_SERVICE, LEGACY_SERVICE])];

const hasBunSecrets = typeof Bun.secrets?.get === "function";
const agentName = () => {
  const p = readProfile();
  return p ? (p.secretService ?? p.name) : null;
};
const stores = (service: string) => storesFor(process.platform, hasBunSecrets, service);

export async function findSecret(name: string, services: string[], storesOf: (service: string) => Store[]): Promise<string | null> {
  for (const service of services)
    for (const store of storesOf(service)) {
      const value = await store.get(service, name);
      if (value) return value;
    }
  return null;
}

export const getSecret = (name: string) => findSecret(name, servicesFor(agentName()), stores);

export async function workerEnv(names: string[], get: (name: string) => Promise<string | null> = getSecret): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const name of names) {
    const value = await get(name);
    if (!value) throw new Error(`ไม่มี secret ${name}: ตั้งด้วย bun twin.ts secret ${name}`);
    env[secretEnv(name)] = value;
  }
  return env;
}

export async function setSecret(name: string, value: string): Promise<void> {
  if (!SECRET_NAME.test(name)) throw new Error(`ชื่อ secret ต้องเป็น a-z0-9-: ${name}`);
  const service = servicesFor(agentName())[0]!;
  const store = stores(service)[0];
  if (!store) throw new Error("Bun นี้ไม่มี Bun.secrets: อัปเกรด Bun (bun upgrade) แล้วลองใหม่");
  await store.set(service, name, value);
}
