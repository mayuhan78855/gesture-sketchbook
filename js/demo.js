// ============================================================
// demo.js —— 演示模式：一只"虚拟手"
// 说明：没有摄像头或摄像头报错时，可用它体验完整交互。
//      它按时间轴生成 21 个手部关键点 + 手势标签，
//      输出格式与 GestureEngine 完全一致，所以下游代码不用改。
// ============================================================

const SEGMENTS = [
  { t0: 0.2,  t1: 3.4,  gesture: "Open_Palm",   path: "star",  at: { x: 0.52, y: 0.50 } },
  { t0: 3.4,  t1: 4.2,  gesture: "Closed_Fist", at: { x: 0.55, y: 0.48 } },
  { t0: 4.2,  t1: 5.0,  gesture: "Pointing_Up", at: { x: 0.52, y: 0.46 } },
  { t0: 5.0,  t1: 8.2,  gesture: "Open_Palm",   path: "heart", at: { x: 0.50, y: 0.42 } },
  { t0: 8.2,  t1: 9.0,  gesture: "Victory",     at: { x: 0.50, y: 0.48 } },
  { t0: 9.0,  t1: 14.2, gesture: "Thumb_Index", at: { x: 0.50, y: 0.46 } },
  { t0: 14.2, t1: 16.5, gesture: "None",        at: { x: 0.5,  y: 0.5 } },
];

// 手部关键点模板（单位坐标，y 向下为正在画布上的方向）
const POSES = {
  open: {
    0: [0, 0.60],
    1: [-0.20, 0.42], 2: [-0.31, 0.32], 3: [-0.38, 0.18], 4: [-0.43, 0.05],
    5: [0.16, 0.28], 6: [0.20, 0.06], 7: [0.22, -0.10], 8: [0.23, -0.26],
    9: [0.00, 0.26], 10: [0.00, 0.00], 11: [0.00, -0.14], 12: [0.00, -0.32],
    13: [-0.16, 0.28], 14: [-0.17, 0.08], 15: [-0.18, -0.06], 16: [-0.19, -0.18],
    17: [-0.29, 0.36], 18: [-0.33, 0.20], 19: [-0.35, 0.12], 20: [-0.36, 0.04],
  },
  fist: {
    0: [0, 0.60],
    1: [-0.20, 0.42], 2: [-0.18, 0.32], 3: [-0.10, 0.27], 4: [-0.02, 0.25],
    5: [0.16, 0.30], 6: [0.21, 0.26], 7: [0.23, 0.21], 8: [0.24, 0.17],
    9: [0.00, 0.28], 10: [0.02, 0.24], 11: [0.02, 0.19], 12: [0.02, 0.15],
    13: [-0.16, 0.30], 14: [-0.19, 0.26], 15: [-0.20, 0.21], 16: [-0.21, 0.17],
    17: [-0.29, 0.34], 18: [-0.33, 0.32], 19: [-0.35, 0.30], 20: [-0.36, 0.29],
  },
  pinch: {
    0: [0, 0.60],
    1: [-0.20, 0.42], 2: [-0.24, 0.32], 3: [-0.16, 0.18], 4: [0.06, -0.04],
    5: [0.16, 0.28], 6: [0.20, 0.06], 7: [0.22, -0.10], 8: [0.23, -0.26],
    9: [0.00, 0.28], 10: [0.02, 0.24], 11: [0.02, 0.19], 12: [0.02, 0.15],
    13: [-0.16, 0.30], 14: [-0.19, 0.26], 15: [-0.20, 0.21], 16: [-0.21, 0.17],
    17: [-0.29, 0.34], 18: [-0.33, 0.32], 19: [-0.35, 0.30], 20: [-0.36, 0.29],
  },
  point: {
    0: [0, 0.60],
    1: [-0.20, 0.42], 2: [-0.25, 0.30], 3: [-0.28, 0.16], 4: [-0.30, 0.03],
    5: [0.16, 0.28], 6: [0.20, 0.06], 7: [0.22, -0.10], 8: [0.23, -0.26],
    9: [0.00, 0.28], 10: [0.02, 0.24], 11: [0.02, 0.19], 12: [0.02, 0.15],
    13: [-0.16, 0.30], 14: [-0.19, 0.26], 15: [-0.20, 0.21], 16: [-0.21, 0.17],
    17: [-0.29, 0.34], 18: [-0.33, 0.32], 19: [-0.35, 0.30], 20: [-0.36, 0.29],
  },
  victory: {
    0: [0, 0.60],
    1: [-0.20, 0.42], 2: [-0.15, 0.34], 3: [-0.08, 0.28], 4: [-0.01, 0.26],
    5: [0.16, 0.28], 6: [0.20, 0.06], 7: [0.22, -0.10], 8: [0.23, -0.26],
    9: [0.00, 0.26], 10: [0.00, 0.00], 11: [0.00, -0.14], 12: [0.00, -0.32],
    13: [-0.16, 0.30], 14: [-0.19, 0.26], 15: [-0.20, 0.21], 16: [-0.21, 0.17],
    17: [-0.29, 0.34], 18: [-0.33, 0.32], 19: [-0.35, 0.30], 20: [-0.36, 0.29],
  },
  thumb: {
    0: [0, 0.60],
    1: [-0.20, 0.42], 2: [-0.24, 0.22], 3: [-0.26, 0.04], 4: [-0.27, -0.14],
    5: [0.16, 0.30], 6: [0.21, 0.26], 7: [0.23, 0.21], 8: [0.24, 0.17],
    9: [0.00, 0.28], 10: [0.02, 0.24], 11: [0.02, 0.19], 12: [0.02, 0.15],
    13: [-0.16, 0.30], 14: [-0.19, 0.26], 15: [-0.20, 0.21], 16: [-0.21, 0.17],
    17: [-0.29, 0.34], 18: [-0.33, 0.32], 19: [-0.35, 0.30], 20: [-0.36, 0.29],
  },
};

