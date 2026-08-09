// Prices arrive from the API as integer cents (KES * 100).
export function formatKes(cents: number): string {
  return `Ksh ${(cents / 100).toLocaleString("en-KE", {
    maximumFractionDigits: 0,
  })}`;
}
