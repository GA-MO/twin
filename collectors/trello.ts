import { z } from "zod";
import { defineCollector } from "../lib/collector.ts";

const API = "https://api.trello.com/1";
const BRIEF_CARDS = 3;

const Card = z.object({
  id: z.string(),
  name: z.string(),
  due: z.string().nullable(),
  dueComplete: z.boolean(),
  url: z.string(),
  idBoard: z.string(),
  idList: z.string(),
  dateLastActivity: z.string(),
});
const Named = z.array(z.object({ id: z.string(), name: z.string() }));
type Card = z.infer<typeof Card>;

async function get<T>(path: string, schema: z.ZodType<T>, auth: string): Promise<T> {
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}${auth}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`trello ${res.status} ${res.statusText}`);
  return schema.parse(await res.json());
}

export default defineCollector({
  title: "Trello",
  order: 20,
  everyMinutes: 30,
  keep: "snapshot",
  defaultOn: false,
  async run({ secret }) {
    const [key, token] = await Promise.all([secret("trello-key"), secret("trello-token")]);
    if (!key || !token) return { kind: "off", why: "ไม่มี secret trello-key + trello-token: bun twin.ts secret trello-key แล้ว bun twin.ts secret trello-token" };
    const auth = `key=${key}&token=${token}`;
    const cards = (await get("/members/me/cards?filter=open&fields=name,due,dueComplete,url,idBoard,idList,dateLastActivity", z.array(Card), auth)).filter(
      (c) => !c.dueComplete,
    );
    const boards = new Map((await get("/members/me/boards?filter=open&fields=name", Named, auth)).map((b) => [b.id, b.name]));
    const lists = new Map<string, string>();
    for (const b of new Set(cards.map((c) => c.idBoard)))
      for (const l of await get(`/boards/${b}/lists?fields=name`, Named, auth)) lists.set(l.id, l.name);
    const where = (c: Card) => `${boards.get(c.idBoard) ?? "?"} / ${lists.get(c.idList) ?? "?"}`;
    const sorted = cards.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
    const index = ["# Trello: การ์ดที่ได้รับมอบหมาย", "", ...sorted.map((c) => `- ${c.name} · ${where(c)}${c.due ? ` · due ${c.due.slice(0, 10)}` : ""} · ${c.url}`)].join("\n");
    return {
      kind: "ok",
      files: { "index.md": `${index}\n` },
      brief: [`- การ์ดที่ได้รับมอบหมาย ${cards.length}`, ...sorted.slice(0, BRIEF_CARDS).map((c) => `- ${c.name} · ${where(c)}${c.due ? ` · due ${c.due.slice(0, 10)}` : ""}`)].join("\n"),
      items: sorted.map((c) => ({
        key: `trello:${c.id}`,
        title: `Trello: ${c.name} (${where(c)})`,
        ...(c.due ? { due: c.due } : {}),
        score: 40,
      })),
    };
  },
});
