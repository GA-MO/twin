import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DESIGN_KINDS, type Method } from "./contract.ts";
import { ROOT } from "./profile.ts";
import { SECRET_NAME, secretEnv } from "./secrets.ts";
import { PLAYBOOK_NAMED } from "./steps.ts";

const CORE = ["ชนิด", "ขนาด", "เป้าหมาย", "อ้างอิง", "ห้าม", "เสร็จเมื่อ", "ลงที่"] as const;
const SIZES = ["เล็ก", "กลาง", "ใหญ่"] as const;

type KindSpec = { what: string; lines: string[]; done: string; playbook: string | null; note: string };

export const KINDS = {
  bug: {
    what: "สิ่งที่เคยใช้ได้หรือควรใช้ได้แต่พัง",
    lines: ["อาการ", "ทำซ้ำที่", "คงไว้"],
    done: "ทำตามขั้นใน อาการ แล้วได้ผลที่ควรเป็น และสิ่งใน คงไว้ ยังใช้ได้",
    playbook: "bug-fix",
    note: "อาการ is the repro; ทำซ้ำที่ is where the owner saw it (the environment, and for a page Chrome through Baton): reproduce it there before the fix and check the fix there after; คงไว้ is what the fix must not break.",
  },
  ui: {
    what: "แก้จุดเล็กตาม ticket หรือ feedback (ข้อความ สี ตำแหน่ง ขนาด) บนหน้าที่มีอยู่",
    lines: ["คนใช้", "แบบ", "ต้นแบบ", "คงไว้"],
    done: "จุดที่แก้เป็นตาม แบบ เหมือนจุดเดียวกันในหน้าข้างเคียง และไม่มีอะไรนอกจุดนั้นเปลี่ยน",
    playbook: "feature",
    note: "แบบ is the ticket's ask: match how the same element already looks elsewhere in the product, and change nothing outside it.",
  },
  "ui-figma": {
    what: "ทำตาม Figma หรือแบบที่ลูกค้าวาดมา",
    lines: ["คนใช้", "แบบ", "คงไว้"],
    done: "ภาพของจริงทับ frame ของ แบบ ได้ทุกความกว้างที่แบบมี และกดทุกอย่างที่แก้ได้ผลถูก",
    playbook: "feature",
    note: "แบบ is the Figma frame: export it at each width it has and overlay your screenshot on it until they match. A zero-diff pixel loop is not the bar; a design render never meets it. Never change the drawn layout; taste decides only what the frame leaves out (states, motion, sizes it has no frame for).",
  },
  "ui-redo": {
    what: "รื้อ UX/UI ของหน้าที่มีอยู่ให้ใช้ง่ายขึ้น โดยยึด CI และ design system เดิม",
    lines: ["คนใช้", "แบบ", "ของเดิม", "ต้นแบบ", "คงไว้"],
    done: "ทุกส่วนตรงกับ แบบ ใช้ component และ token ของ project ใช้ง่ายกว่า ของเดิม และ API กับ payload เหมือนเดิม",
    playbook: "feature",
    note: "แบบ is the approved mock; ของเดิม is the version in use (an environment URL or a branch). Build from the project's own components and tokens, keep everything ของเดิม could do, and send the same requests it sent. The design reviewer also sets ของเดิม beside each row: a part that reads worse than ของเดิม is differs even when it matches แบบ.",
  },
  "ui-vibe": {
    what: "UI ของโปรเจกต์ตัวเองที่ไม่มีแบบ ใช้ taste ของเจ้าของ",
    lines: ["คนใช้", "แนว", "ต้นแบบ"],
    done: "ทุกหน้าที่แก้ดู premium ไม่เหมือน AI ทำ อ่านค่าได้ในแวบเดียว ที่ 375 / 768 / 1280 และกดทุกอย่างที่แก้ได้ผลถูก",
    playbook: "feature",
    note: "แนว names the references the owner likes (sites, stills they picked). There is no frame to match: judge by the mode's UI taste against แนว, and put the 375 / 768 / 1280 screenshot paths in verified.",
  },
  feature: {
    what: "ความสามารถใหม่ที่คนใช้ทำได้",
    lines: ["คนใช้", "flow", "ต้นแบบ", "คงไว้"],
    done: "เดิน flow ครบตั้งแต่ต้นจนจบแบบคนใช้ รวมกรณีว่าง error และข้อความยาว",
    playbook: "feature",
    note: "",
  },
  design: {
    what: "หาทางดีไซน์หรือแนวที่ยังไม่ได้ตัดสิน",
    lines: ["คนใช้", "แบบ"],
    done: "ภาพนิ่งหรือ sketch ให้เจ้าของเลือก ยังไม่สร้างของจริง",
    playbook: "prototype",
    note: "Keep prototypes in .twin-scratch/. Do not wait for the owner to pick a direction: put every variant's still (absolute path) in the report and stop there.",
  },
  build: {
    what: "สร้างของตาม spec ที่ตัดสินแล้ว (หน้าเว็บ, template, docs หลายหน้า)",
    lines: ["คนใช้", "spec", "คงไว้"],
    done: "ทุกหน้าที่สร้าง: เนื้อหาครบตาม spec, กดปุ่มหลักแล้วไปถูกที่, ไม่มีข้อความล้น",
    playbook: "feature",
    note: "spec is settled; do not reopen design decisions in it.",
  },
  plan: {
    what: "วางแผนหรือวิจัย ยังไม่แก้ code",
    lines: ["คำถาม"],
    done: "plan file ที่ path ใน อ้างอิง ตอบทุก คำถาม พร้อมหลักฐาน",
    playbook: "investigation",
    note: "Writing and committing the plan file named in อ้างอิง is the one write this kind makes; push the branch like any other turn.",
  },
  release: {
    what: "merge, ขึ้น uat/sit, ออกเวอร์ชัน",
    lines: ["จาก", "ไป"],
    done: "pipeline ของ ไป เขียว และเปิดหน้าจริงบน environment นั้นแล้วใช้ได้",
    playbook: null,
    note: "The project's CLAUDE.md names the steps from จาก to ไป. ใหญ่ here means checking what the release could break and one reviewer on the release diff.",
  },
  deps: {
    what: "อัปเกรด dependency หรือปิด advisory",
    lines: ["คงไว้"],
    done: "ตัวเลข audit ก่อน/หลัง, build ผ่าน, flow หลักใน คงไว้ ยังใช้ได้",
    playbook: "refactoring",
    note: "Behavior must not change; คงไว้ names the flows to prove it on.",
  },
  ci: {
    what: "test หรือ CI ล้มโดยที่ตัวงานไม่ได้พัง",
    lines: ["อาการ"],
    done: "job ที่ล้มผ่านบน environment และ browser ของ CI ซ้ำได้",
    playbook: "bug-fix",
    note: "Reproduce in CI's own environment and browser. If the cause is a real product bug, fix that and say so.",
  },
  feel: {
    what: "ความรู้สึกที่ agent วัดเองไม่ได้ตรงๆ (motion, film, แบรนด์ marketing, hardware, ความลื่น)",
    lines: ["อาการ", "วัด"],
    done: "ค่าที่ วัด ผ่านเกณฑ์ แล้วรายงาน needs-input ให้เจ้าของลองครั้งเดียว พร้อมสิ่งที่วัดได้",
    playbook: "bug-fix",
    note: "วัด names what to record, so the user tries once. Motion and film: record each motion (hover, open, close, scroll, every scene) and check the recording frame by frame for jank, missing motion and timing; put each recording's path in verified.",
  },
} as const satisfies Record<string, KindSpec>;

