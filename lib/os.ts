import { $ } from "bun";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME, ROOT } from "./profile.ts";

export async function notify(title: string, text: string) {
  const clean = (s: string) => s.replaceAll('"', "'");
  if (process.platform === "darwin") await $`osascript -e ${`display notification "${clean(text)}" with title "${clean(title)}"`}`.quiet().nothrow();
  else if (process.platform === "linux" && Bun.which("notify-send")) await $`notify-send ${title} ${text}`.quiet().nothrow();
}

type Job = { command: "sync" | "daily"; about: string; minutes?: number; at?: { hour: number; minute: number } };

const JOBS: Job[] = [
  { command: "sync", about: "sync ทุก 10 นาที", minutes: 10 },
  { command: "daily", about: "daily 08:30", at: { hour: 8, minute: 30 } },
];

const KEY = `twin-${new Bun.CryptoHasher("sha1").update(ROOT).digest("hex").slice(0, 8)}`;
const label = (j: Job) => `${KEY}.${j.command}`;
const log = (j: Job) => join(ROOT, "state", `${j.command}.log`);
const searchPath = () => [...new Set([dirname(process.execPath), dirname(Bun.which("claude") ?? "/usr/local/bin/claude"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(":");
const xml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const sq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

function plist(j: Job): string {
  const schedule = j.minutes
    ? `<key>StartInterval</key><integer>${j.minutes * 60}</integer><key>RunAtLoad</key><true/>`
    : `<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${j.at!.hour}</integer><key>Minute</key><integer>${j.at!.minute}</integer></dict>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label(j)}</string>
  <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(ROOT, "twin.ts"))}</string><string>${j.command}</string></array>
  <key>WorkingDirectory</key><string>${xml(ROOT)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(searchPath())}</string><key>HOME</key><string>${xml(HOME)}</string></dict>
  ${schedule}
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>${xml(log(j))}</string>
  <key>StandardErrorPath</key><string>${xml(log(j))}</string>
</dict></plist>
`;
}

const cronLine = (j: Job) => {
  const when = j.minutes ? `*/${j.minutes} * * * *` : `${j.at!.minute} ${j.at!.hour} * * *`;
  const run = `cd ${sq(ROOT)} && PATH=${sq(searchPath())} ${sq(process.execPath)} twin.ts ${j.command} >> ${sq(log(j))} 2>&1`;
  return `${when} ${run.replaceAll("%", "\\%")} # ${KEY}`;
};

async function launchd(load: boolean): Promise<string[]> {
  const domain = `gui/${process.getuid?.()}`;
  const out: string[] = [];
  for (const j of JOBS) {
    const file = join(HOME, "Library/LaunchAgents", `${label(j)}.plist`);
    await Bun.write(file, plist(j));
    if (load) {
      await $`launchctl bootout ${domain}/${label(j)}`.quiet().nothrow();
      await $`launchctl bootstrap ${domain} ${file}`.quiet();
    }
    out.push(`${load ? "ติดตั้ง" : "เขียน"} ${label(j)} · ${j.about}${load ? "" : ` · ยังไม่ load: launchctl bootstrap ${domain} ${file}`}`);
  }
  return out;
}

async function cron(load: boolean): Promise<string[]> {
  const lines = JOBS.map(cronLine);
  if (!load) return ["ยังไม่ได้ลง crontab เพิ่มบรรทัดนี้เอง (crontab -e):", ...lines];
  if (!Bun.which("crontab")) return ["ไม่มี crontab: ตั้งตารางเวลาเองให้รันบรรทัดนี้", ...lines];
  const current = await $`crontab -l`.quiet().nothrow();
  if (current.exitCode !== 0 && !/no crontab/i.test(current.stderr.toString())) throw new Error(`อ่าน crontab ไม่ได้: ${current.stderr.toString().trim()}`);
  const kept = (current.exitCode === 0 ? current.text() : "").split("\n").filter((l) => !l.endsWith(`# ${KEY}`));
  while (kept.length && kept.at(-1) === "") kept.pop();
  await $`crontab - < ${new Response([...kept, ...lines, ""].join("\n"))}`.quiet();
  return JOBS.map((j) => `ติดตั้ง cron · ${j.about}`);
}

async function schtasks(load: boolean): Promise<string[]> {
  const out: string[] = [];
  for (const j of JOBS) {
    const task = label(j);
    const run = `cmd /c cd /d "${ROOT}" && "${process.execPath}" twin.ts ${j.command} >> "${log(j)}" 2>&1`;
    const when = j.minutes ? ["/SC", "MINUTE", "/MO", String(j.minutes)] : ["/SC", "DAILY", "/ST", `${String(j.at!.hour).padStart(2, "0")}:${String(j.at!.minute).padStart(2, "0")}`];
    const args = ["schtasks", "/Create", "/F", "/TN", task, "/TR", run, ...when];
    if (!load) {
      out.push(`ยังไม่ได้ติดตั้ง: ${args.join(" ")}`);
      continue;
    }
    const r = Bun.spawnSync(args);
    out.push(r.exitCode === 0 ? `ติดตั้ง ${task} · ${j.about}` : `ติดตั้ง ${task} ไม่ได้: ${r.stderr.toString().trim()}`);
  }
  return out;
}

export async function removeSchedule(load: boolean): Promise<string[]> {
  const out: string[] = [];
  if (process.platform === "darwin") {
    for (const j of JOBS) {
      const file = join(HOME, "Library/LaunchAgents", `${label(j)}.plist`);
      if (load) await $`launchctl bootout ${`gui/${process.getuid?.()}/${label(j)}`}`.quiet().nothrow();
      if (existsSync(file)) {
        rmSync(file);
        out.push(`เอา ${label(j)} ออก`);
      }
    }
  } else if (process.platform === "win32") {
    if (load) for (const j of JOBS) if (Bun.spawnSync(["schtasks", "/Delete", "/F", "/TN", label(j)]).exitCode === 0) out.push(`เอา ${label(j)} ออก`);
  } else if (load && Bun.which("crontab")) {
    const current = await $`crontab -l`.quiet().nothrow();
    const lines = current.exitCode === 0 ? current.text().split("\n") : [];
    if (lines.some((l) => l.endsWith(`# ${KEY}`))) {
      await $`crontab - < ${new Response(lines.filter((l) => !l.endsWith(`# ${KEY}`)).join("\n"))}`.quiet();
      out.push("เอาบรรทัด cron ออก");
    }
  }
  return out;
}

export async function installSchedule(load: boolean): Promise<string[]> {
  mkdirSync(join(ROOT, "state"), { recursive: true });
  if (process.platform === "darwin") return launchd(load);
  if (process.platform === "win32") return schtasks(load);
  return cron(load);
}
