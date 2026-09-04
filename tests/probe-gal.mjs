import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = spawn(process.execPath, ["scripts/serve.js", "8133"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 572 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://localhost:8133/?demo=1");
await page.waitForFunction(() => window.__app && window.__app.galaxy && window.__app.galaxy.ready, { timeout: 30000 });
for (let i = 0; i < 17; i++) {
  const d = await page.evaluate(() => ({ t: window.__app.demoT().toFixed(1), g: window.__app.lastGesture, st: window.__app.galaxy.state, sel: window.__app.galaxy.selected }));
  console.log(JSON.stringify(d));
  await page.waitForTimeout(1000);
}
await browser.close(); server.kill();
