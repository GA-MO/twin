import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_TOKENS =
  /\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{40,})\b/g;
const SECRET_ASSIGN = /(^|[^A-Za-z])([A-Za-z_]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key))(\s*[:=]\s*)[!-~]+/gi;
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s/]+@/gi;
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/g;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const THAI_PASSWORD = /(?<![ก-๛])(รหัสผ่าน|รหัส\s*(?:wi-?fi|ไวไฟ|pin|otp|atm|บัตร|เข้าเครื่อง))(\s*(?:คือ|:|=)\s*)[!-~]+/gi;

export const SKIP_PREFIX = /^<(command-|local-command|system-reminder|task-notification|bash-|user-prompt-submit-hook)/;

export const redact = (s: string) =>
  s
    .replace(PRIVATE_KEY, "[ซ่อน private key]")
    .replace(URL_CREDENTIALS, "$1[ซ่อน]@")
    .replace(BEARER, "$1[ซ่อน]")
    .replace(SECRET_ASSIGN, "$1$2$3[ซ่อน]")
    .replace(THAI_PASSWORD, "$1$2[ซ่อน]")
    .replace(SECRET_TOKENS, "[ซ่อน]");

export const exportFile = (path: string) => (existsSync(path) && statSync(path).isDirectory() ? join(path, "conversations.json") : path);
