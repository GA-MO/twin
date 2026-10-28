export function splitBill(totalCents: number, people: number): number[] {
  const each = Math.round(totalCents / people);
  return Array.from({ length: people }, () => each);
}
