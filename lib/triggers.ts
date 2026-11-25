import { z } from "zod";
import { ROOT } from "./profile.ts";

const TIMEOUT_MS = 120_000;

export type Fired = { skill: string | null } | { error: string };

const StreamLine = z.looseObject({
  type: z.string(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  message: z.looseObject({ content: z.array(z.looseObject({ type: z.string(), name: z.string().optional(), input: z.unknown().optional() })).optional() }).optional(),
});
const SkillInput = z.looseObject({ skill: z.string() });

export function firstSkill(line: string): Fired | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const e = StreamLine.safeParse(json);
  if (!e.success) return null;
  if (e.data.type === "result") {
    const failed = e.data.is_error === true || (e.data.subtype !== undefined && e.data.subtype !== "success");
    return failed ? { error: `claude -p จบด้วย error: ${typeof e.data.result === "string" ? e.data.result.slice(0, 200) : (e.data.subtype ?? "unknown")}` } : { skill: null };
  }
  if (e.data.type !== "assistant") return null;
  for (const c of e.data.message?.content ?? []) {
    if (c.type !== "tool_use" || c.name !== "Skill") continue;
    const input = SkillInput.safeParse(c.input);
    return input.success ? { skill: input.data.skill } : { error: "Skill tool_use with no skill name" };
  }
  return null;
}

export async function fire(prompt: string, model: string): Promise<Fired> {
  const child = Bun.spawn(
    ["claude", "-p", "--model", model, "--tools", "Skill", "--strict-mcp-config", "--permission-mode", "dontAsk", "--no-session-persistence", "--output-format", "stream-json", "--verbose", "--max-turns", "2"],
    { cwd: ROOT, stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe", env: { ...process.env, TWIN_EVAL: "1" } },
  );
  const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
  let found: Fired | null = null;
  let rest = "";
  const decoder = new TextDecoder();
  for await (const chunk of child.stdout) {
    rest += decoder.decode(chunk, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) found ??= firstSkill(line);
    if (found) {
      child.kill();
      break;
    }
  }
  found ??= firstSkill(rest);
  await child.exited;
  clearTimeout(timer);
  if (found) return found;
  const err = (await new Response(child.stderr).text()).trim().split("\n")[0];
  return { error: child.signalCode === "SIGKILL" ? `timeout ${TIMEOUT_MS / 1000}s` : err || `exit ${child.exitCode} with no result` };
}

export async function pool<T>(jobs: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]!();
      }
    }),
  );
  return out;
}
