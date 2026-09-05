// ============================================================
// scripts/build-standalone.mjs —— 生成单文件独立页
// 把 css/js 全部内联进 flower/index.html 与 galaxy/index.html，
// 使两个独立页成为"双击即玩"的自包含文件（模型仍从线上/CDN 加载）。
// 运行：node scripts/build-standalone.mjs
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

// 按依赖顺序拼接模块（app.js 必须最后）；galaxy.js 的工具函数已在源文件里改名避免与 space3d.js 冲突
const modules = [
  "js/config.js",
  "js/effects.js",
  "js/sketch.js",
  "js/particles.js",
  "js/demo.js",
  "js/space3d.js",
  "js/galaxy.js",
  "js/gestures.js",
  "js/app.js",
];

let js = modules.map((m) => `/* ==== ${m} ==== */\n` + read(m)).join("\n");

// 去掉静态 import 与 export 关键字（内联后同一作用域）
js = js.replace(/^import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+["'][^"']+["'];?\s*$/gm, "");
js = js.replace(/^export\s+(?=(const|class|function|let|var))/gm, "");

// 动态 import 改为内联作用域引用
js = js.replace(/import\("\.\/demo\.js"\)\.then\(\(\{ DemoHand \}\) => \{/, "Promise.resolve({ DemoHand }).then(({ DemoHand }) => {");
js = js.replace(/const \{ Space3D \} = await import\("\.\/space3d\.js"\);/, "/* Space3D 已内联 */");
js = js.replace(/const \{ Galaxy3D \} = await import\("\.\/galaxy\.js"\);/, "/* Galaxy3D 已内联 */");

const css = read("css/style.css");

function build(pagePath, outPath) {
  let html = read(pagePath);
  html = html.replace('<link rel="stylesheet" href="../css/style.css">', `<style>\n${css}\n</style>`);
  html = html.replace('<script type="module" src="../js/app.js"></script>', `<script type="module">\n${js}\n</script>`);
  writeFileSync(path.join(root, outPath), html);
  console.log(`built ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);
}

build("flower/index.html", "flower/index.html");
build("galaxy/index.html", "galaxy/index.html");
