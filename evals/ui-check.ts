import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import { z } from "zod";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function chrome(): string {
  if (process.platform === "darwin" && existsSync(MAC_CHROME)) return MAC_CHROME;
  const found = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"].map((c) => Bun.which(c)).find(Boolean);
  if (!found) throw new Error("ไม่พบ Chrome หรือ Chromium: ติดตั้งก่อนรัน fixture UI");
  return found;
}
const Check = z.object({ name: z.string(), url: z.string(), run: z.string(), width: z.number().optional() });
const Target = z.object({ webSocketDebuggerUrl: z.string() });

export async function uiCheck(root: string, checksFile: string): Promise<{ pass: number; fail: number; failed: string[] }> {
  const checks = z.array(Check).parse((await import(resolve(checksFile))).default);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = normalize(decodeURIComponent(new URL(req.url).pathname));
      const file = Bun.file(join(root, path === "/" ? "index.html" : path));
      return file.exists().then((yes) => (yes ? new Response(file) : new Response("not found", { status: 404 })));
    },
  });
  const profile = mkdtempSync(join(tmpdir(), "twin-ui-"));
  const browser = Bun.spawn([chrome(), "--headless=new", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stderr: "pipe" });
  const port = await (async () => {
    const reader = browser.stderr.getReader();
    let text = "";
    while (!/DevTools listening on ws:\/\/[^:]+:(\d+)/.test(text)) {
      const { value, done } = await reader.read();
      if (done) throw new Error("chrome exited before DevTools came up");
      text += new TextDecoder().decode(value);
    }
    return Number(/DevTools listening on ws:\/\/[^:]+:(\d+)/.exec(text)![1]);
  })();
  const failed: string[] = [];
  let pass = 0;
  try {
    for (const c of checks) {
      const t = Target.parse(await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json());
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
      let seq = 0;
      const pending = new Map<number, (v: unknown) => void>();
      const events: string[] = [];
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown; method?: string };
        if (m.id !== undefined) pending.get(m.id)?.(m.result);
        if (m.method) events.push(m.method);
      });
      const send = (method: string, params: object = {}) =>
        new Promise<unknown>((ok) => { const id = ++seq; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
      await send("Page.enable");
      await send("Emulation.setDeviceMetricsOverride", { width: c.width ?? 1280, height: 800, deviceScaleFactor: 1, mobile: (c.width ?? 1280) < 600 });
      await send("Page.navigate", { url: `http://127.0.0.1:${server.port}${c.url}` });
      for (let i = 0; i < 50 && !events.includes("Page.loadEventFired"); i++) await Bun.sleep(100);
      await Bun.sleep(200);
      const res = z
        .object({ result: z.object({ value: z.unknown().optional() }), exceptionDetails: z.unknown().optional() })
        .safeParse(await send("Runtime.evaluate", { expression: `(async () => { const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms)); return await (${c.run})(); })()`, awaitPromise: true, returnByValue: true }));
      const ok = res.success && !res.data.exceptionDetails && res.data.result.value === true;
      if (ok) pass++;
      else failed.push(c.name);
      ws.close();
    }
  } finally {
    browser.kill();
    server.stop(true);
    rmSync(profile, { recursive: true, force: true });
  }
  return { pass, fail: failed.length, failed };
}

if (import.meta.main) {
  const [root, checks] = process.argv.slice(2);
  if (!root || !checks) throw new Error("ใช้: bun evals/ui-check.ts <site dir> <checks.js>");
  console.log(await uiCheck(root, checks));
}
