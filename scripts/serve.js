// ============================================================
// serve.js —— 本地静态服务器
// 安全与规范：只监听 127.0.0.1（同 Wi-Fi 设备无法访问）；
// 发送 Content-Length（模型加载进度条依赖它）；
// 严格的路径穿越防护；流式读取带错误处理。
// 用法：node scripts/serve.js [端口，默认 8000]
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2] || 8000);
const HOST = "127.0.0.1"; // 只允许本机访问

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".data": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    // 严格路径穿越防护：解析后必须仍在仓库根目录内
    let target = path.resolve(root, "." + p);
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end("403 Forbidden");
      return;
    }
    if (!fs.existsSync(target)) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    if (fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
    if (!fs.existsSync(target)) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const type = mime[ext] || "application/octet-stream";
    const size = fs.statSync(target).size;
    // 大文件（模型/引擎）缓存 1 小时；代码与页面不缓存，保证更新即时生效
    const cache = ext === ".task" || ext === ".wasm" ? "public, max-age=3600" : "no-cache";
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Cache-Control": cache });
    const stream = fs.createReadStream(target);
    stream.on("error", () => { try { res.destroy(); } catch (e) {} });
    stream.pipe(res);
  } catch (e) {
    try { res.writeHead(500); res.end("500 Internal Error"); } catch (e2) {}
  }
});

server.on("error", (e) => {
  console.error("服务器出错：" + e.message + "（端口被占用就换一个：node scripts/serve.js 8080）");
});

server.listen(port, HOST, () => {
  console.log(`手势草稿本已启动：http://localhost:${port}`);
  console.log("（仅本机可访问；按 Ctrl+C 停止）");
});
