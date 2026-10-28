import type { Method } from "./contract.ts";
import { SECRET_NAME, secretEnv } from "./secrets.ts";

const CORE = ["ชนิด", "ขนาด", "เป้าหมาย", "อ้างอิง", "ห้าม", "เสร็จเมื่อ", "ลงที่"] as const;
const SIZES = ["เล็ก", "กลาง", "ใหญ่"] as const;

type KindSpec = { what: string; lines: string[]; done: string; playbook: string | null; note: string; fits: string };

export const KINDS = {
  bug: {
    what: "สิ่งที่เคยใช้ได้หรือควรใช้ได้แต่พัง",
    lines: ["อาการ", "คงไว้"],
    done: "ทำตามขั้นใน อาการ แล้วได้ผลที่ควรเป็น และสิ่งใน คงไว้ ยังใช้ได้",
    playbook: "bug-fix",
    note: "อาการ is the repro; คงไว้ is what the fix must not break.",
    fits: "why when it is a regression (what changed and when), tdd when there is a cheap test target, blast-radius when the fix touches shared code",
  },
  ui: {
    what: "เปลี่ยนหน้าตาหรือการโต้ตอบตามแบบ (Figma, ticket, feedback ลูกค้า)",
    lines: ["คนใช้", "แบบ", "คงไว้"],
    done: "ตรงกับ แบบ ทุกขนาดจอที่แบบมี และกดทุกอย่างที่แก้ได้ผลถูก",
    playbook: "feature",
    note: "แบบ is the reference: export it at each width it has and overlay your screenshot on it until they match. A zero-diff pixel loop is not the bar; a design render never meets it.",
    fits: "blast-radius when the change is to a shared style or component",
  },
  feature: {
    what: "ความสามารถใหม่ที่คนใช้ทำได้",
    lines: ["คนใช้", "flow", "คงไว้"],
    done: "เดิน flow ครบตั้งแต่ต้นจนจบแบบคนใช้ รวมกรณีว่าง error และข้อความยาว",
    playbook: "feature",
    note: "",
    fits: "architect when it crosses modules, how before touching code you don't know, interrogate when the design is contested",
  },
  design: {
    what: "หาทางดีไซน์หรือแนวที่ยังไม่ได้ตัดสิน",
    lines: ["คนใช้", "แบบ"],
    done: "ภาพนิ่งหรือ sketch ให้เจ้าของเลือก ยังไม่สร้างของจริง",
    playbook: "prototype",
    note: "Keep prototypes in .twin-scratch/. Do not wait for the owner to pick a direction: put every variant's still (absolute path) in the report and stop there.",
    fits: "arena or principle-exhaust-the-design-space for 2-3 directions side by side",
  },
  build: {
    what: "สร้างของตาม spec ที่ตัดสินแล้ว (หน้าเว็บ, template, docs หลายหน้า)",
    lines: ["คนใช้", "spec", "คงไว้"],
    done: "ทุกหน้าที่สร้าง: เนื้อหาครบตาม spec, กดปุ่มหลักแล้วไปถูกที่, ไม่มีข้อความล้น",
    playbook: "feature",
    note: "spec is settled; do not reopen design decisions in it.",
    fits: "swarm when pages are independent and many, blast-radius before editing a shared component",
  },
  plan: {
    what: "วางแผนหรือวิจัย ยังไม่แก้ code",
    lines: ["คำถาม"],
    done: "plan file ที่ path ใน อ้างอิง ตอบทุก คำถาม พร้อมหลักฐาน",
    playbook: "investigation",
    note: "Writing and committing the plan file named in อ้างอิง is the one write this kind makes; push the branch like any other turn.",
    fits: "how for how it works now, why for why it is this way, sharpen when the question itself is fuzzy",
  },
  release: {
    what: "merge, ขึ้น uat/sit, ออกเวอร์ชัน",
    lines: ["จาก", "ไป"],
    done: "pipeline ของ ไป เขียว และเปิดหน้าจริงบน environment นั้นแล้วใช้ได้",
    playbook: null,
    note: "The project's CLAUDE.md names the steps from จาก to ไป. ใหญ่ here means checking what the release could break and one reviewer on the release diff.",
    fits: "blast-radius on what the release changes, fix-ci when a check fails",
  },
  deps: {
    what: "อัปเกรด dependency หรือปิด advisory",
    lines: ["คงไว้"],
    done: "ตัวเลข audit ก่อน/หลัง, build ผ่าน, flow หลักใน คงไว้ ยังใช้ได้",
    playbook: "refactoring",
    note: "Behavior must not change; คงไว้ names the flows to prove it on.",
    fits: "blast-radius on each major version bump, why when a version pin looks deliberate",
  },
  ci: {
    what: "test หรือ CI ล้มโดยที่ตัวงานไม่ได้พัง",
    lines: ["อาการ"],
    done: "job ที่ล้มผ่านบน environment และ browser ของ CI ซ้ำได้",
    playbook: "bug-fix",
    note: "Reproduce in CI's own environment and browser. If the cause is a real product bug, fix that and say so.",
    fits: "fix-ci, why for when it started failing",
  },
  feel: {
    what: "ความรู้สึกที่ agent วัดเองไม่ได้ตรงๆ (motion, hardware, ความลื่น)",
    lines: ["อาการ", "วัด"],
    done: "ค่าที่ วัด ผ่านเกณฑ์ แล้วรายงาน needs-input ให้เจ้าของลองครั้งเดียว พร้อมสิ่งที่วัดได้",
    playbook: "bug-fix",
    note: "วัด names what to record, so the user tries once.",
    fits: "runtime-forensics playbook for the instrumentation, benchmark-checklist before trusting a measured number",
  },
} as const satisfies Record<string, KindSpec>;

