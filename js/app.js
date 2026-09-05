// ============================================================
// app.js —— 应用入口
// 职责：连接 手势识别引擎(GestureEngine) 和 两个渲染器：
//       · 粒子模式（默认）：ParticleSystem + effects.js 效果注册表
//       · 笔迹模式（?mode=ink 或侧栏切换）：SketchPad 霓虹笔迹
// 手势→动作的翻译全部走"注册表驱动"，新增效果见 js/effects.js 文件头。
// ============================================================

import { CONFIG, GESTURE_INFO } from "./config.js";
import { GestureEngine } from "./gestures.js";
import { SketchPad } from "./sketch.js";
import { ParticleSystem } from "./particles.js";
import { EFFECTS } from "./effects.js";

const $ = (s) => document.querySelector(s);
const canvas = $("#paper");
const video = $("#cam");
// 取景框：视频真正开始播放时点亮预览（流已接入），否则保持 NO SIGNAL
video.addEventListener("playing", () => {
  document.querySelector(".view-box")?.classList.add("live");
  if (mode === "camera") camStatus.textContent = "LIVE";
});
const chip = $("#statusChip");
const hint = $("#hint");
const toastEl = $("#toast");
const demoBadge = $("#demoBadge");
const errorPanel = $("#errorPanel");
const camStatus = $("#camStatus");
const swatchesEl = $("#swatches");
const constrToggle = $("#constrToggle");
const legendEl = document.querySelector(".legend");

const pad = new SketchPad(canvas);
const ps = new ParticleSystem(canvas);

const modeParam = new URLSearchParams(location.search).get("mode");
// 页面强制模式（flower/ 与 galaxy/ 独立页用）> URL 参数 > 默认银河星旅
const VALID_MODES = ["ink", "particles", "space3d", "galaxy"];
let renderMode = window.__FORCE_MODE || modeParam || "galaxy";
if (!VALID_MODES.includes(renderMode)) renderMode = "galaxy";
let engine = null;
let demo = null;
let mode = "paper"; // 运行状态：paper | camera | demo
let lastGesture = "None";
let toastTimer = 0;
let _raf = 0;
let loopT = 0;
let frameTick = 0;
let lastHand = null;
let prevPalm = null, prevT = 0;
const vel = { x: 0, y: 0 };

// 笔迹模式图例的图标（与 effects.js 里注册表的 glyph 同一套线条风）
const GLYPHS = {
  Open_Palm: "M5 12 L5 7 M9 12 L9 5 M13 12 L13 5 M17 12 L17 7 M5 12 Q10 16 17 12 L17 10",
  Closed_Fist: "M6 9 Q7 6 12 6 Q17 6 18 9 L18 12 Q18 15 12 15 Q6 15 6 12 Z M7 10 L7 11",
  Pointing_Up: "M10 14 L10 5 M10 5 Q10 3.4 11.4 3.4 Q12.8 3.4 12.8 5 L12.8 14 Q12.8 15.5 11.4 15.5 Q10 15.5 10 14 M8 18 L14 18",
  Victory: "M8 18 L8 8 M8 8 Q8 6.5 9.3 6.5 Q10.6 6.5 10.6 8 L10.6 16 M14 18 L14 6 M14 6 Q14 4.5 15.2 4.5 Q16.4 4.5 16.4 6 L16.4 16",
  Thumb_Up: "M7 12 L7 6 M7 6 Q7 4.5 8.3 4.5 Q9.6 4.5 9.6 6 L9.6 12 M7 12 Q11 11 17 11.5 L17 14 Q17 16.5 13.5 16.5 L10 16.5",
  Thumb_Index: "M6 10 L10 14 M10 14 Q11.5 15.5 12 15.5 M12 4 L15 7 M15 7 Q16.5 8.5 16.5 9 M16.5 9 L20 13",
};

// ---------- 小工具 ----------
function setStatus(text, kind = "idle") {
  chip.textContent = text;
  chip.dataset.kind = kind;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 1800);
}

function showError(err) {
  errorPanel.innerHTML = "";
  const card = document.createElement("div");
  card.className = "error-card";
  const title = document.createElement("h2");
  title.className = "error-title";
  title.textContent = err.title;
  const tips = document.createElement("ul");
  tips.className = "error-tips";
  for (const t of err.tips || []) {
    const li = document.createElement("li");
    li.textContent = t;
    tips.appendChild(li);
  }
  const actions = document.createElement("div");
  actions.className = "error-actions";
  for (const [label, fn] of [
    ["重试摄像头", startCamera],
    ["进入演示模式", startDemo],
  ]) {
    const b = document.createElement("button");
    b.className = "btn";
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => finishError(fn));
    actions.appendChild(b);
  }
  card.append(title, tips, actions);
  errorPanel.appendChild(card);
  errorPanel.classList.remove("hidden");
}

