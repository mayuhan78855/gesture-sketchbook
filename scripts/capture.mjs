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
const DURATION_MS = 15500;   // 演示时间轴 15.5s
const FPS = 10;
const FRAME_MS = 1000 / FPS;
const OUT_W = 792, OUT_H = 504; // 输出 GIF 尺寸（源视口 1100x700）

const server = spawn(process.execPath, ["scripts/serve.js", String(PORT)], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--disable-gpu-sandbox"],
});

const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await page.goto(`${BASE}/?demo=1`);
await page.waitForFunction(() => window.__app && window.__app.strokes() > 0, { timeout: 20000 });

console.log("开始录制…");
const frames = [];
const t0 = Date.now();
let shotIndex = 0;
const shotAt = [
  { t: 2200, name: "demo-draw-star.png" },      // 画五角星（黑）
  { t: 6300, name: "demo-heart-construction.png" }, // 构造线 + 红心
  { t: 11000, name: "demo-wave-bold.png" },     // 粗笔波浪线
  { t: 13600, name: "demo-after-clear.png" },   // 清空后
];

while (Date.now() - t0 < DURATION_MS) {
  const elapsed = Date.now() - t0;
  frames.push(await page.screenshot({ clip: { x: 0, y: 0, width: 1100, height: 700 } }));
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
  const rgba = downscale(frames[i]);
  if (!palette) palette = quantize(rgba, 128);
  const index = applyPalette(rgba, palette);
  gif.writeFrame(index, OUT_W, OUT_H, { palette, delay: Math.round(FRAME_MS * 10) });
}
gif.finish();
const gifPath = path.join(root, "assets", "demo.gif");
fs.writeFileSync(gifPath, gif.bytes());
console.log(`GIF 完成：${gifPath} (${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB, ${total} 帧, ${(total * FRAME_MS / 1000).toFixed(1)}s)`);

await browser.close();
server.kill();