export type Kind = keyof typeof KINDS;

export const isUiKind = (kind: string | undefined) => kind !== undefined && (kind.startsWith("ui") || kind === "design" || kind === "feel");

const SCREENLESS: readonly string[] = ["deps", "ci", "plan", "release"];
export const mayTouchScreen = (kind: string) => !SCREENLESS.includes(kind);

const isKind = (k: string): k is Kind => Object.hasOwn(KINDS, k);
export const checksDesign = (kind: string | undefined) => DESIGN_KINDS.some((k) => k === kind);

const RESERVED_ENV = /^(PATH|HOME|USER|SHELL|TMPDIR|PWD|LANG|TERM|USERPROFILE|NODE_OPTIONS|TWIN_PORT|(LD|DYLD|BUN|CLAUDE|ANTHROPIC|GIT)_.*)$/;

export function secretNames(list: string): string[] {
  const names = [...new Set(list.split(/[\s,]+/).filter(Boolean))];
  const bad = names.find((n) => !SECRET_NAME.test(n));
  if (bad) throw new Error(`secret ต้องเป็นชื่อที่ตั้งด้วย bun twin.ts secret <name> (a-z0-9-): ${bad}`);
  const reserved = names.find((n) => RESERVED_ENV.test(secretEnv(n)));
  if (reserved) throw new Error(`secret ${reserved} ทับตัวแปรระบบ ${secretEnv(reserved)}: ตั้งชื่ออื่น`);
  return names;
}

