// ============================================================
// scripts/capture.mjs —— 录制演示动图 GIF + 关键截图
// 说明：用 Edge 无头浏览器打开 ?demo=1，以 10fps 截 15.5 秒，
//       再用 gifenc 合成 GIF（无 ffmpeg 依赖）。
// 运行：npm run capture
// ============================================================

import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pkg from "gifenc";
const { GIFEncoder, quantize, applyPalette } = pkg;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8124;
const BASE = `http://localhost:${PORT}`;
const DURATION_MS = 16500;   // 演示时间轴 16.5s（含花开全盛与消散）
const FRAME_MS = 125;        // 目标帧间隔（截图耗时可能更长，按实际时间戳补偿）
const OUT_W = 792, OUT_H = 503; // 输出 GIF 尺寸（源视口 900x572）

const server = spawn(process.execPath, ["scripts/serve.js", String(PORT)], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--disable-gpu-sandbox"],
});

const page = await browser.newPage({ viewport: { width: 900, height: 572 } });
await page.goto(`${BASE}/?demo=1`);
await page.waitForFunction(() => window.__app && window.__app.particles() > 80, { timeout: 20000 });

console.log("开始录制…");
const frames = []; // {buf, t}
const t0 = Date.now();
const shotAt = [
  { t: 2200, name: "demo-draw-star.png" },      // 画五角星（粒子流）
  { t: 6300, name: "demo-heart-construction.png" }, // 构造线 + 红心粒子流
  { t: 13400, name: "demo-flower-bloom.png" },  // 捏合聚合的花朵全盛
  { t: 15900, name: "demo-after-clear.png" },   // 松开消散后
];

while (Date.now() - t0 < DURATION_MS) {
  const elapsed = Date.now() - t0;
  frames.push({ buf: await page.screenshot({ clip: { x: 0, y: 0, width: 900, height: 572 } }), t: Date.now() - t0 });
  const hit = shotAt.find((s) => elapsed >= s.t && !s.done);
  if (hit) {
    hit.done = true;
    await page.screenshot({ path: path.join(root, "assets/screenshots", hit.name) });
    console.log("  截图:", hit.name);
  }
  await page.waitForTimeout(FRAME_MS - (Date.now() - t0 - elapsed));
}
const total = frames.length;
console.log(`共 ${total} 帧，开始合成 GIF…`);

const downscale = (buf) => {
  const src = PNG.sync.read(buf);
  const out = new PNG({ width: OUT_W, height: OUT_H });
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const sx = Math.floor((x * src.width) / OUT_W);
      const sy = Math.floor((y * src.height) / OUT_H);
      const si = (src.width * sy + sx) << 2;
      const di = (OUT_W * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return new Uint8Array(out.data.buffer, 0, OUT_W * OUT_H * 4);
};

const gif = GIFEncoder();
let palette = null;
for (let i = 0; i < total; i++) {
  const rgba = downscale(frames[i].buf);
  if (!palette) palette = quantize(rgba, 128);
  const index = applyPalette(rgba, palette);
  // 帧延时 = 相邻两帧的真实时间差（GIF 帧延时单位是毫秒），保证 GIF 与真实时间同步
  const nextT = i + 1 < total ? frames[i + 1].t : frames[i].t + FRAME_MS;
  const delay = Math.max(40, Math.min(400, nextT - frames[i].t));
  gif.writeFrame(index, OUT_W, OUT_H, { palette, delay });
}
gif.finish();
const gifPath = path.join(root, "assets", "demo.gif");
fs.writeFileSync(gifPath, gif.bytes());
const durSec = (frames[total - 1].t - frames[0].t + FRAME_MS) / 1000;
console.log(`GIF 完成：${gifPath} (${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB, ${total} 帧, ~${durSec.toFixed(1)}s)`);

await browser.close();
server.kill();
