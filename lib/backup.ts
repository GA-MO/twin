import { $ } from "bun";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profile.ts";

export const BACKUP_REF = "refs/twin/backup";
export const BACKUP_REMOTE = "backup";
const REMOTE_BRANCH = "refs/heads/twin-backup";
const PATHS = ["journal", "notes", "profile"];
const NO_PARENT = "0".repeat(40);

const firstLine = (out: Buffer) => out.toString().trim().split("\n")[0];

async function identity(): Promise<Record<string, string>> {
  const set = (await $`git -C ${ROOT} var GIT_COMMITTER_IDENT`.quiet().nothrow()).exitCode === 0;
  return set ? {} : { GIT_AUTHOR_NAME: "twin", GIT_AUTHOR_EMAIL: "twin@localhost", GIT_COMMITTER_NAME: "twin", GIT_COMMITTER_EMAIL: "twin@localhost" };
}

export async function backupRemote(): Promise<string | null> {
  const remote = await $`git -C ${ROOT} remote get-url ${BACKUP_REMOTE}`.quiet().nothrow();
  return remote.exitCode === 0 ? remote.text().trim() : null;
}

export type Snapshot = { line: string; offsite: "pushed" | "failed" | "none" };

const failed = (line: string): Snapshot => ({ line, offsite: "failed" });

export async function snapshot(): Promise<Snapshot> {
  const paths = PATHS.filter((p) => existsSync(join(ROOT, p)));
  if (!paths.length) return { line: "ยังไม่มีอะไรให้ backup", offsite: "none" };
  mkdirSync(join(ROOT, "state"), { recursive: true });
  const index = join(ROOT, "state", `backup-${process.pid}.index`);
  const env = { ...process.env, ...(await identity()), GIT_INDEX_FILE: index };
  try {
    const add = await $`git -C ${ROOT} add -f -- ${paths} ${[":(exclude)profile/imports", ":(exclude,glob)profile/**/conversations.json", ":(exclude,glob)profile/**/*.zip"]}`.env(env).quiet().nothrow();
    if (add.exitCode !== 0) return failed(`add ล้ม: ${firstLine(add.stderr)}`);
    const tree = await $`git -C ${ROOT} write-tree`.env(env).quiet().nothrow();
    if (tree.exitCode !== 0) return failed(`write-tree ล้ม: ${firstLine(tree.stderr)}`);
    const parent = (await $`git -C ${ROOT} rev-parse -q --verify ${BACKUP_REF}`.quiet().nothrow()).text().trim();
    const parentTree = parent ? (await $`git -C ${ROOT} rev-parse ${`${parent}^{tree}`}`.quiet().nothrow()).text().trim() : "";
    const changed = tree.text().trim() !== parentTree;
    if (changed) {
      const message = `daily ${new Date().toLocaleDateString("sv-SE")}`;
      const commit = await $`git -C ${ROOT} commit-tree ${tree.text().trim()} ${parent ? ["-p", parent] : []} -m ${message}`.env(env).quiet().nothrow();
      if (commit.exitCode !== 0) return failed(`commit ล้ม: ${firstLine(commit.stderr)}`);
      const update = await $`git -C ${ROOT} update-ref ${BACKUP_REF} ${commit.text().trim()} ${parent || NO_PARENT}`.quiet().nothrow();
      if (update.exitCode !== 0) return failed(`update-ref ล้ม (backup อื่นกำลังรันอยู่?): ${firstLine(update.stderr)}`);
    }
    const status = changed ? "บันทึก snapshot ใหม่" : "ไม่มีอะไรเปลี่ยน";
    if (!(await backupRemote())) return { line: `${status} · ไม่มี remote "${BACKUP_REMOTE}" (git remote add ${BACKUP_REMOTE} <private repo>) จึงเก็บไว้ในเครื่อง`, offsite: "none" };
    const push = await $`git -C ${ROOT} push -q ${BACKUP_REMOTE} ${`${BACKUP_REF}:${REMOTE_BRANCH}`}`.quiet().nothrow();
    return push.exitCode === 0 ? { line: `${status} · push ${BACKUP_REMOTE} twin-backup ok`, offsite: "pushed" } : failed(`${status} · push ${BACKUP_REMOTE} twin-backup ล้ม: ${firstLine(push.stderr)}`);
  } finally {
    rmSync(index, { force: true });
    rmSync(`${index}.lock`, { force: true });
  }
}
