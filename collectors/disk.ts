import { $ } from "bun";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineCollector } from "../lib/collector.ts";
import { HOME } from "../lib/profile.ts";

const WARN_FREE_GB = 30;
const REGENERABLE = ["node_modules", ".next", "dist", ".turbo", "build", ".dart_tool", ".venv", "target", "Pods", ".gradle"];
const KNOWN: { label: string; path: string }[] = [
  { label: "Docker", path: join(HOME, "Library/Containers/com.docker.docker") },
  { label: "Claude transcripts", path: join(HOME, ".claude/projects") },
  { label: "huggingface", path: join(HOME, ".cache/huggingface") },
  { label: "npm cache", path: join(HOME, ".npm") },
  { label: "bun cache", path: join(HOME, ".bun/install/cache") },
  { label: "Downloads", path: join(HOME, "Downloads") },
];

async function sizeGB(paths: string[]): Promise<number> {
  const existing = paths.filter(existsSync);
  if (!existing.length) return 0;
  const out = await $`du -sk ${existing}`.quiet().nothrow();
  return out.text().split("\n").filter(Boolean).reduce((s, l) => s + Number(l.split("\t")[0]), 0) / 1_048_576;
}

const gb = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}G`;

export default defineCollector({
  title: "Disk",
  order: 70,
  everyMinutes: 60,
  timeoutSeconds: 240,
  inBrief: false,
  keep: "snapshot",
  defaultOn: true,
  requires: ["posix"],
  async run({ profile }) {
    const df = (await $`df -kP ${HOME}`.quiet().text()).split("\n")[1]!.split(/\s+/);
    const freeGB = Number(df[3]) / 1_048_576;
    const usedPct = df[4]!;
    const devRoot = profile.devRoot;
    const caches = devRoot ? readdirSync(devRoot).flatMap((d) => REGENERABLE.map((c) => join(devRoot, d, c))) : [];
    const consumers = [
      ...(await Promise.all(KNOWN.map(async (k) => ({ label: k.label, gb: await sizeGB([k.path]) })))),
      { label: `node_modules/build ใน ${devRoot ?? "devRoot"}`, gb: await sizeGB(caches) },
    ].sort((a, b) => b.gb - a.gb);
    const top = consumers.filter((c) => c.gb >= 0.5).map((c) => `${c.label} ${gb(c.gb)}`);
    const md = [`# Disk`, ``, `ว่าง ${gb(freeGB)} (ใช้ ${usedPct})`, ``, ...consumers.map((c) => `- ${c.label}: ${gb(c.gb)}`)].join("\n");
    return {
      kind: "ok",
      files: { "index.md": `${md}\n` },
      brief: `- ว่าง ${gb(freeGB)} (ใช้ ${usedPct}) · ใหญ่สุด: ${top.slice(0, 4).join(" · ")}`,
      items:
        freeGB < WARN_FREE_GB
          ? [{ key: "disk:low", title: [`disk ว่างเหลือ ${gb(freeGB)}`, ...top.slice(0, 3)].join(" · "), score: 60 }]
          : [],
    };
  },
});
