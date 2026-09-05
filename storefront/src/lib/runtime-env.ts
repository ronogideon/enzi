/**
 * Runtime configuration.
 *
 * The storefront used to read `NEXT_PUBLIC_API_URL`, which Next.js compiles
 * into the JavaScript bundle at BUILD time. That meant changing the variable in
 * Railway did nothing until a full rebuild, and a wrong value stayed wrong no
 * matter how many times the service was restarted.
 *
 * Now the value is read from `process.env` on the server at request time and
 * handed to the browser through a small `window.__ENV__` script in the layout.
 * Editing the variable and restarting is enough — same behaviour as the admin's
 * gen-env.mjs. `NEXT_PUBLIC_API_URL` still works as a fallback so existing
 * setups and local development keep running.
 */

export interface RuntimeEnv {
  API_URL: string;
  WHATSAPP: string;
}

/**
 * Turn whatever someone typed into a usable absolute API base.
 *
 * The scheme handling matters: a bare host like "api.enzipackaging.com" is not
 * an absolute URL, so `fetch()` treats it as a RELATIVE path and resolves it
 * against the current page — silently sending every API call back to the
 * storefront itself, which answers with an HTML 404. Railway's
 * `RAILWAY_PUBLIC_DOMAIN` variable is exactly such a bare host, so this is easy
 * to hit by accident. We add the scheme rather than letting that happen.
 */
export function normalizeApiUrl(raw: string | undefined | null): string {
  let url = (raw ?? "").trim();
  if (!url) return "";

  url = url.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(url)) {
    // Anything on localhost is plain HTTP; everything else is HTTPS.
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
    url = (isLocal ? "http://" : "https://") + url;
  }

  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}

/** Server-side resolution. Never call this from a client component. */
export function serverEnv(): RuntimeEnv {
  const raw =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return {
    API_URL: normalizeApiUrl(raw),
    WHATSAPP:
      process.env.WHATSAPP ??
      process.env.NEXT_PUBLIC_WHATSAPP ??
      "254110050620",
  };
}