export const secretsNote = (names: string[], agent: string) =>
  `Secrets are already in the environment as ${names.map(secretEnv).join(", ")}, read from the OS secret store by ${agent} at turn start: use them from the environment, never print, log or write them to a file, and do not try to read the secret store yourself.`;

const ASK_LINES = [
  ["เสร็จเมื่อ", "d"],
  ["อาการ", "s"],
  ["ทำซ้ำที่", "r"],
  ["คงไว้", "k"],
  ["ต้นแบบ", "c"],
  ["แบบ", "m"],
] as const;
const ASK_ID = /^[dsrkcm]\d+$/;

export const Ask = z.object({ id: z.string().regex(ASK_ID), from: z.enum(ASK_LINES.map(([line]) => line)), text: z.string().min(1) });
export type Ask = z.infer<typeof Ask>;

const briefValue = (task: string) => {
  const all = task.split("\n").map((l) => l.trim());
  const blank = all.findIndex((l) => l === "");
  const lines = blank < 0 ? all : all.slice(0, blank);
  return (k: string) => lines.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1).trim() ?? "";
};

const NONE = /^ไม่มี\s*[:：]\s*(\S.*)?$/;
const QUOTED_REF = /["`'“]((?:~\/|\/|notes\/)[^"`'”\n]+)["`'”]/g;
const DESIGN_REF = /https?:\/\/[^\s,;()<>]+|(?:^|[\s(=])(~?\/[^\s,;()]+|notes\/[\w./-]+|[\w.-]+\/[\w./-]*\.\w{2,5})(?=$|[\s,;)])/g;
const DESIGN_WORDS = /หน้าแบบ(?!เดียว)|ภาพจำลอง|ภาพแบบ(?!เต็ม|เดียว)|(?<!ข้อมูล\s?)\bmock(?:up)?\b|(?:ใน|ตาม)ภาพนิ่ง|ภาพนิ่งที่.{0,12}อนุมัติ/i;
const SCRATCH = /^(?:\/private)?\/(?:tmp|var\/folders)\/|\/\.claude\/worktrees\/|\/\.twin-scratch\//;
const MUST_POINT: readonly string[] = ["ui-redo", "ui-figma"];

let rootDirs: Set<string> | null = null;
const fsRoots = () => {
  if (!rootDirs) {
    try {
      rootDirs = new Set(readdirSync("/"));
    } catch {
      rootDirs = new Set();
    }
  }
  return rootDirs;
};

function resolveRef(raw: string): string | null {
  const ref = raw.replace(/^~(?=\/)/, process.env.HOME ?? "~").replace(/[.,)]+$/, "");
  if (/^https?:/.test(ref)) return ref;
  if (!ref.startsWith("/")) return existsSync(join(ROOT, ref)) ? join(ROOT, ref) : ref;
  const parts = ref.split("/").filter(Boolean);
  return parts.length >= 2 && fsRoots().has(parts[0] ?? "") ? ref : null;
}

const rawRefs = (text: string) => {
  const quoted = [...text.matchAll(QUOTED_REF)].map((m) => m[1] ?? "");
  const rest = text.replace(QUOTED_REF, " ");
  return [...quoted, ...[...rest.matchAll(DESIGN_REF)].map((m) => m[1] ?? m[0])];
};

export const designRefs = (text: string) => [...new Set(rawRefs(text).map(resolveRef).filter((r): r is string => r !== null))];

const askTexts = (from: string, value: string) => {
  if (from === "แบบ") {
    const refs = designRefs(value);
    return refs.length ? [`งานตรงกับแบบใน ${refs.join(", ")} ทุก element ที่แบบวาดไว้ ส่วนที่ต่างอยู่ใน report พร้อมเหตุผล`] : [];
  }
  if (from === "ต้นแบบ" && NONE.test(value)) return [];
  const parts = value.split(/\s+·\s+/).flatMap((part) => part.split(/\s*\(\d+\)\s+/));
  return from === "ต้นแบบ" ? parts.map((p) => p.trim() && `ใช้ซ้ำหรือทำให้เหมือน ${p.trim()} เปิดเทียบกันแล้วไม่ต่างโดยไม่บอก`) : parts;
};

