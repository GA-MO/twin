import type { Dashboard, Rate, ReportSummary, Run, Snapshot, Subagent } from "../twin/types";

const ago = (minutes: number) => Date.now() - minutes * 60_000;

const agent = (id: string, description: string, isRunning: boolean, minutes: number, doing = ""): Subagent => ({
  id,
  type: isRunning ? "poteto-agent" : "Explore",
  description,
  model: "opus",
  isRunning,
  doing,
  activeAt: ago(minutes),
});

const report = (r: Partial<ReportSummary>): ReportSummary => ({ did: "", pending: "-", discovered: "-", verified: "", question: null, clicked: [], checked: [], ideas: [], commits: [], ...r });

const run = (r: Partial<Run> & Pick<Run, "id" | "project" | "slug">): Run => ({
  owner: null,
  status: "finished",
  outcome: "done",
  answered: false,
  gates: [],
  turn: 1,
  doing: "",
  agents: [],
  commits: 0,
  pushed: true,
  activeAt: ago(5),
  ...r,
});

const approve = run({
  id: "r1",
  project: "shop-web",
  slug: "sit-release-1027",
  outcome: "needs-approval",
  gates: ["push"],
  turn: 3,
  commits: 7,
  doing: "ขึ้น SIT แล้ว รอ push develop",
  activeAt: ago(4),
  report: report({
    did: "Merged the security fix from develop, rebuilt SIT and smoke-tested login, booking and payment.",
    pending: "Push sit-release-1027 to develop so UAT picks it up.",
    verified: "bun test 214 passed, Playwright smoke 12/12 on SIT.",
    clicked: ["Log in @ SIT 1440px → dashboard", "Book a room @ SIT 390px → confirmation email"],
    commits: ["a1c9e2f Merge security fix from develop", "7d03b11 Bump SIT config", "e44a0c2 Fix booking total rounding"],
  }),
});
const question = run({
  id: "r2",
  project: "booking-site",
  slug: "cms-copy",
  outcome: "needs-input",
  commits: 2,
  doing: "หน้า About ใช้ข้อความเดิมหรือข้อความใหม่จากลูกค้า?",
  activeAt: ago(12),
  report: report({ question: "หน้า About ใช้ข้อความเดิมหรือข้อความใหม่จากลูกค้า? ข้อความใหม่ยาวกว่าเดิม 2 เท่า ต้องเพิ่ม section", did: "Moved every page's copy into the CMS.", verified: "All 9 pages render from CMS data." }),
});
const working = run({
  id: "r3",
  project: "draft-tool",
  slug: "tablet-layout",
  status: "running",
  outcome: null,
  turn: 2,
  commits: 3,
  doing: "เปิด dev server แล้ว กำลังเช็กหน้าขนาดแท็บเล็ตทีละหน้า",
  agents: [
    agent("a1", "ปรับ layout หน้าแรกให้ไม่ต้อง scroll", true, 1, "แก้ grid เป็น 2 คอลัมน์ที่ 1024px"),
    agent("a2", "ไล่หา component ที่ล้นจอแท็บเล็ต", false, 9),
    agent("a3", "ตรวจทุกขั้นของฟอร์มบน Chrome ขนาดแท็บเล็ต", true, 2, "กดผ่านขั้นที่ 1-3 แล้ว เหลือหน้าสรุป"),
    agent("a4", "รีวิว diff ทั้งหมดก่อนส่ง", false, 14),
    agent("a5", "เทียบ screenshot กับแบบ", false, 16),
  ],
  activeAt: ago(1),
});
const quiet = run({ id: "r7", project: "company-site", slug: "seo-sitemap", status: "running", outcome: null, doing: "รอ build", activeAt: ago(18) });
const reviewing = run({
  id: "r10",
  project: "booking-site",
  slug: "booking-calendar",
  status: "running",
  outcome: null,
  turn: 1,
  commits: 4,
  doing: "เขียนปฏิทินจองห้องเสร็จแล้ว ให้ reviewer อ่าน",
  agents: [agent("b1", "รีวิวความถูกต้องของการจองซ้อน", true, 3, "ไล่กรณีจองข้ามเที่ยงคืน"), agent("b2", "รีวิวโครงสร้างโค้ด", true, 3, "อ่าน hooks/useBooking.ts")],
  activeAt: ago(3),
});
const ship = run({ id: "r4", project: "ops-portal", slug: "permissions", turn: 4, commits: 11, pushed: false, doing: "ทดสอบสิทธิ์ผู้ใช้ 2 แบบผ่าน", activeAt: ago(30) });
const done = run({ id: "r5", project: "company-site", slug: "footer-links", commits: 1, doing: "แก้ลิงก์ footer", activeAt: ago(90) });
const theirs = run({ id: "r6", owner: "other", ownerSession: { state: "live", name: "twin-71", where: "terminal", status: "idle" }, project: "draft-tool", slug: "report-export", status: "running", outcome: null, doing: "อ่านโค้ดส่วน export", activeAt: ago(2) });
const theirsWaiting = run({
  id: "r11",
  owner: "desktop-1",
  ownerSession: { state: "live", name: "ถึงไหนแล้ว", where: "desktop", status: "idle" },
  project: "ops-portal",
  slug: "permissions",
  outcome: "needs-approval",
  gates: ["push"],
  commits: 15,
  doing: "เพิ่มสิทธิ์แล้ว รอ push develop",
  activeAt: ago(6),
  report: report({ did: "Added the role checks to the admin pages.", pending: "Push to develop.", verified: "bun test 23 passed." }),
});
const long = run({
  id: "r8",
  project: "template-marketplace-v2",
  slug: "checkout-flow-with-very-long-branch-name-for-overflow",
  outcome: "needs-approval",
  gates: ["push", "shared-write"],
  commits: 24,
  doing: "แก้ checkout ทั้ง flow รวม coupon, VAT, ใบเสร็จ และ email ยืนยันเป็นภาษาไทยและอังกฤษ ข้อความยาวมากเพื่อทดสอบการตัดบรรทัด",
  activeAt: ago(140),
});