function finishError(fn) {
  errorPanel.classList.add("hidden");
  fn();
}

// ---------- 手部上下文（两个渲染模式共用） ----------
function computeHand(f) {
  if (!f.landmarks) return null;
  const tip = pad.toCanvas(f.landmarks[8]);
  const pip = pad.toCanvas(f.landmarks[6]);
  const palmIdx = [0, 5, 9, 13, 17];
  let px = 0, py = 0;
  for (const i of palmIdx) {
    const p = pad.toCanvas(f.landmarks[i]);
    px += p.x; py += p.y;
  }
  const palm = { x: px / palmIdx.length, y: py / palmIdx.length };
  const midTip = pad.toCanvas(f.landmarks[12]);

  // 掌心速度（指数平滑），供"掌风"与粒子喷射初速度使用
  const now = performance.now();
  if (prevPalm && prevT) {
    const dt = Math.max(4, now - prevT) / 1000;
    const ivx = (palm.x - prevPalm.x) / dt;
    const ivy = (palm.y - prevPalm.y) / dt;
    vel.x += (ivx - vel.x) * 0.4;
    vel.y += (ivy - vel.y) * 0.4;
  }
  prevPalm = palm;
  prevT = now;

  const dx = tip.x - pip.x, dy = tip.y - pip.y;
  const dl = Math.hypot(dx, dy) || 1;
  return {
    landmarks: f.landmarks,
    tip, palm,
    mid: { x: (tip.x + midTip.x) / 2, y: (tip.y + midTip.y) / 2 },
    dir: { x: dx / dl, y: dy / dl },
    vel: { x: vel.x, y: vel.y },
    size: f.size,
    color: CONFIG.colors[pad.colorIdx],
  };
}

// ---------- 粒子模式：每帧入口 ----------
function particleFrame(f) {
  const hand = computeHand(f);
  lastHand = hand;

  // 花朵独立页：只保留一种体验——张手花开、握拳消散，其余手势全部忽略
  let g = f.gesture;
  if (window.__FLOWER_ONLY) {
    g = (g === "Open_Palm" || g === "Thumb_Index") ? "Thumb_Index"
      : g === "Closed_Fist" ? "Thumb_Up"
      : "None";
  }

  // 效果注册表分发：进入 / 持续 / 退出
  if (g !== lastGesture) {
    const old = EFFECTS[lastGesture];
    if (old && old.onExit) old.onExit(hand, ps);
    const cur = EFFECTS[g];
    if (cur && cur.onEnter) cur.onEnter(hand, ps);
    lastGesture = g;
  }
  const eff = EFFECTS[g];
  if (eff && eff.onFrame && hand) eff.onFrame(hand, ps);

  // 花朵页氛围：漂浮的微光星尘
  if (window.__FLOWER_ONLY && Math.random() < 0.5 && ps.count < 3000) {
    ps.spawn({
      x: Math.random() * pad.w, y: Math.random() * pad.h,
      vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 6,
      life: 4 + Math.random() * 3, size: 0.7 + Math.random() * 0.8,
      color: "#9fc7ff", gravity: 0, drag: 1,
    });
  }
}

// 粒子模式渲染循环：统一在这里做物理更新与绘制（无手时也保持画面活着）
function particleLoop() {
  if (renderMode !== "particles") return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - (loopT || now)) / 1000);
  loopT = now;

  const wind = lastHand
    ? { x: lastHand.palm.x, y: lastHand.palm.y, vx: lastHand.vel.x, vy: lastHand.vel.y, r: CONFIG.particles.handDragRadius, strength: CONFIG.particles.handDragStrength }
    : null;
  ps.update(dt, wind);
  ps.render((ctx) => { if (lastHand && !window.__FLOWER_ONLY) drawHud(ctx, lastHand); });

  hint.classList.toggle("hidden", !!lastHand);
  if (camStatus && ++frameTick % 30 === 0) {
    camStatus.textContent = mode === "camera" ? `TRACKING · ${ps.count} PARTICLES` : `DEMO · ${ps.count} PARTICLES`;
  }
  _raf = requestAnimationFrame(particleLoop);
}

