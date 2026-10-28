export function parseDuration(input: string): number {
  const m = /^(\d+)h(\d+)m$/.exec(input);
  if (!m) return 0;
  return (Number(m[1]) * 60 + Number(m[2])) * 60_000;
}
