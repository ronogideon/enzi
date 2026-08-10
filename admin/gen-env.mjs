// Writes runtime config into dist/env.js at container start so one build can
// target any environment (mirrors the Kodee pattern). Set API_URL in Railway.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

const apiUrl = process.env.API_URL || process.env.VITE_API_URL || "";
const body = `window.__ENV__ = ${JSON.stringify({ API_URL: apiUrl })};\n`;

if (!existsSync("dist")) mkdirSync("dist");
writeFileSync("dist/env.js", body);
console.log("[gen-env] wrote dist/env.js API_URL=" + (apiUrl || "(empty)"));
