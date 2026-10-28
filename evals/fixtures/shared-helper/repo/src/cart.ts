import { formatPrice } from "./money";
export type Line = { name: string; cents: number; qty: number };
export const cartTotal = (lines: Line[]) => formatPrice(lines.reduce((s, l) => s + l.cents * l.qty, 0));