const crashed = run({ id: "r12", project: "shop-web", slug: "cart-badge", status: "crashed", outcome: null, commits: 2, doing: "worker stopped while running bun test", activeAt: ago(7) });

const snap = (runs: Run[], others: Run[] = []): Snapshot => ({ name: "nok", runs, theirs: others, readAt: Date.now() });

export const SCENARIOS: Record<string, () => Snapshot> = {
  "no runs": () => snap([]),
  "in progress": () => snap([working, quiet]),
  approval: () => snap([approve, working]),
  question: () => snap([question, working]),
  "ready to ship": () => snap([ship]),
  "other session": () => snap([], [theirsWaiting, theirs]),
  done: () => snap([done]),
  failed: () => snap([crashed, working]),
  typical: () => snap([approve, question, working, reviewing, quiet, ship, done], [theirsWaiting, theirs]),
  "many waiting": () => snap([approve, question, long, run({ ...question, id: "r9", slug: "faq-page" }), working], [theirs]),
  "long names": () => snap([long, working, ship]),
  "only other sessions": () => snap([], [theirsWaiting, theirs, { ...working, owner: "other" }]),
};

const rate = (runs: number, untouched: number, rest: Partial<Rate> = {}): Rate => ({ runs, untouched, fixed: 0, more: 0, dropped: 0, waiting: 0, ...rest });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("sv-SE");
const weeks = (counts: [number, number][]) => counts.map(([untouched, runs], i) => ({ from: daysAgo(7 * (counts.length - i) - 1), to: daysAgo(7 * (counts.length - 1 - i)), runs, untouched }));
const projects = (rows: [string | null, number, number, number?][]): Dashboard["projects"] => rows.map(([project, untouched, runs, fixed = 0]) => ({ project, untouched, runs, fixed }));

const typicalDashboard: Dashboard = {
  name: "nok",
  asOf: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  week: { handed: rate(57, 31, { fixed: 11, more: 14, dropped: 1, waiting: 7 }), prev: rate(10, 7, { more: 3 }), sent: 64, prompts: 374, corrections: 30, prevCorrections: 5 },
  trend: weeks([[0, 0], [0, 0], [0, 0], [37, 47], [61, 79], [45, 59], [7, 10], [31, 57]]),
  decisions: { week: 85, prev: 19, byAction: { answer: 44, approve: 6, close: 30, dispatch: 5 }, made30: 306, corrected30: 12 },
  followed: { agreed: 20, judged: 22 },
  projects: projects([
    ["shop", 0, 3, 1],
    ["twin-template", 1, 4, 1],
    [null, 7, 16, 3],
    ["framer-templates", 4, 9, 3],
    ["klip-takra", 5, 10],
    ["prime", 4, 7],
    ["rov-draft", 5, 8],
    ["booth-site", 5, 8, 1],
    ["sol-backoffice-ui", 6, 8, 2],
    ["baton", 5, 7],
    ["template-marketplace-v2-with-a-long-name", 9, 11],
    ["geno", 12, 14],
  ]),
};

const firstWeek: Dashboard = {
  ...typicalDashboard,
  week: { handed: rate(4, 3, { more: 1, waiting: 2 }), prev: null, sent: 6, prompts: 41, corrections: 2, prevCorrections: null },
  trend: weeks([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [3, 4]]),
  decisions: { week: 9, prev: 0, byAction: { answer: 4, approve: 2, close: 3, dispatch: 0 }, made30: 9, corrected30: 0 },
  followed: { agreed: 0, judged: 0 },
  projects: projects([["shop", 3, 4]]),
};

export const DASHBOARDS: Record<string, () => Dashboard | null> = {
  dashboard: () => typicalDashboard,
  "dashboard first week": () => firstWeek,
  "dashboard no audit": () => null,
};
