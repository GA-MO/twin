import type { ReportSummary, Run, Snapshot, Subagent } from "../twin/types";

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

const report = (r: Partial<ReportSummary>): ReportSummary => ({ did: "", pending: "-", discovered: "-", verified: "", question: null, clicked: [], ideas: [], commits: [], ...r });

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

const snap = (runs: Run[], others: Run[] = []): Snapshot => ({ name: "nok", runs, theirs: others, readAt: Date.now() });

export const SCENARIOS: Record<string, () => Snapshot> = {
  typical: () => snap([approve, question, working, reviewing, quiet, ship, done], [theirsWaiting, theirs]),
  "many waiting": () => snap([approve, question, long, run({ ...question, id: "r9", slug: "faq-page" }), working], [theirs]),
  "long names": () => snap([long, working, ship]),
  "in progress only": () => snap([working, quiet]),
  "only other sessions": () => snap([], [theirsWaiting, theirs, { ...working, owner: "other" }]),
};
