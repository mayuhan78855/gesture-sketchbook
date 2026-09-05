import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = spawn(process.execPath, ["scripts/serve.js", "8144"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:8144/", { waitUntil: "load" });
const files = ["js/app.js","js/config.js","js/gestures.js","js/sketch.js","js/particles.js","js/effects.js","js/demo.js","js/space3d.js","js/galaxy.js","vendor/wasm/vision_wasm_internal.js"];
for (const f of files) {
  const res = await page.evaluate(async (u) => {
    try { await import(u); return "ok"; } catch (e) { return "FAIL: " + String(e && e.message || e).slice(0, 160); }
  }, "http://localhost:8144/" + f);
  console.log(`${f}: ${res}`);
}
await browser.close(); server.kill();
