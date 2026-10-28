import { $ } from "bun";
import { join } from "node:path";
import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";
import { readNotes } from "../lib/notes.ts";
import { ROOT } from "../lib/profile.ts";

const SCRIPT = join(ROOT, "native/notes-inbox.js");
const URL = /https?:\/\/[^\s<>"')]+/;

const Entry = z.object({ id: z.string(), name: z.string(), created: z.string(), modified: z.string(), text: z.string() });
const Output = z.union([z.array(Entry), z.object({ error: z.literal("no-folder") })]);

export default defineCollector({
  title: "Inbox ไอเดีย (Apple Notes)",
  order: 45,
  everyMinutes: 10,
  timeoutSeconds: 60,
  keep: "snapshot",
  defaultOn: false,
  requires: ["macos"],
  async run({ profile }) {
    const folder = `${profile.name} inbox`;
    const r = await $`osascript -l JavaScript ${SCRIPT} ${folder}`.quiet().nothrow();
    if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim().split("\n")[0] || `osascript exit ${r.exitCode}`);
    const out = Output.parse(JSON.parse(r.stdout.toString()));
    if (!Array.isArray(out)) return { kind: "off", why: `ไม่มีโฟลเดอร์ "${folder}" ใน Notes` };
    const taken = new Set(readNotes().notes.map((n) => n.source).filter((s): s is string => !!s));
    const fresh = out.filter((e) => !taken.has(`notes-inbox:${e.id}`));
    const files = Object.fromEntries(
      out.map((e, i) => [
        `${String(i + 1).padStart(3, "0")}.md`,
        `---\nid: ${e.id}\ncreated: ${e.created}\ntaken: ${taken.has(`notes-inbox:${e.id}`)}\n---\n# ${e.name}\n\n${e.text}\n`,
      ]),
    );
    return {
      kind: "ok",
      files,
      brief: out.length ? `- ใหม่ ${fresh.length} จาก ${out.length}${fresh.length ? `: ${fresh.slice(0, 3).map((e) => e.name).join(" · ")}` : ""}` : "",
      items: fresh.map((e) => ({
        key: `inbox:${e.id}`,
        title: `inbox: ${e.name}${e.text.match(URL) ? ` · ${e.text.match(URL)![0]}` : ""}`,
        score: 25,
      })),
    };
  },
});
