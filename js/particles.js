// ============================================================
// particles.js —— 粒子引擎
// 职责：管理粒子池（生成/受力/消亡）与霓虹辉光渲染（带拖影）。
//       手势→粒子行为的"翻译"不在这里，而在 effects.js 的注册表里。
// 渲染思路：不清屏，而是每帧盖一层半透明深色 => 自然形成发光拖影；
//       粒子用 additive（lighter）混合叠加出霓虹亮度。
// ============================================================

import { CONFIG } from "./config.js";

export class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.trail = document.createElement("canvas"); // 离屏拖影层（不清屏，形成发光尾迹）
    this.parts = [];       // 活跃粒子
    this.attractors = [];  // 引力点 [{x,y,r,strength}]（引力奇点效果使用）
    this.vortices = [];    // 涡流 [{x,y,r,strength}]（量子涡流效果使用）
    this.w = 0;
    this.h = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  get count() {
    return this.parts.length;
  }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.w = r.width;
    this.h = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.trail]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /** 生成一个粒子 */
  spawn(o) {
    if (this.parts.length >= CONFIG.particles.max) this.parts.shift();
    this.parts.push({
      x: o.x, y: o.y,
      vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 1, maxLife: o.life || 1,
      color: o.color || "#2dd8ff",
      size: o.size || 2,
      gravity: o.gravity ?? CONFIG.particles.gravity,
      drag: o.drag ?? 0.94, // 每帧速度保留比例（帧率归一到 60fps）
      tx: o.tx ?? null, ty: o.ty ?? null, // 弹簧目标点（聚合成形用，如花开绽放）
      stiff: o.stiff || 0,                // 弹簧刚度：越大聚合越快
      seed: o.seed || null,               // 效果自定义数据（如花瓣参数）
    });
  }

  /** 从一点向四周爆发 n 个粒子 */
  burst(x, y, n, opts = {}) {
    const speed = opts.speed || [120, 420];
    const life = opts.life || [0.5, 1.1];
    const size = opts.size || [1.5, 3.5];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.spawn({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life[0] + Math.random() * (life[1] - life[0]),
        color: opts.color || "#2dd8ff",
        size: size[0] + Math.random() * (size[1] - size[0]),
        gravity: 40, drag: 0.85,
      });
    }
  }

  /** 让现有粒子快速消散（factor 越小消散越快，0 = 立即） */
  killAll(factor = 0.2) {
    for (const p of this.parts) p.life = Math.min(p.life, p.maxLife * factor);
  }

  /**
   * 物理更新
   * @param {number} dt 秒
   * @param {{x,y,vx,vy,r,strength}|null} wind 掌风：手掌挥动带动周围粒子
   */
  update(dt, wind) {
    const arr = this.parts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }

      // 引力点：把粒子往里吸
      for (const a of this.attractors) {
        const dx = a.x - p.x, dy = a.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < a.r) {
          const f = a.strength * (1 - d / a.r) * dt;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      // 涡流：切向力 + 轻微向心
      for (const v of this.vortices) {
        const dx = p.x - v.x, dy = p.y - v.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < v.r) {
          const k = 1 - d / v.r;
          const f = v.strength * k * dt;
          p.vx += (-dy / d) * f - (dx / d) * f * 0.35;
          p.vy += (dx / d) * f - (dy / d) * f * 0.35;
        }
      }
      // 掌风：手掌速度场带动粒子（这就是"动作"也能驱动粒子的原因）
      if (wind) {
        const dx = p.x - wind.x, dy = p.y - wind.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < wind.r) {
          const k = 1 - d / wind.r;
          p.vx += wind.vx * wind.strength * k * dt * 6;
          p.vy += wind.vy * wind.strength * k * dt * 6;
        }
      }

      // 弹簧追踪：粒子飞向目标点（聚合成形：花开绽放等）
      if (p.tx != null) {
        p.vx += (p.tx - p.x) * p.stiff * dt;
        p.vy += (p.ty - p.y) * p.stiff * dt;
      }

      // 积分
      p.vy += p.gravity * dt;
      const keep = Math.pow(p.drag, dt * 60);
      p.vx *= keep;
      p.vy *= keep;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /**
   * 渲染：拖影层淡出+叠加粒子 -> 主画布合成 -> 聚合粒子实色绘制 -> HUD
   * 聚合粒子（带 seed）密度高，若进加色拖影层会过曝成白，因此：
   *   主层用正常混合画实色（花形清晰），拖影层只加一点低强度辉光。
   * @param {(ctx: CanvasRenderingContext2D) => void} [hud] 手部 HUD 绘制回调
   */
  render(hud) {
    const tctx = this.trail.getContext("2d");
    // 擦除式拖影：不涂黑而是让拖影层渐隐，这样底层摄像头画面可以透出来
    tctx.globalCompositeOperation = "destination-out";
    tctx.fillStyle = `rgba(0, 0, 0, ${CONFIG.particles.trailFade})`;
    tctx.fillRect(0, 0, this.w, this.h);

    tctx.globalCompositeOperation = "lighter";
    const seeded = [];
    for (const p of this.parts) {
      const t = p.life / p.maxLife;
      const a = Math.min(1, t * 1.6);
      if (p.seed) {
        seeded.push([p, a]);
        // 低强度辉光进拖影层，避免密集粒子互相加成过曝
        tctx.globalAlpha = a * 0.08;
        tctx.fillStyle = p.color;
        tctx.beginPath();
        tctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
        tctx.fill();
      } else {
        tctx.globalAlpha = a;
        tctx.fillStyle = p.color;
        tctx.beginPath();
        tctx.arc(p.x, p.y, Math.max(0.4, p.size * (0.5 + t * 0.5)), 0, Math.PI * 2);
        tctx.fill();
      }
    }
    tctx.globalAlpha = 1;
    tctx.globalCompositeOperation = "source-over";

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.trail, 0, 0, this.w, this.h);

    // 聚合粒子：主画布实色，花形清晰可辨；先叠一层低强度加色辉光，做出发光质感
    ctx.globalCompositeOperation = "lighter";
    for (const [p, a] of seeded) {
      ctx.globalAlpha = Math.min(1, a * 0.12);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.2, p.size * 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const [p, a] of seeded) {
      ctx.globalAlpha = Math.min(1, a * 0.95);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, p.size * 0.95), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (hud) hud(ctx);
  }
}
