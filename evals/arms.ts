import { $ } from "bun";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import { contract, currentMethod } from "../lib/contract.ts";
import { close, listRuns, readRun, start } from "../lib/dispatch.ts";
import { HOME, ROOT, loadProfile } from "../lib/profile.ts";
import { uiCheck } from "./ui-check.ts";

const USAGE = "bun evals/arms.ts [--fixtures evals/fixtures-hard] [--tasks a,b] [--arms now,review,pstack] [--reps 2] [--isolated] [--out <results.json>] [--slots 3] [--cap-minutes 45]  (--isolated: worker โหลดแค่ settings ของ twin นี้ ไม่เอา hook หรือ plugin อื่นของเครื่อง)";
const OUT = join(ROOT, "evals/results");
const WORK = join(tmpdir(), "twin-arms");

const REVIEW = `
- Before done, always run one independent reviewer on your final diff: spawn a subagent that did not write the change (with pstack, the pstack:thermo-nuclear-review-subagent agent) with the diff and the brief, wait for it, address what it finds, and say what it found in discovered. This holds at every ขนาด.
`;

function pstackFull(name: string): string {
  const method = currentMethod();
  if (method.kind !== "poteto") throw new Error("arm pstack ต้องมี pstack ติดตั้งอยู่");
  const lines = contract(name, method).split("\n");
  const one = lines.findIndex((l) => l.startsWith("- Work as one agent"));
  const size = lines.findIndex((l) => l.startsWith("Size, from the brief"));
  const lean = lines.findIndex((l) => l.startsWith("Every worker task is code work"));
  if (one < 0 || size < 0 || lean < 0) throw new Error("contract เปลี่ยน: arm pstack หาบรรทัดที่ต้องแทนไม่เจอ");
  const sizeEnd = lines.findIndex((l, i) => i > size && l === "");
  lines[one] = "- For this run Size does not apply: run poteto-mode exactly as written, with its delegation, arena, reviewer and review-gate steps. A review gate poteto would hold closed (BLOCKED: independent review) is outcome \"blocked\".";
  lines[lean] = "Every worker task is code work, so pstack poteto-mode follows, loaded in full below: do not invoke it with the Skill tool, open the playbooks, principles and skills it names from its base directory, and run it for this task as written.";
  lines.splice(size, sizeEnd - size + 1);
  return `${lines.join("\n")}\nBase directory for poteto-mode: ${method.dir}\n\n${readFileSync(join(method.dir, "SKILL.md"), "utf8")}`;
}

const ARMS = {
  now: (_name: string): string | undefined => undefined,
  review: (name: string): string | undefined => contract(name, currentMethod()) + REVIEW,
  pstack: (name: string): string | undefined => pstackFull(name),
};
type Arm = keyof typeof ARMS;
const isArm = (a: string): a is Arm => a in ARMS;

type Job = { task: string; arm: Arm; rep: number };
type Result = Job & {
  fixtures: string; id: string; outcome: string; hiddenPass: number; hiddenFail: number; visibleFail: number;
  minutes: number; usd: number; subagents: number; turns: number; falseDone: boolean; note: string; diff: string | null;
};

