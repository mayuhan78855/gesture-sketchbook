// ============================================================
// sw.js —— 手势草稿本 Service Worker
// 作用：把 vendor/ 下的大文件（识别模型 8MB、wasm 9MB、Three.js 1.2MB）
//       永久缓存在浏览器 Cache API 里——首次打开下载一次，之后秒开。
// 注意：更新 vendor 内容时把 CACHE 版本号 +1（如 gs-vendor-v2）才会重新缓存。
// ============================================================

const CACHE = "gs-vendor-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    clients.claim().then(() =>
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
    )
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // 只缓存 vendor/ 大文件；页面与小型资源直接走网络，避免更新被缓存卡住
  if (!url.pathname.includes("/vendor/")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) cache.put(e.request, res.clone());
    return res;
  })());
});
