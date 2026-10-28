import { z } from "zod";
import { importOwner, shown } from "./extensions.ts";
import { readProfile, type Profile } from "./profile.ts";
import { getSecret } from "./secrets.ts";

export type CommandContext = { profile: Profile | null; secret(name: string): Promise<string | null> };

export type OwnerCommand = {
  usage?: string;
  help: string;
  run(args: string[], ctx: CommandContext): Promise<void> | void;
};

export const defineCommand = (c: OwnerCommand) => c;

const Shape = z.object({
  usage: z.string().optional(),
  help: z.string(),
  run: z.custom<OwnerCommand["run"]>((v) => typeof v === "function", "run ต้องเป็น function"),
});

export type LoadedCommand = { name: string; file: string } & ({ ok: true; command: OwnerCommand } | { ok: false; why: string });

export async function loadOwnerCommand(name: string, file: string): Promise<LoadedCommand> {
  const loaded = await importOwner(file);
  if (!loaded.ok) return { name, file, ok: false, why: loaded.why };
  const parsed = Shape.safeParse(loaded.value);
  if (!parsed.success) return { name, file, ok: false, why: `${shown(file)} ต้อง export default defineCommand({ help, run }): ${parsed.error.issues.map((i) => `${i.path.join(".") || "default"} ${i.message}`).join("; ")}` };
  return { name, file, ok: true, command: parsed.data as OwnerCommand };
}

export async function runOwnerCommand(c: OwnerCommand, args: string[]): Promise<void> {
  await c.run(args, { profile: readProfile(), secret: getSecret });
}