// 手部追踪 HUD：青色虚线骨架 + 琥珀色尺寸读数
function drawHud(ctx, hand) {
  const lm = hand.landmarks;
  const P = (i) => pad.toCanvas(lm[i]);
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(45, 216, 255, .5)";
  ctx.lineWidth = 1.2;
  for (const mcp of [5, 9, 13, 17]) {
    const a = P(0), b = P(mcp);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const i of [4, 8, 12, 16, 20]) {
    const p = P(i);
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  const wrist = P(0), midTip = P(12);
  if (!window.__FLOWER_ONLY) {
    ctx.font = '11px Consolas, "Cascadia Code", monospace';
    ctx.fillStyle = "rgba(255, 180, 84, .9)";
    // 读数标注放在手腕附近，避免压住花心等画面主体
    ctx.fillText(`SIZE:${Math.round(hand.size * 100)}`, wrist.x + 12, wrist.y + 16);
  }
  ctx.restore();
}

// ---------- 3D 星环模式 ----------
let space3d = null;

function spaceFrame(f) {
  lastHand = computeHand(f);
  lastGesture = f.gesture; // 进入/退出判定由 Space3D 内部用 _g 追踪
}

function spaceLoop() {
  if (renderMode !== "space3d" || !space3d) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - (loopT || now)) / 1000);
  loopT = now;
  space3d.update(dt, lastHand, lastGesture);
  space3d.render();
  // HUD 画在 2D 画布上（星环在底层 3D 画布）
  pad.ctx.clearRect(0, 0, pad.w, pad.h);
  if (lastHand) drawHud(pad.ctx, lastHand);
  hint.classList.toggle("hidden", !!lastHand);
  if (++frameTick % 30 === 0) {
    camStatus.textContent = mode === "camera" ? `SATURN RING · ${space3d.count}` : `DEMO · ${space3d.count} STARS`;
  }
  _raf = requestAnimationFrame(spaceLoop);
}

async function enterSpace() {
  $("#space").classList.remove("hidden");
  if (!space3d) {
    setStatus("正在加载 3D 引擎…", "loading");
    try {
      const { Space3D } = await import("./space3d.js");
      space3d = new Space3D($("#space"));
      await space3d.init();
    } catch (e) {
      $("#space").classList.add("hidden");
      setStatus("3D 引擎加载失败", "err");
      showToast("3D 引擎加载失败（Three.js 需联网），已切回粒子模式");
      renderMode = "particles";
      syncModeButtons(); buildLegend();
      pad._resize(); ps._resize(); particleLoop();
      applyModeVisuals();
      return;
    }
  }
  space3d._resize();
  if (demo) demo.hold = false; // 引擎就绪，时间轴开走
  spaceLoop();
}

// ---------- 银河星旅模式 ----------
let galaxy = null;

function galaxyFrame(f) {
  lastHand = computeHand(f);
  lastGesture = f.gesture;
}

function galaxyLoop() {
  if (renderMode !== "galaxy" || !galaxy) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - (loopT || now)) / 1000);
  loopT = now;
  galaxy.update(dt, lastHand, lastGesture);
  galaxy.render();
  // HUD：手部骨架 + 行星标签（投影自 3D 世界）
  pad.ctx.clearRect(0, 0, pad.w, pad.h);
  if (lastHand) drawHud(pad.ctx, lastHand);
  if (galaxy.labels && galaxy.vw) {
    const lc = pad.ctx;
    lc.font = '12px Consolas, "Cascadia Code", monospace';
    lc.lineWidth = 1.4;
    for (const l of galaxy.labels) {
      if (!l.visible) continue;
      const sel = l.selected;
      const c = sel ? "rgba(255, 180, 84, .95)" : "rgba(45, 216, 255, .8)";
      lc.strokeStyle = c; lc.fillStyle = c;
      lc.beginPath();
      lc.moveTo(l.x, l.y - 6); lc.lineTo(l.x + 6, l.y); lc.lineTo(l.x, l.y + 6); lc.lineTo(l.x - 6, l.y);
      lc.closePath(); lc.stroke();
      lc.fillText(sel ? `${l.name} ${l.en} ▶` : l.name, l.x + 11, l.y + 4);
      if (sel && galaxy.state === "arrived") {
        lc.fillText(l.blurb, l.x + 11, l.y + 22);
      }
    }
  }
  hint.classList.toggle("hidden", !!lastHand);
  if (camStatus && ++frameTick % 30 === 0) {
    const arrived = galaxy.state === "arrived" && galaxy._arrivedPlanet;
    camStatus.textContent = arrived ? `ARRIVED · ${galaxy._arrivedPlanet.en}` : `MILKY WAY · ${galaxy.count} STARS`;
  }
  _raf = requestAnimationFrame(galaxyLoop);
}

