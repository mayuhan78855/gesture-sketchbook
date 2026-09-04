// ============================================================
// app.js —— 应用入口
// 职责：把 手势识别引擎(GestureEngine) 和 绘画引擎(SketchPad) 接起来
//       管理 UI（状态灯、提示、错误面板、按钮）与两种模式（摄像头 / 演示）
// ============================================================

import { CONFIG, GESTURE_INFO } from "./config.js";
import { GestureEngine } from "./gestures.js";
import { SketchPad } from "./sketch.js";

const $ = (s) => document.querySelector(s);
const canvas = $("#paper");
const video = $("#cam");
const chip = $("#statusChip");
const hint = $("#hint");
const toastEl = $("#toast");
const demoBadge = $("#demoBadge");
const errorPanel = $("#errorPanel");
const camStatus = $("#camStatus");
const swatchesEl = $("#swatches");
const constrToggle = $("#constrToggle");

const pad = new SketchPad(canvas);
let engine = null;
let demo = null;
let mode = "paper"; // 'paper' | 'camera' | 'demo'
let lastGesture = "None";
let toastTimer = 0;

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

// ---------- 手势 -> 交互 的映射（这是整个项目最核心的一段）----------
function onGesture(g) {
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

function onFrame(f) {
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

// ---------- 模式 ----------
async function startCamera() {
  stopDemo();
  mode = "camera";
  demoBadge.classList.add("hidden");
  setStatus("正在打开摄像头…", "loading");
  camStatus.textContent = "请求权限中…";
  const ok = await engineStart();
  if (!ok) mode = "paper";
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
  camStatus.textContent = "演示模式 · 虚拟手";
  setStatus("演示模式运行中", "demo");
  import("./demo.js").then(({ DemoHand }) => {
    demo = new DemoHand({ onFrame, onGesture });
    demo.start();
  }).catch(() => setStatus("演示加载失败", "err"));
}

function stopDemo() {
  if (demo) { demo.stop(); demo = null; }
}
function stopEngine() {
  if (engine) { engine.stop(); engine = null; }
}

// ---------- UI 绑定 ----------
function syncSwatches() {
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

$("#btnUndo").addEventListener("click", () => { pad.undo(); showToast("撤销上一笔"); });
$("#btnClear").addEventListener("click", () => { pad.clear(); showToast("已清空画布"); });
$("#btnSave").addEventListener("click", () => pad.exportPNG());
$("#btnDemo").addEventListener("click", startDemo);
$("#btnCam").addEventListener("click", startCamera);
constrToggle.addEventListener("change", () => {
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
  if (e.key.toLowerCase() === "c") { const on = pad.toggleConstruction(); constrToggle.checked = on; }
});

// ---------- 暴露给自动化测试的钩子 ----------
window.__app = {
  get mode() { return mode; },
  get lastGesture() { return lastGesture; },
  strokes: () => pad.strokes.length,
  latency: () => (engine ? engine.latencyMs : 0),
  pad,
  startCamera,
  startDemo,
};

// ---------- 启动 ----------
buildSwatches();
const params = new URLSearchParams(location.search);
if (params.get("demo") === "1") {
  startDemo();
} else if (params.get("paper") === "1") {
  setStatus("画布预览模式（未开启摄像头）", "idle");
  camStatus.textContent = "未开启";
} else {
  startCamera();
}
