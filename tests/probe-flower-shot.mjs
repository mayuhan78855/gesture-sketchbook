import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = spawn(process.execPath, ["scripts/serve.js", "8137"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 572 } });
await page.goto("http://localhost:8137/flower/?demo=1");
// 等花开全盛：等一段较长的稳定绽放期（demo 第二段 palm 5.0-8.2s 之后）
await page.waitForFunction(() => window.__app && window.__app.demoT && window.__app.demoT() >= 7.6, { timeout: 30000 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(root, "assets", "screenshots", "flower-page-bloom.png") });
console.log("saved");
await browser.close(); server.kill();
