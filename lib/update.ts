import { $ } from "bun";
import { join } from "node:path";
import { ROOT, readProfile } from "./profile.ts";

const MAX_LISTED = 15;
const RETRY = "แก้แล้วรัน bun twin.ts update ซ้ำ";

const git = (...args: string[]) => $`git -C ${ROOT} ${args}`.quiet().nothrow();

async function out(...args: string[]): Promise<string> {
  const r = await git(...args);
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} ไม่ผ่าน: ${r.stderr.toString().trim() || r.text().trim()}`);
  return r.text().trim();
}

async function pull(upstream: string): Promise<void> {
  const merged = await git("merge", "--ff-only", "--quiet", upstream);
  if (merged.exitCode === 0) return;
  const ahead = Number((await git("rev-list", "--count", `${upstream}..HEAD`)).text().trim());
  if (ahead > 0) throw new Error(`branch นี้มี ${ahead} commit ที่ ${upstream} ไม่มี จึงรวมแบบ fast-forward ไม่ได้ · ย้ายงานของคุณไปไว้ใน profile/ แล้ว git reset --hard ${upstream} หรือ git rebase ${upstream} เอง`);
  throw new Error(`รวม ${upstream} ไม่ได้: ${merged.stderr.toString().trim()} · ${RETRY}`);
}

async function whatsNew(before: string, after: string, upstream: string): Promise<string[]> {
  const subjects = (await out("log", "--no-merges", "--format=%s", `${before}..${after}`)).split("\n").filter(Boolean);
  const log = [`อัปเดตจาก ${upstream}: ${before.slice(0, 7)} → ${after.slice(0, 7)} · ${subjects.length} เรื่อง`];
  log.push(...subjects.slice(0, MAX_LISTED).map((s) => `  ${s}`));
  if (subjects.length > MAX_LISTED) log.push(`  …อีก ${subjects.length - MAX_LISTED} เรื่อง: git log ${before.slice(0, 7)}..${after.slice(0, 7)}`);
  return log;
}

const upstreamName = async () => (await git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")).text().trim();

async function upstreamOf(): Promise<string> {
  const upstream = await upstreamName();
  if (upstream) return upstream;
  const branch = await out("branch", "--show-current");
  throw new Error(branch ? `branch ${branch} ไม่มี upstream · ตั้งด้วย git branch --set-upstream-to origin/main` : "HEAD ไม่ได้อยู่บน branch · git switch main ก่อน แล้วรัน update ใหม่");
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
  if (!profile) throw new Error("ยังไม่ได้ setup: รัน bun twin.ts setup ก่อน");
  const dirty = (await out("diff", "--name-only", "HEAD")).split("\n").filter(Boolean);
  if (dirty.length) throw new Error(`ไฟล์ engine ถูกแก้อยู่ ${dirty.length} ไฟล์: ${dirty.join(", ")} · commit หรือ stash ก่อน แล้วรัน update ใหม่`);
  const upstream = await upstreamOf();
  const before = await out("rev-parse", "HEAD");
  await out("fetch", "--quiet");
  await pull(upstream);
  const after = await out("rev-parse", "HEAD");
  const log = after === before ? [`เป็นรุ่นล่าสุดของ ${upstream} แล้ว`] : await whatsNew(before, after, upstream);

  const install = await $`${process.execPath} install --frozen-lockfile`.cwd(ROOT).quiet().nothrow();
  if (install.exitCode !== 0) {
    const why = install.stderr.toString().trim() || install.text().trim();
    if (after === before) throw new Error(`bun install ไม่ผ่าน: ${why} · ${RETRY}`);
    await out("reset", "--quiet", "--hard", before);
    throw new Error(`bun install ของรุ่นใหม่ไม่ผ่าน จึงถอยกลับไปรุ่นเดิม ${before.slice(0, 7)} ไม่มีอะไรเปลี่ยน: ${why} · ${RETRY}`);
  }

  const setup = await $`${process.execPath} ${join(ROOT, "twin.ts")} setup --no-sync`.cwd(ROOT).quiet().nothrow();
  if (setup.exitCode !== 0) throw new Error(`โค้ดใหม่ลงแล้ว แต่ setup ซ้ำไม่ผ่าน: ${setup.stderr.toString().trim() || setup.text().trim()} · ${RETRY}`);
  log.push("ตั้งค่าซ้ำแล้ว:", ...setup.text().split("\n").filter((l) => l.trim()).map((l) => `  ${l.replace(/^- /, "")}`));
  return log;
}
