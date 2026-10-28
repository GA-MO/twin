import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profile.ts";

export function templates(devRoot: string): string[] {
  return readdirSync(devRoot).filter((d) => d.includes("template") && existsSync(join(devRoot, d, ".git")));
}

function planFrom(name: string, template: string, ideaFile: string | null): string {
  const idea = ideaFile ? readFileSync(join(ROOT, ideaFile), "utf8").replace(/^---[\s\S]*?---\n/, "").trim() : "";
  return [
    `# ${name}`,
    "",
    `เริ่มจาก ${template}${ideaFile ? ` · ไอเดีย: ${ideaFile}` : ""}`,
    "",
    idea || "## เป้าหมาย\n\n(ยังไม่ได้เขียน)",
    "",
    "## สถานะ (updated " + new Date().toLocaleDateString("sv-SE") + ")",
    "ทำแล้ว: สร้าง project จาก template",
    "ค้าง: -",
    "ค้นพบ: -",
    `ถัดไป: phase 1 ตาม docs/plans/${name}.md`,
    "",
  ].join("\n");
}

export async function scaffold(devRoot: string, template: string, name: string, opts: { idea: string | null; github: boolean }): Promise<string> {
  const DEV_ROOT = devRoot;
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(name)) throw new Error(`ชื่อ project ต้องเป็น a-z0-9- : ${name}`);
  const target = join(DEV_ROOT, name);
  const log: string[] = [];
  if (!existsSync(target)) {
    if (!templates(devRoot).includes(template)) throw new Error(`ไม่พบ template "${template}" (มี: ${templates(devRoot).join(", ")})`);
    if (opts.idea && !existsSync(join(ROOT, opts.idea))) throw new Error(`ไม่พบไฟล์ไอเดีย ${opts.idea}`);
    const tmp = join(DEV_ROOT, `.${name}.tmp-${process.pid}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp);
    await $`git -C ${join(DEV_ROOT, template)} archive HEAD | tar -x -C ${tmp}`.quiet();
    const pkg = join(tmp, "package.json");
    if (existsSync(pkg)) writeFileSync(pkg, readFileSync(pkg, "utf8").replace(/"name":\s*"[^"]*"/, `"name": "${name}"`));
    mkdirSync(join(tmp, "docs/plans"), { recursive: true });
    writeFileSync(join(tmp, `docs/plans/${name}.md`), planFrom(name, template, opts.idea));
    renameSync(tmp, target);
    await $`git -C ${target} init -q -b main`.quiet();
    await $`git -C ${target} add -A`.quiet();
    await $`git -C ${target} commit -q -m ${`Start ${name} from ${template}`}`.quiet();
    await $`git -C ${target} branch develop`.quiet();
    log.push(`สร้าง ${target} จาก ${template} · branch main + develop · plan docs/plans/${name}.md`);
  } else if (!existsSync(join(target, ".git"))) {
    throw new Error(`${target} มีอยู่แล้วและไม่ใช่ git repo`);
  } else {
    log.push(`${target} มีอยู่แล้ว ข้ามการสร้าง`);
  }
  if (opts.github) {
    const hasRemote = (await $`git -C ${target} remote get-url origin`.quiet().nothrow()).exitCode === 0;
    if (!hasRemote) await $`gh repo create ${name} --private --source ${target} --remote origin`.quiet();
    await $`git -C ${target} push -q -u origin main develop`.quiet();
    log.push(`GitHub private: ${(await $`git -C ${target} remote get-url origin`.quiet().text()).trim()}`);
  }
  return log.join("\n");
}
