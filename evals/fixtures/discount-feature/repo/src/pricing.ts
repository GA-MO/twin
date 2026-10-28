export type Order = { subtotal: number };
export const total = (o: Order) => o.subtotal;
