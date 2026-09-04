// ============================================================
// tests/check.mjs —— 自动化验收测试（用 Edge 无头浏览器跑）
// 覆盖：页面无报错 / 绘制闭环 / 手势防抖 / 错误恢复 / 响应式
// 运行：npm test
// ============================================================

import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name} ${extra}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const server = spawn(process.execPath, ["scripts/serve.js", String(PORT)], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--disable-gpu-sandbox"],
});

const errors = [];
const track = (page) => page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
}).on("pageerror", (e) => errors.push(String(e)));

try {
  // ---- 1. 纯画布预览模式：页面可加载、无脚本报错 ----
  console.log("\n[1] 画布预览模式 (?paper=1)");
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    track(page);
    await page.goto(`${BASE}/?paper=1`);
    await page.waitForTimeout(1500);
    ok("页面加载无报错", errors.length === 0, errors.slice(0, 2).join(" | "));
    const hintVisible = await page.locator("#hint").isVisible();
    ok("首屏提示可见", hintVisible);
    const chip = await page.textContent("#statusChip");
    ok("状态灯显示预览模式", chip.includes("预览"));
    await page.screenshot({ path: path.join(root, "assets/screenshots/paper-initial.png") });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("桌面宽度无横向溢出", overflow <= 0, `overflow=${overflow}px`);
    await page.close();
  }

  // ---- 2. 粒子模式（默认）：手势驱动粒子效果 ----
  console.log("\n[2] 粒子模式 (?demo=1)");
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    track(page);
    await page.goto(`${BASE}/?demo=1`);
    await page.waitForFunction(() => window.__app && window.__app.particles() > 80, { timeout: 15000 });
    ok("粒子闭环：指尖粒子流持续产生", true);
    await page.waitForFunction(() => window.__app.lastGesture === "Closed_Fist", { timeout: 12000 });
    ok("握拳触发能量爆发", true);
    await page.waitForFunction(() => window.__app.lastGesture === "Thumb_Up", { timeout: 20000 });
    await page.waitForTimeout(2600);
    const c = await page.evaluate(() => window.__app.particles());
    ok("点赞清空：粒子迅速消散", c < 60, `剩余 ${c}`);
    await page.close();
  }

  // ---- 2b. 笔迹模式（?mode=ink）：原有笔画闭环 ----
  console.log("\n[2b] 笔迹模式 (?mode=ink&demo=1)");
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    track(page);
    await page.goto(`${BASE}/?mode=ink&demo=1`);
    await page.waitForFunction(() => window.__app && window.__app.strokes() > 0, { timeout: 15000 });
    const s1 = await page.evaluate(() => window.__app.strokes());
    // 等待第二笔（红心）完成后验证笔画持续产生
    await page.waitForFunction(() => window.__app.strokes() >= 2, { timeout: 12000 });
    const s2 = await page.evaluate(() => window.__app.strokes());
    ok("绘制闭环：笔画持续产生", s2 > s1, `${s1} -> ${s2} 笔`);
    // 等待到构造线开启（食指 4.4s）
    await page.waitForTimeout(3200);
    const constrOn = await page.evaluate(() => window.__app.pad.construction);
    ok("食指手势触发构造线开启", constrOn === true);
    await page.screenshot({ path: path.join(root, "assets/screenshots/demo-construction.png") });
    await page.close();
  }

  // ---- 3. 摄像头异常路径：无摄像头/拒绝权限 -> 友好错误提示，不崩溃 ----
  console.log("\n[3] 摄像头异常路径");
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 700 },
      permissions: [],
    });
    const page = await ctx.newPage();
    track(page);
    await page.goto(BASE); // 无 demo 参数 -> 自动尝试摄像头
    await page.waitForSelector("#errorPanel:not(.hidden)", { timeout: 20000 });
    const title = await page.textContent(".error-title");
    ok("错误面板弹出且有标题", title.length > 0, title);
    const hasRetry = await page.locator(".error-actions button", { hasText: "重试" }).count();
    const hasDemo = await page.locator(".error-actions button", { hasText: "演示" }).count();
    ok("提供「重试摄像头」「演示模式」两个出口", hasRetry > 0 && hasDemo > 0);
    await page.screenshot({ path: path.join(root, "assets/screenshots/error-camera.png") });
    // 恢复路径：点「进入演示模式」应能正常启动
    await page.locator(".error-actions button", { hasText: "演示" }).click();
    await page.waitForFunction(() => window.__app && window.__app.mode === "demo", { timeout: 10000 });
    const badgeVisible = await page.locator("#demoBadge").isVisible();
    ok("错误后可切换到演示模式恢复", badgeVisible);
    await ctx.close();
  }

  // ---- 4. 响应式：窄屏不溢出 ----
  console.log("\n[4] 窄屏响应式 (400px)");
  {
    const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
    track(page);
    await page.goto(`${BASE}/?paper=1`);
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("窄屏无横向溢出", overflow <= 0, `overflow=${overflow}px`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
