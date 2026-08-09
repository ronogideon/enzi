// All money stored as integer cents (KES * 100).
export const toCents = (kes: number) => Math.round(kes * 100);
export const toKes = (cents: number) => cents / 100;
export const formatKes = (cents: number) =>
  `Ksh ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
