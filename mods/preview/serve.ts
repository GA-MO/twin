import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 4390);
const WATCH = [import.meta.dir, join(import.meta.dir, "../twin/hooks"), join(import.meta.dir, "../twin/types")];

const version = () =>
  String(Math.max(...WATCH.flatMap((dir) => readdirSync(dir).map((f) => statSync(join(dir, f)).mtimeMs))));

async function bundle(): Promise<Response> {
  const out = await Bun.build({ entrypoints: [join(import.meta.dir, "app.tsx")], target: "browser", define: { "process.env.NODE_ENV": '"development"' } });
  if (!out.success) return new Response(`document.body.innerText = ${JSON.stringify(out.logs.map(String).join("\n"))}`, { headers: { "content-type": "text/javascript" } });
  return new Response(await out.outputs[0]!.text(), { headers: { "content-type": "text/javascript" } });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/app.js") return bundle();
    if (pathname === "/version") return new Response(version());
    return new Response(Bun.file(join(import.meta.dir, "index.html")));
  },
});
console.log(`twin mod preview: http://localhost:${PORT}`);
