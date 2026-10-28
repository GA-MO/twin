import { total } from "./pricing";
export type CheckoutReq = { subtotal: number };
export type CheckoutRes = { ok: true; total: number } | { ok: false; error: string };
export function checkout(req: CheckoutReq): CheckoutRes {
  return { ok: true, total: total({ subtotal: req.subtotal }) };
}
