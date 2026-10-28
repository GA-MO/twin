import { formatPrice } from "./money";
export const receiptTotal = (cents: number, currency: string) => `TOTAL ${formatPrice(cents, currency)}`;
