// ============================================================
// scripts/build-standalone.mjs —— 生成单文件独立页
// 读取 flower/index.template.html 与 galaxy/index.template.html，
// 将 css 与全部 js 内联，输出 flower/index.html 与 galaxy/index.html。
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

// 自检：space3d 的 loadTHREE 定义+调用应保留（2 处），不得出现重复定义
const bare = (js.match(/loadTHREE(?!Galaxy)/g) || []).length;
if (bare !== 2) throw new Error(`standalone 构建自检失败：裸 loadTHREE 应为 2，实际 ${bare}`);

const css = read("css/style.css");

function build(pageDir) {
  let html = read(`${pageDir}/index.template.html`);
  html = html.replace("<!-- STYLESHEET -->", `<style>\n${css}\n</style>`);
  html = html.replace("<!-- APPJS -->", `<script type="module">\n${js}\n</script>`);
  const out = path.join(root, pageDir, "index.html");
  writeFileSync(out, html);
  console.log(`built ${pageDir}/index.html (${(html.length / 1024).toFixed(0)} KB)`);
}

build("flower");
build("galaxy");
