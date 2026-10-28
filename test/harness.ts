import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SOURCE = dirname(import.meta.dir);

export const GIT_ID = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };

export type Sandbox = {
  work: string;
  repo: string;
  home: string;
  bin: string;
  twin(args: string[], stdin?: string, extra?: Record<string, string>): { code: number; out: string; err: string };
  git(dir: string, ...args: string[]): string;
  write(rel: string, content: string): string;
  remove(): void;
};

export function sandbox(prefix: string): Sandbox {
  const work = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(work, "repo");
  const home = join(work, "home");
  const bin = join(work, "bin");
  const files = Bun.spawnSync(["git", "-C", SOURCE, "ls-files", "--cached", "--others", "--exclude-standard"]).stdout.toString().split("\n").filter((f) => f && f !== "node_modules");
  for (const f of files) if (existsSync(join(SOURCE, f))) cpSync(join(SOURCE, f), join(repo, f), { recursive: true });
  symlinkSync(join(SOURCE, "node_modules"), join(repo, "node_modules"));
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "osascript"), "#!/bin/sh\n", { mode: 0o755 });
  const env = (extra: Record<string, string>) => ({ ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, "AppData/Local"), PATH: `${bin}:/usr/bin:/bin`, CLAUDE_CODE_SESSION_ID: "", ...extra });
  return {
    work,
    repo,
    home,
    bin,
    twin(args, stdin = "", extra = {}) {
      const r = Bun.spawnSync([process.execPath, join(repo, "twin.ts"), ...args], { cwd: repo, env: env(extra), stdin: new Blob([stdin]) });
      return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
    },
    git(dir, ...args) {
      return Bun.spawnSync(["git", "-C", dir, ...args], { env: { ...process.env, ...GIT_ID, HOME: home } }).stdout.toString().trim();
    },
    write(rel, content) {
      const p = join(repo, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
      return p;
    },
    remove: () => rmSync(work, { recursive: true, force: true }),
  };
}