async function enterGalaxy() {
  $("#galaxy").classList.remove("hidden");
  if (!galaxy) {
    setStatus("正在加载 3D 引擎…", "loading");
    try {
      const { Galaxy3D } = await import("./galaxy.js");
      galaxy = new Galaxy3D($("#galaxy"));
      await galaxy.init();
    } catch (e) {
      $("#galaxy").classList.add("hidden");
      setStatus("3D 引擎加载失败", "err");
      showToast("3D 引擎加载失败（Three.js 需联网），已切回粒子模式");
      renderMode = "particles";
      syncModeButtons(); buildLegend();
      pad._resize(); ps._resize(); particleLoop();
      applyModeVisuals();
      return;
    }
  }
  galaxy._resize();
  if (demo) demo.hold = false; // 引擎就绪，时间轴开走
  galaxyLoop();
}

// ---------- 笔迹模式：每帧入口（原有逻辑） ----------
function inkFrame(f) {
  pad.hand = f.landmarks ? { landmarks: f.landmarks, size: f.size, present: true } : { present: false };

  // 张开手掌 = 绘制；食指尖(8)就是笔尖
  if (f.gesture === "Open_Palm" && f.landmarks) {
    pad.begin();
    const pt = pad.toCanvas(f.landmarks[8]);
    pad.addPoint(pt.x, pt.y, f.size);
    pad.cursor = pt;
    pad.dirty = true;
  } else {
    pad.end();
    pad.cursor = null;
  }

  // 手在场时构造线/光标要跟着动，强制每帧重绘
  if (f.landmarks) pad.dirty = true;
  hint.classList.toggle("hidden", !!f.landmarks);
  if (pad.dirty) pad.render();
}

// ---------- 背景与模式视觉 ----------
function syncCamBg() {
  const bg = $("#camBg");
  const on = renderMode === "particles" && mode === "camera" && video.srcObject;
  bg.classList.toggle("hidden", !on);
  if (on) bg.srcObject = video.srcObject; // 摄像头画面作粒子/花朵背景（仅本地）
}

function applyModeVisuals() {
  const space = renderMode === "space3d" || renderMode === "galaxy";
  document.body.classList.toggle("space-mode", space); // 银河/星环：纯黑沉浸背景
  document.querySelector(".paper-wrap").classList.toggle("space-bg", space);
  syncCamBg();
}

// ---------- 统一帧入口 ----------
function onFrame(f) {
  if (renderMode === "particles") particleFrame(f);
  else if (renderMode === "space3d") spaceFrame(f);
  else if (renderMode === "galaxy") galaxyFrame(f);
  else inkFrame(f);
}

// ---------- 一次性手势事件（笔迹模式的动作在这里；粒子模式走注册表） ----------
function onGesture(g) {
  if (renderMode !== "ink") return; // 粒子/星环/银河各自在帧循环里分发，不能提前改 lastGesture
  lastGesture = g;

  switch (g) {
    case "Closed_Fist":
      pad.cycleColor();
      showToast(`颜色 → ${CONFIG.colors[pad.colorIdx]}`);
      syncSwatches();
      break;
    case "Pointing_Up": {
      const on = pad.toggleConstruction();
      constrToggle.checked = on;
      showToast(`构造线${on ? "已打开" : "已关闭"}`);
      break;
    }
    case "Victory":
      showToast(`笔刷：${pad.cycleWidth()}`);
      break;
    case "Thumb_Up":
      pad.clear();
      showToast("已清空画布");
      break;
    case "Thumb_Index":
      if (pad.strokes.length) showToast("撤销上一笔");
      else showToast("画布是空的");
      pad.undo();
      break;
  }
}