export function designProblem(kind: string, value: (k: string) => string): string | null {
  const design = value("แบบ");
  const raw = rawRefs(design);
  const temp = raw.find((r) => SCRATCH.test(r));
  if (temp) return `แบบ ชี้ไปที่ scratchpad ที่หายได้ (${temp}): ย้ายไฟล์แบบไปไว้ notes/<YYYY-MM-DD>-<slug>/ ก่อน แล้วชี้ที่นั่น`;
  const refs = designRefs(design);
  if (MUST_POINT.includes(kind) && !refs.length) return `แบบ ของชนิด ${kind} ต้องชี้ไปที่ไฟล์หรือ URL ของแบบที่อนุมัติ ห้ามเล่าแบบเป็นคำ`;
  const prose = raw.reduce((text, ref) => text.replace(ref, " "), design);
  if (!refs.length && DESIGN_WORDS.test(prose)) return "แบบ อ้างถึงหน้าแบบหรือภาพจำลอง: ใส่ path หรือ URL ของมันในบรรทัด แบบ แทนการเล่า";
  const missing = refs.find((r) => r.startsWith("/") && !existsSync(r));
  if (missing) return `แบบ ชี้ไปที่ไฟล์ที่ไม่มีอยู่: ${missing}`;
  const none = value("ต้นแบบ");
  if (none.startsWith("ไม่มี") && !NONE.exec(none)?.[1]) return "ต้นแบบ: ไม่มี ต้องบอกเหตุผล เช่น \"ไม่มี: หน้าแรกของ project\"";
  return null;
}

export const parseAsks = (task: string): Ask[] => {
  const value = briefValue(task);
  return ASK_LINES.flatMap(([from, prefix]) =>
    askTexts(from, value(from))
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `${prefix}${i + 1}`, from, text })),
  );
};

export const ASK_LIST_HEAD = "ledger ของทุก report มีแถวละหนึ่งข้อตามนี้";

export const askId = (ask: string) => ask.match(/^\s*([dsrkcm]\d+)\b/i)?.[1]?.toLowerCase() ?? ask;

export const askList = (asks: Ask[]) =>
  asks.length ? `${ASK_LIST_HEAD} (ข้อที่ตรวจแล้วและโค้ดไม่เปลี่ยนตั้งแต่นั้น ใช้แถวเดิมได้):\n${asks.map((a) => `- ${a.id}: ${a.text}`).join("\n")}` : "";

export function parseBrief(task: string, agent: string, method: Method): { kind: Kind; prompt: string; secrets: string[]; asks: Ask[] } {
  const value = briefValue(task);
  const kind = value("ชนิด").split(/\s/)[0] ?? "";
  if (!isKind(kind)) throw new Error(`brief ต้องมี "ชนิด: <${Object.keys(KINDS).join("|")}>" (ได้ "${kind}")`);
  const spec: KindSpec = KINDS[kind];
  const missing = [...CORE, ...spec.lines].filter((k) => !value(k));
  if (missing.length) throw new Error(`brief ชนิด ${kind} ขาดบรรทัด: ${missing.join(", ")} · เสร็จเมื่อ ของชนิดนี้: ${spec.done}`);
  const design = designProblem(kind, value);
  if (design) throw new Error(design);
  const size = value("ขนาด").split(/\s/)[0] ?? "";
  if (!SIZES.some((z) => z === size)) throw new Error(`ขนาด ต้องเป็น ${SIZES.join(" | ")} (ได้ "${size}")`);
  const secrets = secretNames(value("secret"));
  const how = [
    method.kind === "lean" ? "Work by the contract's method rules." : spec.playbook ? `Run poteto-mode's ${spec.playbook} ${PLAYBOOK_NAMED}` : `No poteto playbook fits; ${agent}-mode and the contract govern.`,
    spec.note,
    spec.lines.includes("ต้นแบบ") ? "ต้นแบบ names the existing pages and components this work must match or reuse: use the component instead of writing a new one (add an optional prop when it falls short), and open each page beside yours." : "",
    `Size ${size}.`,
    "Precedence is in the contract.",
    secrets.length ? secretsNote(secrets, agent) : "",
  ].filter(Boolean);
  const asks = parseAsks(task);
  return { kind, prompt: [`${task}\n\nงานชนิด ${kind}. ${how.join(" ")}`, askList(asks)].filter(Boolean).join("\n\n"), secrets, asks };
}
