import { $ } from "bun";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import { MODE_MAX_CHARS, cueOf, quotes, renderMode, tailLine } from "../lib/mode.ts";
import { ROOT } from "../lib/profile.ts";

const ClaudeOut = z.object({ is_error: z.boolean().optional(), result: z.string().optional() });

const probe = (cue: string) =>
  `Without any tool, find the line in your loaded instructions that starts with: ${cue}\nCopy that whole line character for character. Output only that line, nothing else. If no line in your instructions starts that way, output NONE.`;

async function ask(claude: string, cwd: string, cue: string): Promise<string> {
  const r = await $`${claude} -p --model haiku --no-session-persistence --strict-mcp-config --tools "" --output-format json < ${new Response(probe(cue))}`.cwd(cwd).quiet().nothrow();
  const reason = (r.stderr.toString() || r.stdout.toString()).trim().split("\n")[0];
  if (r.exitCode !== 0) throw new Error(`claude -p exit ${r.exitCode}: ${reason}`);
  const out = ClaudeOut.safeParse((() => {
    try {
      return JSON.parse(r.stdout.toString());
    } catch {
      return null;
    }
  })());
  if (!out.success || out.data.is_error) throw new Error(`claude -p ตอบ error: ${out.success ? out.data.result ?? "" : reason}`);
  return (out.data.result ?? "").trim();
}

export default defineCollector({
  title: "Identity",
  order: 75,
  everyMinutes: 24 * 60,
  timeoutSeconds: 240,
  inBrief: false,
  keep: "snapshot",
  defaultOn: true,
  requires: ["claude"],
  async run({ profile, now }) {
    const text = renderMode();
    if (!text) return { kind: "off", why: "ยังไม่มี mode" };
    const claude = Bun.which("claude") ?? "claude";
    const want = tailLine(text);
    const cue = cueOf(want);
    const version = (await $`${claude} --version`.quiet().nothrow()).stdout.toString().trim();
    const dir = profile.scope === "global" ? join(tmpdir(), "twin-probe") : ROOT;
    mkdirSync(dir, { recursive: true });
    const first = await ask(claude, dir, cue);
    const answer = quotes(want, first) ? first : await ask(claude, dir, cue);
    const ok = quotes(want, answer);
    const retried = answer !== first;
    const where = profile.scope === "global" ? "session ใหม่นอก repo" : "session ใหม่ใน repo นี้";
    const verdict = !ok ? `${where} มองไม่เห็นท้ายตัวตน` : retried ? `${where} เห็นตัวตนถึงบรรทัดสุดท้ายในรอบที่สอง` : `${where} เห็นตัวตนถึงบรรทัดสุดท้าย`;
    const md = [
      "# Identity",
      "",
      `${now.toISOString()} · ${version} · ${text.length.toLocaleString()} / ${MODE_MAX_CHARS.toLocaleString()} ตัวอักษร`,
      "",
      `- ${verdict}`,
      `- คาดว่าเห็น: ${want}`,
      ...(retried ? [`- รอบแรกตอบ: ${first.split("\n")[0]}`] : []),
      `- ตอบมา: ${answer.split("\n")[0]}`,
    ].join("\n");
    return {
      kind: "ok",
      files: { "index.md": `${md}\n` },
      brief: `- ${verdict}`,
      items: ok ? [] : [{ key: "identity:cut", title: `${profile.name} อาจทำงานโดยไม่มีตัวตนครบ: ${where} มองไม่เห็นท้าย mode (${version}) · ดู state/identity/index.md`, score: 90 }],
    };
  },
});
