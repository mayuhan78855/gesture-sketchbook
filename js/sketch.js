// ============================================================
// sketch.js —— 绘画引擎
// 职责：把手指轨迹变成"霓虹灯管"笔迹，并绘制手部追踪 HUD。
// 结构：strokes 保存已完成的笔画；base 离屏画布缓存已完成的画，
//       每帧只叠加"正在画的这一笔 + HUD 构造线"，保证长时间运行流畅。
// ============================================================

import { CONFIG } from "./config.js";

export class SketchPad {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.base = document.createElement("canvas");
    this.strokes = [];        // 已完成的笔画 [{pts:[[x,y],...], color, width}]
    this.current = null;      // 正在画的笔画
    this.colorIdx = 0;
    this.widthMode = 0;       // 0 自动 / 1 细 / 2 粗
    this.construction = false;
    this.hand = { present: false };
    this.cursor = null;       // 当前指尖位置(画圆环提示)
    this.dirty = true;
    this.w = 0;
    this.h = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  // ---------- 尺寸 ----------
  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.w = r.width;
    this.h = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this._rebuildBase();
  }

  // ---------- 坐标 ----------
  // MediaPipe 关键点是 0~1 归一化坐标,这里映射到画布像素,并做镜像(自拍视角)
  toCanvas(lm) {
    return { x: (1 - lm.x) * this.w, y: lm.y * this.h };
  }

  // ---------- 笔画 ----------
  begin() {
    if (this.current) return;
    this.current = { pts: [], color: CONFIG.colors[this.colorIdx], width: this._width(1) };
  }

  addPoint(x, y, handSize) {
    if (!this.current) return;
    const j = CONFIG.jitter;
    this.current.pts.push([
      x + (Math.random() - 0.5) * 2 * j,
      y + (Math.random() - 0.5) * 2 * j,
    ]);
    if (this.current.pts.length > CONFIG.maxPointsPerStroke) this.current.pts.shift();
    this.current.width = this._width(handSize);
    this.dirty = true;
  }

  end() {
    if (!this.current) return;
    if (this.current.pts.length >= 2) {
      this.strokes.push(this.current);
      if (this.strokes.length > CONFIG.maxStrokes) this.strokes.shift();
    }
    this.current = null;
    this._rebuildBase();
    this.dirty = true;
  }

  _width(handSize) {
    const auto = Math.min(
      CONFIG.strokeWidth.max,
      Math.max(CONFIG.strokeWidth.min, (handSize || 0.25) * 45)
    );
    return auto * [1, 0.55, 1.7][this.widthMode];
  }

  // ---------- 动作 ----------
  setColor(i) {
    this.colorIdx = (i + CONFIG.colors.length) % CONFIG.colors.length;
  }
  cycleColor() {
    this.colorIdx = (this.colorIdx + 1) % CONFIG.colors.length;
  }
  toggleConstruction() {
    this.construction = !this.construction;
    this.dirty = true;
    return this.construction;
  }
  cycleWidth() {
    this.widthMode = (this.widthMode + 1) % 3;
    return ["自动粗细", "细笔", "粗笔"][this.widthMode];
  }
  undo() {
    this.strokes.pop();
    this._rebuildBase();
    this.dirty = true;
  }
  clear() {
    this.strokes = [];
    this.current = null;
    this._rebuildBase();
    this.dirty = true;
  }

  exportPNG() {
    const tmp = document.createElement("canvas");
    tmp.width = this.canvas.width;
    tmp.height = this.canvas.height;
    const ctx = tmp.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    if (this.current && this.current.pts.length) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.scale(dpr, dpr);
      this._paint(ctx, this.current, 0.9);
    }
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `gesture-sketch-${ts}.png`;
    a.href = tmp.toDataURL("image/png");
    a.click();
  }

  // ---------- 渲染 ----------
  _rebuildBase() {
    const bctx = this.base.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, this.w, this.h);
    for (const s of this.strokes) this._paint(bctx, s, 1);
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.base, 0, 0, this.w, this.h);
    if (this.current && this.current.pts.length) this._paint(ctx, this.current, 0.55);
    if (this.construction && this.hand.present) this._construction(ctx);
    if (this.cursor) {
      ctx.beginPath();
      ctx.arc(this.cursor.x, this.cursor.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(45, 216, 255, .8)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.dirty = false;
  }

  // 一笔霓虹线:先画一层宽而淡的能量晕影,再画带辉光的主线,模拟霓虹灯管发光
  _paint(ctx, stroke, opacityScale) {
    const pts = stroke.pts;
    if (pts.length < 2) return;
    const draw = (width, alpha, glow) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (glow) {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = Math.min(18, width * 1.6);
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };
    draw(stroke.width * 2.4, 0.16 * opacityScale, false);
    draw(stroke.width, 0.95 * opacityScale, true);
  }

  // 手部追踪 HUD:圆圈锁定指尖、虚线连接关节、尺寸读数--把识别算法的"视线"画出来
  _construction(ctx) {
    const lm = this.hand.landmarks;
    const P = (i) => this.toCanvas(lm[i]);
    const tips = [4, 8, 12, 16, 20];

    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(45, 216, 255, .55)";
    ctx.lineWidth = 1.2;

    // 手腕 -> 四指根 的辅助线(像画人物时的骨架线)
    for (const mcp of [5, 9, 13, 17]) {
      const a = P(0), b = P(mcp);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // 指尖圆圈
    for (const i of tips) {
      const p = P(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // "量手掌":手腕到中指尖的尺寸线 + 两端的刻度
    const wrist = P(0);
    const midTip = P(12);
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    ctx.lineTo(midTip.x, midTip.y);
    ctx.stroke();
    for (const p of [wrist, midTip]) {
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y - 4);
      ctx.lineTo(p.x + 4, p.y + 4);
      ctx.moveTo(p.x + 4, p.y - 4);
      ctx.lineTo(p.x - 4, p.y + 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 手掌尺寸读数
    const mx = (wrist.x + midTip.x) / 2;
    const my = (wrist.y + midTip.y) / 2;
    ctx.font = '11px Consolas, "Cascadia Code", monospace';
    ctx.fillStyle = "rgba(255, 180, 84, .9)";
    ctx.fillText(`SIZE:${Math.round(this.hand.size * 100)}`, mx + 10, my - 4);
    ctx.restore();
  }
}
