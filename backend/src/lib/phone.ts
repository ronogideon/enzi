// Normalise Kenyan numbers to 2547XXXXXXXX / 2541XXXXXXXX.
export function normalizePhone(input: string): string {
  let p = input.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}
export function isValidKePhone(input: string): boolean {
  const p = normalizePhone(input);
  return /^254(7|1)\d{8}$/.test(p);
}