// ---------- 模式切换 ----------
function setRenderMode(m) {
  if (renderMode === m) return;
  renderMode = m;
  cancelAnimationFrame(_raf);
  ps.killAll(0);
  ps.attractors.length = 0;
  ps.vortices.length = 0;
  lastGesture = "None";
  prevPalm = null;
  if (demo && m !== "space3d" && m !== "galaxy") demo.hold = false; // 离开 3D 模式时解除时间轴暂停
  const checkWrap = constrToggle ? constrToggle.closest(".check") : null;
  if (checkWrap) checkWrap.classList.toggle("hidden", m !== "ink");
  $("#space").classList.toggle("hidden", m !== "space3d");
  $("#galaxy").classList.toggle("hidden", m !== "galaxy");
  buildLegend();
  syncModeButtons();
  if (m === "particles") { pad._resize(); ps._resize(); particleLoop(); showToast("粒子模式"); }
  else if (m === "ink") { pad._resize(); pad.dirty = true; showToast("笔迹模式"); }
  else if (m === "space3d") { enterSpace().then(() => showToast("3D 星环模式")); }
  else if (m === "galaxy") { enterGalaxy().then(() => showToast("银河星旅模式")); }
  applyModeVisuals();
}

function syncModeButtons() {
  $("#btnModeGalaxy")?.classList.toggle("ghost", renderMode !== "galaxy");
  $("#btnModeSpace")?.classList.toggle("ghost", renderMode !== "space3d");
  $("#btnModeParticles")?.classList.toggle("ghost", renderMode !== "particles");
  $("#btnModeInk")?.classList.toggle("ghost", renderMode !== "ink");
}

// ---------- 摄像头 / 演示 ----------
async function startCamera() {
  stopDemo();
  mode = "camera";
  demoBadge.classList.add("hidden");
  setStatus("正在打开摄像头…", "loading");
  camStatus.textContent = "请求权限中…";
  const ok = await engineStart();
  if (!ok) mode = "paper";
  applyModeVisuals();
}

async function engineStart() {
  if (!engine) {
    engine = new GestureEngine(video, {
      onFrame,
      onGesture,
      onStatus: setStatus,
      onError: showError,
    });
  }
  return engine.start();
}

function startDemo() {
  stopEngine();
  mode = "demo";
  demoBadge.classList.remove("hidden");
  setStatus("演示模式运行中", "demo");
  applyModeVisuals();
  import("./demo.js").then(({ DemoHand }) => {
    demo = new DemoHand({ onFrame, onGesture });
    // 3D 模式下等引擎就绪再开始走时间轴（其他模式渲染即就绪）
    demo.hold = renderMode === "space3d" || renderMode === "galaxy";
    demo.start();
  }).catch(() => setStatus("演示加载失败", "err"));
}

function stopDemo() {
  if (demo) { demo.stop(); demo = null; }
}
function stopEngine() {
  if (engine) { engine.stop(); engine = null; }
}

// ---------- UI ----------
function syncSwatches() {
  if (!swatchesEl) return; // 独立页面可能没有色板
  [...swatchesEl.children].forEach((el, i) =>
    el.classList.toggle("active", i === pad.colorIdx)
  );
}

function buildSwatches() {
  CONFIG.colors.forEach((c, i) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "swatch";
    sw.style.background = c;
    sw.title = `颜色 ${i + 1}`;
    sw.addEventListener("click", () => { pad.setColor(i); syncSwatches(); });
    swatchesEl.appendChild(sw);
  });
  syncSwatches();
}

function buildLegend() {
  if (!legendEl) return; // 独立页面没有图例栏
  legendEl.innerHTML = "";
  let items;
  if (renderMode === "galaxy") {
    items = [
      { glyph: GLYPHS.Open_Palm, text: "张开手掌 · 光标悬停选择行星" },
      { glyph: GLYPHS.Thumb_Index, text: "捏合 · 跃迁到选中的行星" },
      { glyph: GLYPHS.Thumb_Index, text: "到达后再捏合 · 返回银河全景" },
      { glyph: GLYPHS.Thumb_Up, text: "点赞 · 直接返回全景" },
      { glyph: GLYPHS.Closed_Fist, text: "握拳 · 银河旋转加速" },
      { glyph: GLYPHS.Victory, text: "剪刀手 · 时间迟缓" },
      { glyph: GLYPHS.Pointing_Up, text: "食指上指 · 俯瞰银河旋臂" },
    ];
  } else if (renderMode === "space3d") {
    items = [
      { glyph: GLYPHS.Open_Palm, text: "张开手掌 · 视角跟随，挥动加速旋转" },
      { glyph: GLYPHS.Closed_Fist, text: "握拳 · 星环收缩加速" },
      { glyph: GLYPHS.Pointing_Up, text: "食指上指 · 俯瞰视角" },
      { glyph: GLYPHS.Victory, text: "剪刀手 · 星环分裂双环" },
      { glyph: GLYPHS.Thumb_Up, text: "点赞 · 超新星重组" },
      { glyph: GLYPHS.Thumb_Index, text: "捏合 · 聚合成星球" },
    ];
  } else if (renderMode === "particles") {
    items = Object.entries(EFFECTS).map(([g, e]) => ({ glyph: e.glyph, text: `${e.label} · ${e.hint}` }));
  } else {
    items = Object.entries(GESTURE_INFO)
      .filter(([g]) => g !== "None" && GLYPHS[g])
      .map(([g, info]) => ({ glyph: GLYPHS[g], text: `${info.label} · ${info.hint}` }));
  }
  for (const it of items) {
    const li = document.createElement("li");
    li.innerHTML = `<svg viewBox="0 0 24 24" class="glyph"><path d="${it.glyph}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>${it.text}</span>`;
    legendEl.appendChild(li);
  }
}

