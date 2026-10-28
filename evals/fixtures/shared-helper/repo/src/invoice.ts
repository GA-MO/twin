import { formatPrice } from "./money";
export const invoiceLine = (desc: string, cents: number) => `${desc} ... ${formatPrice(cents)}`;
