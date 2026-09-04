// ============================================================
// tests/verify-online.mjs —— 部署后的线上端到端验证
// 用无头浏览器打开 GitHub Pages 线上地址，验证：
//   页面加载 -> 摄像头异常提示 -> 一键切换演示模式 -> 绘制闭环
// 运行：npm run verify-online
// ============================================================

import { chromium } from "playwright-core";

const URL = "https://mayuhan78855.github.io/gesture-sketchbook/";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

let step = 0;
const ok = (name, cond) => {
  step++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}`);
  if (!cond) process.exitCode = 1;
};

await page.goto(URL, { waitUntil: "load", timeout: 60000 });
ok("线上页面加载成功", true);

// 无头环境没有摄像头 => 应弹出友好错误面板而不是崩溃
await page.waitForSelector("#errorPanel:not(.hidden)", { timeout: 30000 });
ok("摄像头异常时显示友好提示", true);

// 一键切到演示模式，验证绘制闭环在线上环境正常
await page.locator(".error-actions button", { hasText: "演示" }).click();
await page.waitForFunction(() => window.__app && window.__app.strokes() > 0, { timeout: 20000 });
ok("演示模式绘制闭环正常（笔画已产生）", true);
ok("无脚本运行错误", errors.length === 0);

console.log(`\n===== 线上验证：${step} 项检查完成 =====`);
await browser.close();