const args = process.argv.slice(2);
const pick = (flag: string) => {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${flag} ต้องมีค่า\n${USAGE}`);
  return v.split(",");
};
const FIXTURES = resolve(ROOT, pick("--fixtures")?.[0] ?? "evals/fixtures");
if (!existsSync(FIXTURES)) throw new Error(`ไม่พบ fixtures ${FIXTURES}\n${USAGE}`);
const available = readdirSync(FIXTURES).filter((t) => existsSync(join(FIXTURES, t, "brief.md")));
if (!available.length) throw new Error(`${FIXTURES} ไม่มี fixture (โฟลเดอร์ที่มี brief.md)\n${USAGE}`);
const tasks = [...new Set(pick("--tasks") ?? available)];
const unknownTask = tasks.find((t) => !available.includes(t));
if (unknownTask) throw new Error(`ไม่มี fixture "${unknownTask}" ใน ${FIXTURES}: ${available.join(", ")}`);
const armNames = [...new Set(pick("--arms") ?? Object.keys(ARMS))];
const arms = armNames.filter(isArm);
if (arms.length !== armNames.length) throw new Error(`arm ที่มี: ${Object.keys(ARMS).join(", ")}`);
const reps = Number(pick("--reps")?.[0] ?? 2);
if (!Number.isInteger(reps) || reps < 1 || reps > 20) throw new Error(`--reps ต้องเป็นจำนวนเต็ม 1-20\n${USAGE}`);
const jobs: Job[] = tasks.flatMap((task) => arms.flatMap((arm) => Array.from({ length: reps }, (_, i) => ({ task, arm, rep: i + 1 }))));
const isolated = args.includes("--isolated");
const SLOTS = Number(pick("--slots")?.[0] ?? 3);
const RUN_CAP_MS = Number(pick("--cap-minutes")?.[0] ?? 45) * 60_000;
if (!Number.isInteger(SLOTS) || SLOTS < 1 || SLOTS > 20 || !(RUN_CAP_MS > 0)) throw new Error(`--slots ต้องเป็นจำนวนเต็ม 1-20 และ --cap-minutes มากกว่า 0\n${USAGE}`);
const out = pick("--out")?.join(",");
const profile = loadProfile();
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const diffs = join(OUT, `diffs-${stamp}`);

async function setup(j: Job): Promise<string> {
  const dir = join(WORK, `${j.task}-${j.arm}${j.rep}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const repo = join(dir, "repo");
  const remote = join(dir, "remote.git");
  cpSync(join(FIXTURES, j.task, "repo"), repo, { recursive: true });
  await $`git init -q --bare -b main ${remote}`.quiet();
  await $`git -C ${repo} init -q -b main && git -C ${repo} add -A && git -C ${repo} -c user.email=eval@twin.local -c user.name="twin eval" commit -q -m fixture && git -C ${repo} remote add origin ${remote} && git -C ${repo} push -q -u origin main && git -C ${repo} remote set-head origin -a`.quiet();
  return repo;
}

const counts = (r: { stdout: Buffer; stderr: Buffer }) => {
  const out = r.stdout.toString() + r.stderr.toString();
  return {
    pass: Number(/(\d+) pass/.exec(out)?.[1] ?? 0),
    fail: Number(/(\d+) fail/.exec(out)?.[1] ?? 0) + Number(/(\d+) error/.exec(out)?.[1] ?? 0),
  };
};

function subagentsOf(session: string): number {
  const projects = join(HOME, ".claude/projects");
  if (!existsSync(projects)) return 0;
  for (const d of readdirSync(projects)) {
    const sub = join(projects, d, session, "subagents");
    if (existsSync(sub)) return readdirSync(sub).filter((f) => f.endsWith(".jsonl")).length;
  }
  return 0;
}

const Cost = z.object({ total_cost_usd: z.number() });

function usdOf(id: string): number {
  const dir = join(ROOT, "runs", id);
  let session = 0;
  let sum = 0;
  for (const t of readdirSync(dir).filter((f) => f.startsWith("turn-")).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))) {
    const file = join(dir, t, "result.json");
    if (!existsSync(file)) continue;
    const r = (() => {
      try {
        return Cost.safeParse(JSON.parse(readFileSync(file, "utf8")));
      } catch {
        return null;
      }
    })();
    if (!r?.success) continue;
    sum += r.data.total_cost_usd >= session ? r.data.total_cost_usd - session : r.data.total_cost_usd;
    session = r.data.total_cost_usd;
  }
  return Math.round(sum * 100) / 100;
}

