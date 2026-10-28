import { isAbsolute, relative, sep } from "node:path";

const fold = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);

export function inside(dir: string, path: string): boolean {
  const r = relative(fold(dir), fold(path));
  return r !== "" && r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r);
}

export const firstSegment = (dir: string, path: string) => relative(dir, path).split(/[\\/]/)[0]!;
