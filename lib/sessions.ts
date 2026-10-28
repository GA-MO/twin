import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { HOME } from "./profile.ts";

const AgentList = z.array(z.looseObject({ cwd: z.string(), kind: z.string() }));

export function liveSessionCwds(): string[] | null {
  const claude = Bun.which("claude");
  if (!claude) return null;
  const r = Bun.spawnSync([claude, "agents", "--json"], { timeout: 15_000, stderr: "ignore" });
  if (r.exitCode !== 0) return null;
  try {
    const parsed = AgentList.safeParse(JSON.parse(r.stdout.toString() || "[]"));
    return parsed.success ? parsed.data.map((a) => a.cwd) : null;
  } catch {
    return null;
  }
}

export const hasLiveSession = (repo: string, live: string[] | null) => (live ?? []).some((cwd) => cwd === repo || cwd.startsWith(`${repo}/`));

const Agent = z.looseObject({ pid: z.number(), sessionId: z.string(), name: z.string().optional(), status: z.string().optional() });
const SessionFile = z.looseObject({ entrypoint: z.string().optional() });

export type LiveSession = { sessionId: string; name: string; status: string; where: "desktop" | "terminal" };

export function liveSessions(timeoutMs = 15_000): LiveSession[] | null {
  const claude = Bun.which("claude");
  if (!claude) return null;
  const r = Bun.spawnSync([claude, "agents", "--json"], { timeout: timeoutMs, stderr: "ignore" });
  if (r.exitCode !== 0) return null;
  try {
    const parsed = z.array(Agent).safeParse(JSON.parse(r.stdout.toString() || "[]"));
    if (!parsed.success) return null;
    return parsed.data.map((a) => {
      const file = join(HOME, ".claude/sessions", `${a.pid}.json`);
      const entry = SessionFile.safeParse(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
      return { sessionId: a.sessionId, name: a.name ?? a.sessionId.slice(0, 8), status: a.status ?? "idle", where: entry.success && entry.data.entrypoint === "claude-desktop" ? "desktop" : "terminal" };
    });
  } catch {
    return null;
  }
}

export const ownerIsGone = (owner: string, live: LiveSession[] | null) => live !== null && !live.some((s) => s.sessionId === owner);
