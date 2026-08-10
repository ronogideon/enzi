export const formatKes = (cents: number) =>
  `Ksh ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
export const kesToCents = (kes: number) => Math.round(kes * 100);
export const centsToKes = (cents: number) => Math.round(cents / 100);
