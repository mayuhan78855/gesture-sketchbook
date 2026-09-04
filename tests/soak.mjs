// ============================================================
// tests/soak.mjs —— 5 分钟稳定性测试（演示模式驱动同一渲染管线）
// 每 30 秒采样一次：笔画数 / 单帧耗时 / 报错
// 运行：node tests/soak.mjs
// ============================================================

import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8125;
const BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ["scripts/serve.js", String(PORT)], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/?demo=1`);
await page.waitForFunction(() => window.__app && window.__app.particles() > 80, { timeout: 15000 });

console.log("5 分钟稳定性测试开始（30s × 10 次采样）…");
const samples = [];
for (let i = 1; i <= 10; i++) {
  await page.waitForTimeout(30000);
  const d = await page.evaluate(() => ({
    particles: window.__app.particles(),
    latency: window.__app.latency(),
    mode: window.__app.mode,
  }));
  samples.push({ t: i * 30, ...d });
  console.log(`  +${i * 30}s  particles=${d.particles}  latency=${d.latency.toFixed(1)}ms  mode=${d.mode}  errors=${errors.length}`);
}
const crashed = errors.length > 0;
const alive = await page.evaluate(() => window.__app.mode === "demo" || window.__app.mode === "camera" || window.__app.mode === "paper");
console.log(`\n===== 结果：${crashed ? "❌ 有报错" : "✅ 无报错"} | 页面存活: ${alive} | 采样 ${samples.length} 次 =====`);

await browser.close();
server.kill();
process.exit(crashed || !alive ? 1 : 0);
