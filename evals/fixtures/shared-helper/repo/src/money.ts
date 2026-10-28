export function formatPrice(cents: number, currency = "USD"): string {
  const value = cents / 10;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}
