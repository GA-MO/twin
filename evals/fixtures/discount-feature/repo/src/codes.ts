export type Code = { code: string; kind: "percent" | "flat"; value: number; expires: string };
export const CODES: Code[] = [
  { code: "SAVE10", kind: "percent", value: 10, expires: "2099-01-01" },
  { code: "FLAT500", kind: "flat", value: 500, expires: "2099-01-01" },
  { code: "OLD20", kind: "percent", value: 20, expires: "2020-01-01" },
];
