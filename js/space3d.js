// ============================================================
// space3d.js —— 3D 星环模式（Three.js）
// 一条土星式星环（上万粒子）绕行星 core 旋转，手势/动作实时驱动：
//   张开手掌  视角随手掌移动；挥动越快环转越快（角动量）
//   握拳      星环收缩 + 自旋加速（像吸积），松开弹回
//   捏合      万千粒子聚合成星球（弹簧→目标点），松开还原星环
//   食指上指  切俯瞰视角看环全貌
//   剪刀手    星环分裂成内外双环
//   点赞      超新星：向外爆开再自动归位
// Three.js 按需懒加载（断网时其他模式不受影响）。
// ============================================================

import { CONFIG } from "./config.js";

// Three.js 加载：本地 vendor 优先（随仓库部署，离线可用），CDN 兑底
async function loadTHREE() {
  let lastErr;
  for (const src of ["../vendor/three.module.js", "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "https://unpkg.com/three@0.160.0/build/three.module.js"]) {
    try { return await import(src); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Space3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.count = 0;
    this.morph = "ring";      // ring | sphere | collapse | split
    this.azim = 0.6; this.polar = 1.05;
    this.azimT = 0.6; this.polarT = 1.05;
    this.spinBoost = 0;
    this._g = "None";
    this._time = 0;
  }

  async init() {
    const THREE = await loadTHREE();
    const S = CONFIG.space;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);

    // ---- 星环粒子 ----
    const N = S.count;
    this.count = N;
    this.a = new Float32Array(N);       // 环上角度
    this.rr = new Float32Array(N);      // 归一化半径 (0..1)
    this.yy = new Float32Array(N);      // 环厚度偏移
    this.sp = new Float32Array(N);      // 个体速度因子（内快外慢，像开普勒）
    this.rm = new Float32Array(N);      // 当前半径倍率（分裂/收缩用）
    this.rmT = new Float32Array(N);     // 半径倍率目标
    this.sph = new Float32Array(N * 3); // 球形聚合目标（捏合用）
    this.nv = new Float32Array(N * 3);  // 超新星冲量
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);

    const cIn = new THREE.Color("#ffb85c"), cMid = new THREE.Color("#cfdcff"), cOut = new THREE.Color("#7cd4ff");
    const fib = 2.399963;
    for (let i = 0; i < N; i++) {
      this.a[i] = Math.random() * Math.PI * 2;
      this.rr[i] = Math.random();
      this.yy[i] = (Math.random() - 0.5) * 2 * S.thickness * (1 - this.rr[i] * 0.5);
      this.sp[i] = 0.6 + (1 - this.rr[i]) * 1.1 + Math.random() * 0.25;
      this.rm[i] = 1; this.rmT[i] = 1;
      // 球形聚合目标（斐波那契球，均匀铺满）
      const y = 1 - (2 * (i + 0.5)) / N;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      this.sph[i * 3] = Math.cos(fib * i) * rad * 1.06;
      this.sph[i * 3 + 1] = y * 1.06;
      this.sph[i * 3 + 2] = Math.sin(fib * i) * rad * 1.06;
      // 颜色：内圈暖金 → 中段米白 → 外圈冰蓝
      const t = this.rr[i];
      const c = cIn.clone().lerp(cMid, clamp(t * 1.6, 0, 1)).lerp(cOut, clamp((t - 0.55) * 2.2, 0, 1));
      const v = 0.85 + Math.random() * 0.15;
      col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.pos = pos;
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.042, vertexColors: true, transparent: true, opacity: 0.88,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.scene.add(this.points);

    // ---- 行星 core + 大气辉光 ----
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x0f1a2a })
    );
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x1d6fb8, transparent: true, opacity: 0.16, side: THREE.BackSide })
    );
    this.scene.add(this.core, this.glow);

    this._resize();
    this.ready = true;
  }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height || !this.renderer) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.vw = r.width;
    this.vh = r.height;
  }

  /** 每帧更新：dt 秒，hand 为手部上下文（可 null），gesture 为当前手势名 */
  update(dt, hand, gesture) {
    if (!this.ready) return;
    const S = CONFIG.space;
    this._time += dt;

    // ---- 手势切换 ----
    if (gesture !== this._g) {
      if (this._g === "Thumb_Index" && this.morph === "sphere") this.morph = "ring";
      if (this._g === "Closed_Fist" && this.morph === "collapse") this.morph = "ring";
      if (this._g === "Victory" && this.morph === "split") this.morph = "ring";
      if (gesture === "Thumb_Index") this.morph = "sphere";
      if (gesture === "Closed_Fist") this.morph = "collapse";
      if (gesture === "Victory") this.morph = "split";
      if (gesture === "Thumb_Up") this._nova();
      this._g = gesture;
    }

    // ---- 相机与自旋：手掌位置/速度驱动 ----
    if (hand && this.vw) {
      const nx = hand.palm.x / this.vw, ny = hand.palm.y / this.vh;
      this.azimT = (nx - 0.5) * 2.6;
      this.polarT = gesture === "Pointing_Up" ? 0.16 : clamp(0.35 + ny * 1.05, 0.12, 1.5);
      const speed = Math.hypot(hand.vel.x, hand.vel.y);
      this.spinBoost += (Math.min(3.2, speed / 380) - this.spinBoost) * Math.min(1, dt * 3);
    }
    this.azim += (this.azimT - this.azim) * Math.min(1, dt * 3);
    this.polar += (this.polarT - this.polar) * Math.min(1, dt * 3);
    this.spinBoost *= Math.pow(0.5, dt); // 松手后缓慢回落

    const spin = (S.baseSpin * (1 + this.spinBoost)) * dt;
    const collapseK = this.morph === "collapse" ? 0.42 : 1;
    this.rmScale = this.rmScale === undefined ? 1 : this.rmScale;
    const rmScaleT = this.morph === "collapse" ? 0.42 : 1;
    this.rmScale += (rmScaleT - this.rmScale) * Math.min(1, dt * 4);

    const pos = this.pos;
    const k = this.morph === "sphere" ? Math.min(1, dt * 5.5) : Math.min(1, dt * 9);
    for (let i = 0; i < this.count; i++) {
      this.a[i] += spin * this.sp[i];
      // 半径倍率目标（分裂：内外双环）
      const rmT = this.morph === "split" ? (i % 2 ? 1.38 : 0.72) : 1;
      this.rm[i] += (rmT * this.rmScale - this.rm[i]) * Math.min(1, dt * 3.5);

      let tx, ty, tz;
      if (this.morph === "sphere") {
        tx = this.sph[i * 3]; ty = this.sph[i * 3 + 1]; tz = this.sph[i * 3 + 2];
      } else {
        const R = S.ringRadius * this.rr[i] ** 0.5 * 0.72 + 0.55; // 内密外疏
        tx = Math.cos(this.a[i]) * R * this.rm[i];
        tz = Math.sin(this.a[i]) * R * this.rm[i];
        ty = this.yy[i] * this.rmScale;
      }
      const i3 = i * 3;
      // 超新星冲量
      pos[i3] += this.nv[i3] * dt;
      pos[i3 + 1] += this.nv[i3 + 1] * dt;
      pos[i3 + 2] += this.nv[i3 + 2] * dt;
      const nk = Math.pow(0.12, dt);
      this.nv[i3] *= nk; this.nv[i3 + 1] *= nk; this.nv[i3 + 2] *= nk;
      // 弹簧式回归目标
      pos[i3] += (tx - pos[i3]) * k;
      pos[i3 + 1] += (ty - pos[i3 + 1]) * k;
      pos[i3 + 2] += (tz - pos[i3 + 2]) * k;
    }
    this.geo.attributes.position.needsUpdate = true;

    // ---- 相机 ----
    const R = 5.7;
    this.camera.position.set(
      Math.sin(this.azim) * Math.sin(this.polar) * R,
      Math.cos(this.polar) * R,
      Math.cos(this.azim) * Math.sin(this.polar) * R
    );
    this.camera.lookAt(0, 0, 0);
    this.points.rotation.x = 0.42 + Math.sin(this._time * 0.3) * 0.08; // 土星式倾角
    this.points.rotation.z = 0.24;
    // 捏合成星球时 core 稍微发亮
    const coreS = this.morph === "sphere" ? 1.12 : 1;
    this.core.scale.setScalar(coreS);
    this.glow.material.opacity = this.morph === "sphere" ? 0.28 : 0.16;
  }

  /** 超新星：全体粒子向外爆开（目标点不变，随后自动归位） */
  _nova() {
    const pos = this.pos;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      let x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      const d = Math.hypot(x, y, z) || 1;
      const s = 2.2 + Math.random() * 3.4;
      this.nv[i3] = (x / d) * s;
      this.nv[i3 + 1] = (y / d) * s;
      this.nv[i3 + 2] = (z / d) * s;
    }
  }

  render() {
    if (!this.ready) return;
    this.renderer.render(this.scene, this.camera);
  }
}