async function runJob(j: Job): Promise<Result> {
  const repo = await setup(j);
  const brief = readFileSync(join(FIXTURES, j.task, "brief.md"), "utf8");
  const begun = Date.now();
  const custom = ARMS[j.arm](profile.name);
  const v0 = await start(repo, `${j.task}-${j.arm}${j.rep}`.slice(0, 40), brief, { ...(custom === undefined ? {} : { contract: custom }), isolated });
  let v = readRun(v0.id);
  while (v.status === "running" && Date.now() - begun < RUN_CAP_MS) {
    await Bun.sleep(10_000);
    v = readRun(v0.id);
  }
  const timedOut = v.status === "running";
  if (timedOut) await close(v0.id, { discard: true, stop: true, take: true }).catch(() => "");
  const minutes = (Date.now() - begun) / 60_000;
  let hidden = { pass: 0, fail: 0 };
  let visible = { pass: 0, fail: 0 };
  let diffFile: string | null = null;
  if (existsSync(v.worktree)) {
    const diff = await $`git -C ${v.worktree} diff origin/HEAD -- . ${":!hidden"}`.quiet().nothrow();
    diffFile = join(diffs, `${j.task}-${j.arm}${j.rep}.diff`);
    writeFileSync(diffFile, diff.stdout.toString());
    const ui = join(FIXTURES, j.task, "hidden/checks.js");
    if (existsSync(ui)) {
      const r = await uiCheck(v.worktree, ui);
      hidden = { pass: r.pass, fail: r.fail };
    } else {
      cpSync(join(FIXTURES, j.task, "hidden"), join(v.worktree, "hidden"), { recursive: true });
      hidden = counts(await $`bun test hidden`.cwd(v.worktree).quiet().nothrow());
      visible = counts(await $`bun test test`.cwd(v.worktree).quiet().nothrow());
    }
  }
  const outcome = timedOut ? "timeout" : (v.report?.outcome ?? v.status);
  const result: Result = {
    ...j, fixtures: relative(ROOT, FIXTURES), id: v0.id, outcome, hiddenPass: hidden.pass, hiddenFail: hidden.fail, visibleFail: visible.fail,
    minutes: Math.round(minutes * 10) / 10, usd: usdOf(v0.id), subagents: subagentsOf(v.session), turns: v.turn,
    falseDone: outcome === "done" && hidden.fail > 0, note: (v.report?.discovered ?? v.rawResult ?? "").slice(0, 300),
    diff: diffFile && relative(ROOT, diffFile),
  };
  if (!timedOut) await close(v0.id, { discard: true, stop: false, take: true }).catch(() => "");
  rmSync(join(WORK, `${j.task}-${j.arm}${j.rep}`), { recursive: true, force: true });
  return result;
}

const busy = () => listRuns().filter((r) => r.status === "running").length;
mkdirSync(diffs, { recursive: true });
const file = join(OUT, `arms-${stamp}.json`);
const results: Result[] = [];
const queue = [...jobs];
const live = new Set<Promise<void>>();
while (queue.length || live.size) {
  while (queue.length && live.size < SLOTS && busy() < profile.maxRuns) {
    const j = queue.shift()!;
    const p: Promise<void> = runJob(j)
      .then((r) => {
        results.push(r);
        writeFileSync(file, JSON.stringify(results, null, 2));
        if (out) writeFileSync(resolve(out), JSON.stringify(results, null, 2));
        console.log(`${r.task} ${r.arm}${r.rep} · ${r.outcome} · hidden ${r.hiddenPass}/${r.hiddenPass + r.hiddenFail} · ${r.minutes}m · $${r.usd} · sub ${r.subagents}${r.falseDone ? " · FALSE DONE" : ""}`);
      })
      .catch((e) => console.log(`${j.task} ${j.arm}${j.rep} · error ${(e as Error).message}`))
      .finally(() => live.delete(p));
    live.add(p);
    await Bun.sleep(3_000);
  }
  await Bun.sleep(5_000);
}
if (out && !existsSync(resolve(out))) writeFileSync(resolve(out), "[]");
console.log(`done · ${file}`);
