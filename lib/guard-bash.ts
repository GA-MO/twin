type Word = { text: string; glob: boolean; vars: string[] };

const DELETERS = new Set(["rm", "rmdir", "trash", "unlink"]);
const PREFIXES = new Set(["sudo", "command", "nohup", "time", "exec", "env", "nice", "do", "then", "else", "elif", "!", "{"]);
const SHELLS = new Set(["bash", "sh", "zsh"]);
const FIND_PATTERN = new Set(["-name", "-iname", "-path", "-ipath", "-regex", "-iregex"]);
const ENV_VARS = new Set(["HOME", "TMPDIR", "USER"]);
const SUBST = "$(…)";
const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/;
const ASSIGN = /^([A-Za-z_]\w*)=([\s\S]*)$/;

const SENDS = /\bbaton\s+run\b|\bcurl\b/;
const MR_MERGE = /merge_requests\/[^\s"'`/]+\/merge\b/g;
const KEEPS_SOURCE = /should_remove_source_branch["']?\s*[:=]/g;
const MR_BODY = /\{[^{}]*\bsource_branch["']?\s*[:=][^{}]*\}/g;
const LONG_LIVED_SOURCE = /\bsource_branch["']?\s*[:=]\s*["'](?:develop|uat|sit|main)["']/;
const REMOVES_SOURCE = /(?<!should_)remove_source_branch["']?\s*[:=]\s*true/;

export const BROWSER_TOOLS = /^mcp__(Claude_Browser|claude-in-chrome|plugin_playwright_playwright)__/;

export const BROWSER_REASON =
  "profile ใช้ Baton เป็น browser: เปิดและตรวจหน้าเว็บด้วย Baton (skill baton) ซึ่งเป็น Chrome ที่ login อยู่ ไม่ใช้ browser ของ Claude";

function withoutHeredocs(command: string): string {
  const out: string[] = [];
  let end: { tag: string; dash: boolean } | null = null;
  for (const line of command.split("\n")) {
    if (end) {
      if ((end.dash ? line.trim() : line) === end.tag) end = null;
      continue;
    }
    out.push(line);
    const m = HEREDOC.exec(line);
    if (m?.[2]) end = { tag: m[2], dash: line.includes("<<-") };
  }
  return out.join("\n");
}

function readVar(s: string, i: number): { name: string; next: number } {
  if (s[i] === "(") {
    let depth = 0;
    let j = i;
    for (; j < s.length; j++) {
      if (s[j] === "(") depth++;
      if (s[j] === ")" && --depth === 0) break;
    }
    return { name: SUBST, next: j + 1 };
  }
  const m = /^\{?([A-Za-z_]\w*|[0-9@*#?])\}?/.exec(s.slice(i));
  return m ? { name: m[1] ?? "", next: i + m[0].length } : { name: "", next: i };
}

function commands(command: string): Word[][] {
  const s = withoutHeredocs(command);
  const all: Word[][] = [];
  let words: Word[] = [];
  let word: Word | null = null;
  const end = () => {
    if (word) words.push(word);
    word = null;
  };
  const split = () => {
    end();
    if (words.length) all.push(words);
    words = [];
  };
  const cur = () => (word ??= { text: "", glob: false, vars: [] });
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i] ?? "";
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur().text += c;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur().text += s[++i];
      continue;
    }
    if (c === "$" || c === "`") {
      if (c === "`") {
        const close = s.indexOf("`", i + 1);
        cur().vars.push(SUBST);
        i = close < 0 ? s.length : close;
        continue;
      }
      const v = readVar(s, i + 1);
      if (v.name) {
        cur().vars.push(v.name);
        cur().text += `\${${v.name}}`;
        i = v.next - 1;
        continue;
      }
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else cur().text += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur();
      continue;
    }
    if (c === "#" && !word) {
      const nl = s.indexOf("\n", i);
      i = nl < 0 ? s.length : nl - 1;
      continue;
    }
    if (/[;&|\n()]/.test(c)) split();
    else if (/\s/.test(c)) end();
    else {
      const w = cur();
      if ("*?[".includes(c) || (c === "{" && /^\{[^}\s]*,[^}\s]*\}/.test(s.slice(i)))) w.glob = true;
      w.text += c;
    }
  }
  split();
  return all;
}

const unknownVar = (w: Word, known: Map<string, string>) => w.vars.find((v) => !known.has(v) && !ENV_VARS.has(v));

function deletion(cmd: Word[], known: Map<string, string>): string | null {
  const w = [...cmd];
  let piped = false;
  while (w[0]) {
    const head = w[0];
    const m = ASSIGN.exec(head.text);
    if (m?.[1]) {
      if (head.glob || unknownVar(head, known) || head.vars.includes(SUBST)) known.delete(m[1]);
      else known.set(m[1], m[2] ?? "");
      w.shift();
    } else if (head.text === "export" || PREFIXES.has(head.text)) w.shift();
    else if (head.text === "xargs") {
      piped = true;
      w.shift();
    } else if (head.text === "timeout") w.splice(0, 2);
    else break;
  }
  const name = (w[0]?.text ?? "").replace(/^.*\//, "");
  const args = w.slice(1);
  if (SHELLS.has(name)) {
    const script = args[args.findIndex((a) => a.text === "-c") + 1];
    return script && args.some((a) => a.text === "-c") ? denialOf(script.text, known) : null;
  }
  if (name === "find" && args.some((a) => a.text === "-delete" || (a.text === "-exec" && args.some((b) => DELETERS.has(b.text))))) {
    const i = args.findIndex((a) => FIND_PATTERN.has(a.text));
    return i < 0 ? null : `find ${args[i]?.text} ${args[i + 1]?.text ?? ""}`;
  }
  if (!DELETERS.has(name)) return null;
  if (piped) return `xargs ${name}`;
  const bad = args.find((a) => !a.text.startsWith("-") && (a.glob || unknownVar(a, known)));
  return bad ? bad.text : null;
}

function denialOf(command: string, known = new Map<string, string>()): string | null {
  for (const cmd of commands(command)) {
    const target = deletion(cmd, known);
    if (target) return target;
  }
  return null;
}

const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

export function bashDenial(command: string): string | null {
  const target = denialOf(command);
  if (target)
    return `ลบด้วย glob หรือตัวแปรที่ไม่รู้ค่าไม่ได้ (${target}): ลบตาม path ที่จดไว้ตอนสร้าง เขียนเต็มทีละ path และ ls ดูก่อนลบ เพราะ glob เคยลบ transcript ของ run อื่นที่กู้ไม่ได้`;
  if (!SENDS.test(command)) return null;
  if ([...command.matchAll(MR_BODY)].some((m) => LONG_LIVED_SOURCE.test(m[0]) && REMOVES_SOURCE.test(m[0])))
    return "MR ที่ source เป็น develop, uat, sit หรือ main ต้องส่ง remove_source_branch: false ไม่ใช่ true เพราะ GitLab จะลบ branch นั้นหลัง merge";
  if (count(command, MR_MERGE) > count(command, KEEPS_SOURCE))
    return "merge MR ทุกครั้งต้องส่ง should_remove_source_branch (นับต่อการเรียก merge แต่ละครั้ง): false เมื่อ source เป็น develop, uat, sit หรือ main เพราะ project ที่ตั้งลบ source หลัง merge เคยลบ develop ทิ้ง";
  return null;
}
