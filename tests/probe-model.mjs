import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = spawn(process.execPath, ["scripts/serve.js", "8142"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({
  channel: "msedge", headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 572 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e.stack || e).slice(0, 500)));
page.on("console", (m) => console.log("[console." + m.type() + "]", m.text().slice(0, 250)));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 100), r.failure()?.errorText));
await page.goto("http://localhost:8142/", { waitUntil: "load" });
await page.waitForTimeout(12000);
console.log("CHIP:", await page.textContent("#statusChip"));
console.log("camStatus:", await page.textContent("#camStatus"));
await browser.close(); server.kill();