const btnUndoEl = $("#btnUndo");
if (btnUndoEl) btnUndoEl.addEventListener("click", () => { pad.undo(); showToast("撤销上一笔"); });
const btnClearEl = $("#btnClear");
if (btnClearEl) btnClearEl.addEventListener("click", () => { pad.clear(); ps.killAll(0); showToast("已清空"); });
const btnSaveEl = $("#btnSave");
if (btnSaveEl) btnSaveEl.addEventListener("click", () => pad.exportPNG());
const btnDemoEl = $("#btnDemo");
if (btnDemoEl) btnDemoEl.addEventListener("click", startDemo);
$("#btnCam").addEventListener("click", startCamera);
const btnModeGalaxyEl = $("#btnModeGalaxy");
if (btnModeGalaxyEl) btnModeGalaxyEl.addEventListener("click", () => setRenderMode("galaxy"));
const btnModeSpaceEl = $("#btnModeSpace");
if (btnModeSpaceEl) btnModeSpaceEl.addEventListener("click", () => setRenderMode("space3d"));
const btnModeParticlesEl = $("#btnModeParticles");
if (btnModeParticlesEl) btnModeParticlesEl.addEventListener("click", () => setRenderMode("particles"));
const btnModeInkEl = $("#btnModeInk");
if (btnModeInkEl) btnModeInkEl.addEventListener("click", () => setRenderMode("ink"));
if (constrToggle) constrToggle.addEventListener("change", () => {
  pad.construction = constrToggle.checked;
  pad.dirty = true;
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); pad.undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); pad.exportPNG(); }
  if (e.key >= "1" && e.key <= "9") {
    const i = Number(e.key) - 1;
    if (i < CONFIG.colors.length) { pad.setColor(i); syncSwatches(); }
  }
  if (e.key.toLowerCase() === "c" && renderMode === "ink" && constrToggle) {
    const on = pad.toggleConstruction();
    constrToggle.checked = on;
  }
});

// ---------- 暴露给自动化测试的钩子 ----------
window.__app = {
  get renderMode() { return renderMode; },
  get mode() { return mode; },
  get lastGesture() { return lastGesture; },
  get space() { return space3d; },
  get galaxy() { return galaxy; },
  strokes: () => pad.strokes.length,
  particles: () => (renderMode === "space3d" && space3d ? space3d.count : renderMode === "galaxy" && galaxy ? galaxy.count : ps.count),
  demoT: () => (demo ? demo.t : -1),
  latency: () => (engine ? engine.latencyMs : 0),
  pad,
  ps,
  setRenderMode,
  startCamera,
  startDemo,
};

// ---------- 启动 ----------
if (swatchesEl) buildSwatches();
buildLegend();
syncModeButtons();
const checkWrap0 = constrToggle ? constrToggle.closest(".check") : null;
if (checkWrap0) checkWrap0.classList.toggle("hidden", renderMode !== "ink"); // 只有笔迹模式显示构造线开关
if (renderMode === "particles") {
  particleLoop();
} else if (renderMode === "space3d") {
  enterSpace();
} else if (renderMode === "galaxy") {
  enterGalaxy();
}
applyModeVisuals();

const params = new URLSearchParams(location.search);
if (params.get("demo") === "1") {
  startDemo();
} else if (params.get("paper") === "1") {
  setStatus("画布预览模式（未开启摄像头）", "idle");
  camStatus.textContent = "未开启";
} else {
  startCamera();
}
