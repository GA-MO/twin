import { join } from "node:path";
export function resolveFile(root: string, urlPath: string): string | null {
  const clean = urlPath.split("?")[0]!;
  if (clean.includes("..")) return null;
  return join(root, clean);
}
