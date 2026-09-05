/**
 * Prints the resolved API address at container start, so a misconfiguration is
 * visible in the Railway deploy log instead of only surfacing as a failed
 * sign-up in someone's browser.
 *
 * Runs before `next start` and never blocks the boot — a storefront that can't
 * reach its API should still serve pages, so people can read the catalogue and
 * reach you on WhatsApp while it's being fixed.
 */
function normalize(raw) {
  let url = (raw ?? "").trim();
  if (!url) return "";
  url = url.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
    url = (isLocal ? "http://" : "https://") + url;
  }
  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}

const raw = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
const resolved = normalize(raw);

if (!raw) {
  console.warn("");
  console.warn("  ****************************************************************");
  console.warn("  [storefront] API_URL IS NOT SET.");
  console.warn("");
  console.warn("  Product listings, sign-up and checkout will all fail.");
  console.warn("");
  console.warn("  Fix: Railway -> storefront service -> Variables -> add");
  console.warn("       API_URL = https://api.enzipackaging.com");
  console.warn("  ****************************************************************");
  console.warn("");
} else {
  console.log(`[storefront] API_URL = ${resolved}`);
  if (resolved !== raw) console.log(`[storefront] (normalised from "${raw}")`);
  if (!/^https?:\/\//i.test(raw))
    console.warn(
      "[storefront] NOTE: no scheme was given, so https:// was added. " +
        "Set the full URL to avoid ambiguity."
    );

  // A quick reachability probe. Failure is reported, never fatal.
  try {
    const res = await fetch(`${resolved}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => null);
    if (body?.ok) {
      console.log(
        `[storefront] API reachable (v${body.version ?? "?"}, database: ${
          body.database ?? "?"
        })`
      );
    } else {
      console.warn(
        `[storefront] WARNING: ${resolved}/health answered ${res.status} but is not the Enzi API.`
      );
      console.warn("[storefront] Check that API_URL points at the backend service.");
    }
  } catch (e) {
    console.warn(`[storefront] WARNING: could not reach ${resolved}/health — ${e.message}`);
    console.warn("[storefront] The shop will start, but data will not load.");
  }
}
