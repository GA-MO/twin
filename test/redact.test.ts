import { expect, test } from "bun:test";
import { redact } from "../lib/transcript.ts";

const SECRETS = [
  ["DATABASE_PASSWORD=hunter2hunter2", "hunter2hunter2"],
  ["OPENAI_API_KEY=abc123def456", "abc123def456"],
  ["AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "wJalrXUtnFEMI"],
  ["postgres://admin:S3cretPass!@db.internal:5432/shop", "S3cretPass"],
  ["Authorization: Bearer eyJhbGciOiJIUzI1NiJ9xyz", "eyJhbGciOiJIUzI1NiJ9xyz"],
  ["รหัสผ่าน: hunter2", "hunter2"],
  ["รหัส wifi คือ Pa55word99", "Pa55word99"],
  ["-----BEGIN OPENSSH PRIVATE KEY----- b3BlbnNzaC1rZXktdjEAAAAA QyNTUxOQAAACBmb3ZlcmZsb3c -----END OPENSSH PRIVATE KEY-----", "QyNTUxOQ"],
  ["token: ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abcdefghijklmnopqrstuvwxyz"],
] as const;

test("pasted secrets of common shapes are hidden before history is kept", () => {
  for (const [text, secret] of SECRETS) expect(redact(text)).not.toContain(secret);
});

test("ordinary sentences about passwords and keys stay readable", () => {
  expect(redact("อย่าลืมเปลี่ยนรหัสผ่านทุก 90 วัน")).toBe("อย่าลืมเปลี่ยนรหัสผ่านทุก 90 วัน");
  for (const text of [
    "the api key rotation policy is monthly",
    "รหัสสินค้า: A123",
    "รหัสลูกค้า = C-001",
    "รหัสไปรษณีย์คือ 10110",
    "เข้ารหัสด้วย AES คือ ใช้ key ยาว",
    "ถอดรหัส base64 คือ อะไร",
    "token: ช่วยอธิบาย JWT",
    "Bearer of bad news",
    "pwd: /Users/me/shop-api",
    "https://example.com:8080/a@b",
    "max_tokens: 4096",
  ])
    expect(redact(text)).toBe(text);
});
