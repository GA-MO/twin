import { $ } from "bun";
import { join } from "node:path";
import { ROOT, readProfile } from "./profile.ts";
import { tr } from "./lang.ts";

const MAX_LISTED = 15;
const retry = () => tr("แก้แล้วรัน bun twin.ts update ซ้ำ", "fix it, then run bun twin.ts update again");

const git = (...args: string[]) => $`git -C ${ROOT} ${args}`.quiet().nothrow();

async function out(...args: string[]): Promise<string> {
  const r = await git(...args);
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} ${tr("ไม่ผ่าน", "failed")}: ${r.stderr.toString().trim() || r.text().trim()}`);
  return r.text().trim();
}

async function pull(upstream: string): Promise<void> {
  const merged = await git("merge", "--ff-only", "--quiet", upstream);
  if (merged.exitCode === 0) return;
  const ahead = Number((await git("rev-list", "--count", `${upstream}..HEAD`)).text().trim());
  if (ahead > 0) throw new Error(tr(`branch นี้มี ${ahead} commit ที่ ${upstream} ไม่มี จึงรวมแบบ fast-forward ไม่ได้ · ย้ายงานของคุณไปไว้ใน profile/ แล้ว git reset --hard ${upstream} หรือ git rebase ${upstream} เอง`, `this branch has ${ahead} commits that ${upstream} does not, so it cannot fast-forward · move your work into profile/, then git reset --hard ${upstream} or git rebase ${upstream} yourself`));
  throw new Error(`${tr(`รวม ${upstream} ไม่ได้`, `could not merge ${upstream}`)}: ${merged.stderr.toString().trim()} · ${retry()}`);
}

async function whatsNew(before: string, after: string, upstream: string): Promise<string[]> {
  const subjects = (await out("log", "--no-merges", "--format=%s", `${before}..${after}`)).split("\n").filter(Boolean);
  const log = [tr(`อัปเดตจาก ${upstream}: ${before.slice(0, 7)} → ${after.slice(0, 7)} · ${subjects.length} เรื่อง`, `updated from ${upstream}: ${before.slice(0, 7)} → ${after.slice(0, 7)} · ${subjects.length} changes`)];
  log.push(...subjects.slice(0, MAX_LISTED).map((s) => `  ${s}`));
  if (subjects.length > MAX_LISTED) log.push(`  …${tr(`อีก ${subjects.length - MAX_LISTED} เรื่อง`, `${subjects.length - MAX_LISTED} more`)}: git log ${before.slice(0, 7)}..${after.slice(0, 7)}`);
  return log;
}

const upstreamName = async () => (await git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")).text().trim();

async function upstreamOf(): Promise<string> {
  const upstream = await upstreamName();
  if (upstream) return upstream;
  const branch = await out("branch", "--show-current");
  throw new Error(branch ? tr(`branch ${branch} ไม่มี upstream · ตั้งด้วย git branch --set-upstream-to origin/main`, `branch ${branch} has no upstream · set one with git branch --set-upstream-to origin/main`) : tr("HEAD ไม่ได้อยู่บน branch · git switch main ก่อน แล้วรัน update ใหม่", "HEAD is not on a branch · git switch main, then run update again"));
}

export type Available = { upstream: string; subjects: string[] };

export async function available(): Promise<Available | null> {
  const upstream = await upstreamName();
  if (!upstream) return null;
  await out("fetch", "--quiet");
  const subjects = (await out("log", "--no-merges", "--format=%s", `HEAD..${upstream}`)).split("\n").filter(Boolean);
  return { upstream, subjects };
}

export async function update(): Promise<string[]> {
  const profile = readProfile();
  if (!profile) throw new Error(tr("ยังไม่ได้ setup: รัน bun twin.ts setup ก่อน", "not set up yet: run bun twin.ts setup first"));
  const dirty = (await out("diff", "--name-only", "HEAD")).split("\n").filter(Boolean);
  if (dirty.length) throw new Error(tr(`ไฟล์ engine ถูกแก้อยู่ ${dirty.length} ไฟล์: ${dirty.join(", ")} · commit หรือ stash ก่อน แล้วรัน update ใหม่`, `${dirty.length} engine files have local edits: ${dirty.join(", ")} · commit or stash them, then run update again`));
  const upstream = await upstreamOf();
  const before = await out("rev-parse", "HEAD");
  await out("fetch", "--quiet");
  await pull(upstream);
  const after = await out("rev-parse", "HEAD");
  const log = after === before ? [tr(`เป็นรุ่นล่าสุดของ ${upstream} แล้ว`, `already the latest ${upstream}`)] : await whatsNew(before, after, upstream);

  const install = await $`${process.execPath} install --frozen-lockfile`.cwd(ROOT).quiet().nothrow();
  if (install.exitCode !== 0) {
    const why = install.stderr.toString().trim() || install.text().trim();
    if (after === before) throw new Error(`bun install ${tr("ไม่ผ่าน", "failed")}: ${why} · ${retry()}`);
    await out("reset", "--quiet", "--hard", before);
    throw new Error(`${tr(`bun install ของรุ่นใหม่ไม่ผ่าน จึงถอยกลับไปรุ่นเดิม ${before.slice(0, 7)} ไม่มีอะไรเปลี่ยน`, `bun install of the new version failed, so it went back to ${before.slice(0, 7)} and nothing changed`)}: ${why} · ${retry()}`);
  }

  const setup = await $`${process.execPath} ${join(ROOT, "twin.ts")} setup --no-sync`.cwd(ROOT).quiet().nothrow();
  if (setup.exitCode !== 0) throw new Error(`${tr("โค้ดใหม่ลงแล้ว แต่ setup ซ้ำไม่ผ่าน", "the new code is in, but setup failed")}: ${setup.stderr.toString().trim() || setup.text().trim()} · ${retry()}`);
  log.push(tr("ตั้งค่าซ้ำแล้ว:", "set up again:"), ...setup.text().split("\n").filter((l) => l.trim()).map((l) => `  ${l.replace(/^- /, "")}`));
  return log;
}
