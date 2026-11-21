export type Lang = "th" | "en";

export const localeLang = (locale: string): Lang => (/^th|[-_]TH\b/.test(locale) ? "th" : "en");

function systemLocale(): string {
  if (process.platform === "darwin") {
    const r = Bun.spawnSync(["defaults", "read", "-g", "AppleLocale"], { stderr: "ignore" });
    if (r.exitCode === 0) return r.stdout.toString().trim();
  }
  return process.env.LC_ALL || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale;
}

let cached: Lang | null = null;

export function lang(): Lang {
  const set = process.env.TWIN_LANG;
  if (set === "th" || set === "en") return set;
  cached ??= localeLang(systemLocale());
  return cached;
}

export const tr = (th: string, en: string) => (lang() === "th" ? th : en);