export type Kind = keyof typeof KINDS;

const isKind = (k: string): k is Kind => Object.hasOwn(KINDS, k);

const RESERVED_ENV = /^(PATH|HOME|USER|SHELL|TMPDIR|PWD|LANG|TERM|USERPROFILE|NODE_OPTIONS|TWIN_PORT|(LD|DYLD|BUN|CLAUDE|ANTHROPIC|GIT)_.*)$/;

export function parseBrief(task: string, agent: string, method: Method): { kind: Kind; prompt: string; secrets: string[] } {
  const all = task.split("\n").map((l) => l.trim());
  const blank = all.findIndex((l) => l === "");
  const lines = blank < 0 ? all : all.slice(0, blank);
  const value = (k: string) => lines.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1).trim() ?? "";
  const kind = value("ชนิด").split(/\s/)[0] ?? "";
  if (!isKind(kind)) throw new Error(`brief ต้องมี "ชนิด: <${Object.keys(KINDS).join("|")}>" (ได้ "${kind}")`);
  const spec: KindSpec = KINDS[kind];
  const missing = [...CORE, ...spec.lines].filter((k) => !value(k));
  if (missing.length) throw new Error(`brief ชนิด ${kind} ขาดบรรทัด: ${missing.join(", ")} · เสร็จเมื่อ ของชนิดนี้: ${spec.done}`);
  const size = value("ขนาด").split(/\s/)[0] ?? "";
  if (!SIZES.some((z) => z === size)) throw new Error(`ขนาด ต้องเป็น ${SIZES.join(" | ")} (ได้ "${size}")`);
  const secrets = value("secret").split(/[\s,]+/).filter(Boolean);
  const badSecret = secrets.find((n) => !SECRET_NAME.test(n));
  if (badSecret) throw new Error(`secret ต้องเป็นชื่อที่ตั้งด้วย bun twin.ts secret <name> (a-z0-9-): ${badSecret}`);
  const reserved = secrets.find((n) => RESERVED_ENV.test(secretEnv(n)));
  if (reserved) throw new Error(`secret ${reserved} ทับตัวแปรระบบ ${secretEnv(reserved)}: ตั้งชื่ออื่น`);
  const how = [
    method.kind === "lean" ? "Work by the contract's method rules." : spec.playbook ? `Run poteto-mode's ${spec.playbook} playbook for it.` : `No poteto playbook fits; ${agent}-mode and the contract govern.`,
    spec.note,
    `Size ${size}.`,
    method.kind === "poteto" ? `Other poteto skills that often fit this kind: ${spec.fits}. Use them when the task needs them, not because they are listed.` : "",
    "Precedence is in the contract.",
    secrets.length ? `Secrets are already in the environment as ${secrets.map(secretEnv).join(", ")}, read from the OS secret store by ${agent} at turn start: use them from the environment, never print, log or write them to a file, and do not try to read the secret store yourself.` : "",
  ].filter(Boolean);
  return { kind, prompt: `${task}\n\nงานชนิด ${kind}. ${how.join(" ")}`, secrets };
}
