// 本地静态服务器：node scripts/serve.js [端口]
// 用途：摄像头权限只允许在 https 或 localhost 下使用，所以必须用本地服务器打开页面，不能直接双击 index.html。
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2] || 8000);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    const file = path.join(root, p);
    let target = file;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) target = path.join(file, "index.html"); // 子目录首页（/flower/ /galaxy/）
    if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(target).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(target).pipe(res);
  })
  .listen(port, () => {
    console.log(`手势草稿本已启动：http://localhost:${port}`);
    console.log("按 Ctrl+C 停止。");
  });