// 画笔轨迹（归一化坐标）
function pathPoint(kind, t, seg) {
  if (kind === "star") {
    const R = 0.17;
    const verts = [];
    for (let k = 0; k < 5; k++) {
      const a = ((k * 72 - 90) * Math.PI) / 180;
      verts.push([seg.at.x + R * Math.cos(a), seg.at.y + R * Math.sin(a) * 0.95]);
    }
    const order = [0, 2, 4, 1, 3];
    const idx = Math.min(4, Math.floor(t * 5));
    const a = verts[order[idx]];
    const b = verts[order[(idx + 1) % 5]];
    const f = t * 5 - idx;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
  }
  if (kind === "heart") {
    const s = 0.011;
    const a = t * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(a), 3) * s;
    const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s;
    return { x: seg.at.x + x, y: seg.at.y + y };
  }
  if (kind === "wave") {
    const x = -0.22 + t * 0.5;
    const y = 0.52 + 0.1 * Math.sin(t * Math.PI * 2);
    return { x: x + 0.24, y };
  }
  return { x: seg.at.x, y: seg.at.y };
}

const POSE_NAME = { Open_Palm: "open", Closed_Fist: "fist", Pointing_Up: "point", Victory: "victory", Thumb_Up: "thumb", Thumb_Index: "pinch", None: "open" };

// 生成 21 个关键点：模板 + 缩放 + 位置 + 轻微呼吸抖动
function buildHand(x, y, gesture, t) {
  const pose = POSES[POSE_NAME[gesture] || "open"];
  const s = 0.34;
  const lm = [];
  for (let i = 0; i < 21; i++) {
    const [px, py] = pose[i];
    lm.push({
      x: x + px * s + Math.sin(t * 7 + i * 1.7) * 0.0035,
      y: y + py * s + Math.cos(t * 6 + i * 1.3) * 0.0035,
    });
  }
  return lm;
}

export class DemoHand {
  constructor(cb) {
    this.cb = cb; // { onFrame, onGesture }
    this.t = 0;
    this._prev = 0;
    this._timer = 0;
    this._lastG = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._prev = performance.now();
    this._timer = setInterval(() => this._tick(), 33);
  }

  stop() {
    this._running = false;
    clearInterval(this._timer);
  }

  _tick() {
    const now = performance.now();
    const dt = (now - this._prev) / 1000;
    this._prev = now;
    this.t += dt;
    // 时间轴走完一圈后从头循环（末尾的“点赞”会清空画布，循环不会堆积）
    if (this.t >= SEGMENTS[SEGMENTS.length - 1].t1) {
      this.t = 0;
      this._lastG = null;
    }

    const seg = SEGMENTS.find((s) => this.t >= s.t0 && this.t < s.t1) || SEGMENTS[SEGMENTS.length - 1];

    // 手势变化时触发一次性事件（换色/构造线/清空等）
    if (seg.gesture !== this._lastG) {
      this._lastG = seg.gesture;
      if (seg.gesture !== "None" && this.cb.onGesture) this.cb.onGesture(seg.gesture, 1);
    }

    let landmarks = null;
    if (seg.gesture !== "None") {
      const p = seg.path ? pathPoint(seg.path, (this.t - seg.t0) / (seg.t1 - seg.t0), seg) : seg.at;
      landmarks = buildHand(p.x, p.y, seg.gesture, this.t);
    }

    this.cb.onFrame({
      landmarks,
      gesture: seg.gesture,
      confidence: 1,
      size: 0.30,
      latencyMs: 1,
      demo: true,
    });
  }
}
