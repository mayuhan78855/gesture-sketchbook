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
  console.log("\n[1] 画布预览模式 (?mode=particles&paper=1)");
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    track(page);
    await page.goto(`${BASE}/?mode=particles&paper=1`);
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

  // ---- 2. 粒子模式：手势驱动粒子效果 ----
  console.log("\n[2] 粒子模式 (?mode=particles&demo=1)");
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    track(page);
    await page.goto(`${BASE}/?mode=particles&demo=1`);
    await page.waitForFunction(() => window.__app && window.__app.particles() > 80, { timeout: 15000 });
    ok("粒子闭环：指尖粒子流持续产生", true);
    await page.waitForFunction(() => window.__app.lastGesture === "Closed_Fist", { timeout: 12000 });
    ok("握拳触发能量爆发", true);
    await page.waitForFunction(() => window.__app.lastGesture === "Thumb_Index", { timeout: 20000 });
    await page.waitForTimeout(3200);
    const c1 = await page.evaluate(() => window.__app.particles());
    ok("捏合聚合：大量粒子聚成花", c1 > 700, `${c1} 颗`);
    await page.waitForFunction(() => window.__app.lastGesture === "None", { timeout: 15000 });
    await page.waitForTimeout(3000);
    const c2 = await page.evaluate(() => window.__app.particles());
    ok("松开消散：粒子快速减少", c2 < c1 * 0.35, `${c1} -> ${c2}`);
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

  // ---- 2c. 3D 星环模式：Three.js 粒子云 + 手势变形 ----
  console.log("\n[2c] 3D 星环模式 (?mode=space3d&demo=1)");
  {
    const page = await browser.newPage({ viewport: { width: 900, height: 572 } });
    track(page);
    await page.goto(`${BASE}/?mode=space3d&demo=1`);
    let ready = false;
    for (let attempt = 0; attempt < 2 && !ready; attempt++) {
      try {
        await page.waitForFunction(() => window.__app && window.__app.space && window.__app.space.ready && window.__app.space.count > 10000, { timeout: 30000 });
        ready = true;
      } catch (e) {
        const diag = await page.evaluate(() => ({ rm: window.__app?.renderMode, ready: window.__app?.space?.ready, chip: document.querySelector("#statusChip")?.textContent })).catch(() => "eval-fail");
        console.log(`  ⚠ 第 ${attempt + 1} 次等待超时，页面状态:`, JSON.stringify(diag), "consoleErrors:", errors.slice(0, 3));
        errors.length = 0;
        await page.reload();
      }
    }
    ok("3D 星环：粒子云就位", ready);
    await page.waitForFunction(() => window.__app.lastGesture === "Thumb_Index", { timeout: 20000 });
    await page.waitForTimeout(2000);
    const morph = await page.evaluate(() => window.__app.space.morph);
    ok("捏合聚合成星球", morph === "sphere", morph);
    await page.screenshot({ path: path.join(root, "assets/screenshots/demo-space-sphere.png") });
    await page.waitForFunction(() => window.__app.lastGesture === "None", { timeout: 15000 });
    await page.waitForTimeout(1200);
    const morph2 = await page.evaluate(() => window.__app.space.morph);
    ok("松开恢复星环", morph2 === "ring", morph2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("桌面无横向溢出", overflow <= 0, `overflow=${overflow}px`);
    await page.close();
  }

  // ---- 2d. 银河星旅模式（默认）：七大行星 + 跃迁 ----
  console.log("\n[2d] 银河星旅模式 (?demo=1)");
  {
    const page = await browser.newPage({ viewport: { width: 900, height: 572 } });
    track(page);
    await page.goto(`${BASE}/?demo=1`);
    await page.waitForFunction(() => window.__app && window.__app.galaxy && window.__app.galaxy.ready && window.__app.galaxy.count > 8000, { timeout: 30000 });
    ok("银河星旅：星场就位", true);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(root, "assets/screenshots/demo-galaxy-overview.png") });
    await page.waitForFunction(() => window.__app.lastGesture === "Thumb_Index", { timeout: 20000 });
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => window.__app.galaxy.state);
    ok("捏合跃迁：抵达行星", st === "arrived", st);
    await page.screenshot({ path: path.join(root, "assets/screenshots/demo-galaxy-arrive.png") });
    await page.waitForFunction(() => window.__app.lastGesture === "None", { timeout: 15000 });
    await page.waitForTimeout(2600);
    const st2 = await page.evaluate(() => window.__app.galaxy.state);
    ok("返回银河全景", st2 === "overview", st2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("桌面无横向溢出", overflow <= 0, `overflow=${overflow}px`);
    await page.close();
  }

  // ---- 2e. 独立页面：/flower/ 与 /galaxy/ 强制模式生效 ----
  console.log("\n[2e] 独立页面 (/flower/ /galaxy/)");
  {
    for (const [sub, expectMode] of [["flower/", "particles"], ["galaxy/", "galaxy"]]) {
      const page = await browser.newPage({ viewport: { width: 900, height: 572 } });
      track(page);
      await page.goto(`${BASE}/${sub}?demo=1`);
      await page.waitForFunction((m) => window.__app && window.__app.renderMode === m && window.__app.particles() > 80, expectMode, { timeout: 30000 });
      ok(`${sub} 强制模式 ${expectMode} 生效`, true);
      const modeHidden = await page.evaluate(() => { const r = document.querySelector(".mode-row"); return !r || getComputedStyle(r).display === "none"; });
      ok(`${sub} 模式切换按钮已隐藏`, modeHidden);
      await page.close();
    }
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
    await page.goto(`${BASE}/?mode=particles&paper=1`);
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
