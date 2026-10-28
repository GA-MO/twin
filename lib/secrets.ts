import { $ } from "bun";

const SERVICE = "twin";
const hasBunSecrets = typeof Bun.secrets?.get === "function";

export const SECRET_NAME = /^[a-z0-9][a-z0-9-]*$/;

export async function getSecret(name: string): Promise<string | null> {
  if (hasBunSecrets) {
    try {
      return (await Bun.secrets.get({ service: SERVICE, name })) || null;
    } catch {
      return null;
    }
  }
  if (process.platform !== "darwin") return null;
  const r = await $`security find-generic-password -s ${SERVICE} -a ${name} -w`.quiet().nothrow();
  return r.exitCode === 0 ? r.text().trim() || null : null;
}

export async function setSecret(name: string, value: string): Promise<void> {
  if (!SECRET_NAME.test(name)) throw new Error(`ชื่อ secret ต้องเป็น a-z0-9-: ${name}`);
  if (hasBunSecrets) return Bun.secrets.set({ service: SERVICE, name, value });
  if (process.platform !== "darwin") throw new Error("Bun นี้ไม่มี Bun.secrets: อัปเกรด Bun (bun upgrade) แล้วลองใหม่");
  await $`security add-generic-password -U -s ${SERVICE} -a ${name} -w ${value}`.quiet();
}
