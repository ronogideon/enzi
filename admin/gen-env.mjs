/**
 * Writes runtime config into dist/env.js at container start, so one build can
 * target any environment (same pattern as Kodee). Set API_URL in Railway to
 * the backend service's public URL.
 *
 * The URL is normalised here rather than in the browser: a missing or extra
 * "/api" is the single most common cause of an admin that builds fine and then
 * can't talk to anything.
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

const raw = (process.env.API_URL || process.env.VITE_API_URL || "").trim();

function normalize(url) {
  if (!url) return "";
  let u = url.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (!/\/api$/i.test(u)) u = `${u}/api`;
  return u;
}

const apiUrl = normalize(raw);
const body = `window.__ENV__ = ${JSON.stringify({ API_URL: apiUrl })};\n`;

if (!existsSync("dist")) mkdirSync("dist");
writeFileSync("dist/env.js", body);

if (apiUrl) {
  console.log(`[gen-env] API_URL = ${apiUrl}`);
  if (apiUrl !== raw && raw) console.log(`[gen-env] (normalised from "${raw}")`);
} else {
  console.warn("");
  console.warn("  ****************************************************************");
  console.warn("  [gen-env] API_URL IS NOT SET.");
  console.warn("");
  console.warn("  The admin dashboard has no backend to talk to and every request");
  console.warn("  will fail with 'Failed to fetch'.");
  console.warn("");
  console.warn("  Fix: Railway -> admin service -> Variables -> add");
  console.warn("       API_URL = https://<your-backend>.up.railway.app");
  console.warn("  ****************************************************************");
  console.warn("");
}
