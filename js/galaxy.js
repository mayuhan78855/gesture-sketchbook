// ============================================================
// galaxy.js —— 银河星旅模式（Three.js）
// 螺旋星系粒子背景 + 七大行星悬浮其中，手部实时选择与跃迁：
//   张开手掌  银河全景视角随手掌轻微游移；光标（掌心）悬停哪颗行星，哪颗高亮
//   捏合      跃迁到选中的行星（穿越飞行），到达后环绕行星特写；再捏合返回全景
//   点赞      直接返回银河全景
//   握拳      银河旋转加速
//   剪刀手    时间迟缓（星流减速）
//   食指上指  拉高视角俯瞰银河旋臂
// Seven planets = 太阳系除地球外的七大行星。
// ============================================================

import { CONFIG } from "./config.js";

const PLANETS = [
  { name: "水星", en: "MERCURY", color: 0x9c8f84, r: 0.30, dist: 6.5,  y: 0.8,  blurb: "离太阳最近的疾行者" },
  { name: "金星", en: "VENUS",   color: 0xd9b47f, r: 0.46, dist: 8.4,  y: -0.6, blurb: "黎明与黄昏之星" },
  { name: "火星", en: "MARS",    color: 0xc25538, r: 0.38, dist: 10.0, y: 1.4,  blurb: "红色荒漠世界" },
  { name: "木星", en: "JUPITER", color: 0xc8a06e, r: 0.92, dist: 12.2, y: -1.2, blurb: "气态巨行星之王" },
  { name: "土星", en: "SATURN",  color: 0xd8bd8a, r: 0.78, dist: 14.4, y: 0.6,  blurb: "戴环的巨人", ring: true },
  { name: "天王星", en: "URANUS", color: 0x7fd4d9, r: 0.55, dist: 16.0, y: -1.6, blurb: "躺着自转的冰巨星" },
  { name: "海王星", en: "NEPTUNE", color: 0x4f7fe0, r: 0.52, dist: 17.6, y: 1.1,  blurb: "风暴与深蓝" },
];

// Three.js 加载：本地 vendor 优先（随仓库部署，离线可用），CDN 兑底
async function loadTHREEGalaxy() {
  let lastErr;
  for (const src of ["../vendor/three.module.js", "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "https://unpkg.com/three@0.160.0/build/three.module.js"]) {
    try { return await import(src); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const clampG = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

export class Galaxy3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.count = 0;
    this.state = "overview";   // overview | travel | arrived
    this.selected = null;      // 选中的行星（离光标最近）
    this.labels = [];          // 投影到屏幕的行星标记（给 2D HUD 画）
    this._g = "None";
    this._ang = 0;
    this._time = 0;
  }

  async init() {
    const THREE = await loadTHREEGalaxy();
    const G = CONFIG.galaxy;
    this.THREE = THREE; // 供 init 之外的方法使用（Vector3 等）
    this.THREE = THREE;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 300);
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    this._zero = new THREE.Vector3(0, 0, 0);

    // 灯光：让行星有明暗立体感
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.35);
    sun.position.set(-6, 9, 4);
    this.scene.add(sun);

    // ---- 银河系粒子背景：3 条旋臂 + 中心核球 + 零散晕星 ----
    const N = G.stars;
    this.count = N;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const cCore = new THREE.Color("#ffd9a0"), cArmA = new THREE.Color("#cfe2ff"), cArmB = new THREE.Color("#ffb4c8"), cHalo = new THREE.Color("#8fa3c8");
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    for (let i = 0; i < N; i++) {
      let x, y, z, c;
      if (i < N * 0.09) {
        // 中心核球：暖色密集
        const r = Math.pow(Math.random(), 1.6) * 5.5 + 0.4;
        const a = Math.random() * Math.PI * 2;
        x = Math.cos(a) * r; z = Math.sin(a) * r * 0.72; y = gauss() * 1.1;
        c = cCore;
      } else if (i < N * 0.88) {
        // 旋臂：对数螺旋 + 横向散布
        const arm = i % 3;
        const r = 4 + Math.pow(Math.random(), 0.6) * 52;
        const spread = 0.16 + 6 / (r + 4);
        const a = arm * (Math.PI * 2 / 3) + Math.log(r + 1) * 1.9 + gauss() * spread;
        x = Math.cos(a) * r + gauss() * 1.4;
        z = Math.sin(a) * r + gauss() * 1.4;
        y = gauss() * 1.3 * (1 - r / 70);
        c = Math.random() < 0.78 ? cArmA : cArmB;
      } else {
        // 晕星：大范围稀疏
        const r = 20 + Math.random() * 60;
        const a = Math.random() * Math.PI * 2;
        const b = (Math.random() - 0.5) * Math.PI;
        x = Math.cos(a) * Math.cos(b) * r; z = Math.sin(a) * Math.cos(b) * r; y = Math.sin(b) * r * 0.6;
        c = cHalo;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const v = 0.7 + Math.random() * 0.3;
      col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sgeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.galaxyPoints = new THREE.Points(sgeo, new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.scene.add(this.galaxyPoints);

    // ---- 太阳：1400 颗金色粒子聚成的发光恒星（自转 + 脉动）----
    const SN = 1400;
    const sunPos = new Float32Array(SN * 3);
    const sunCol = new Float32Array(SN * 3);
    const cHot = new THREE.Color("#fff3c4"), cMid = new THREE.Color("#ffd25c"), cEdge = new THREE.Color("#ff9a3c");
    for (let i = 0; i < SN; i++) {
      // 中心密集、边缘稀疏的球体分布
      const rr = Math.pow(Math.random(), 1.8) * 1.12;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      sunPos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      sunPos[i * 3 + 1] = rr * Math.cos(ph);
      sunPos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
      const c = cHot.clone().lerp(cMid, clampG(rr / 1.12, 0, 1)).lerp(cEdge, clampG(Math.max(0, rr - 0.7) / 0.42, 0, 1));
      sunCol[i * 3] = c.r; sunCol[i * 3 + 1] = c.g; sunCol[i * 3 + 2] = c.b;
    }
    const sunGeo = new THREE.BufferGeometry();
    sunGeo.setAttribute("position", new THREE.BufferAttribute(sunPos, 3));
    sunGeo.setAttribute("color", new THREE.BufferAttribute(sunCol, 3));
    this.sun = new THREE.Points(sunGeo, new THREE.PointsMaterial({
      size: 0.055, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd25c, transparent: true, opacity: 0.22, side: THREE.BackSide })
    );
    this.scene.add(this.sun, this.sunHalo);

    // ---- 行星轨道线：淡淡的圆环，让“行星绕太阳”一眼可读 ----
    for (const p of PLANETS) {
      const orbit = new THREE.Mesh(
        new THREE.RingGeometry(p.dist - 0.03, p.dist + 0.03, 96),
        new THREE.MeshBasicMaterial({ color: 0x2dd8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
      );
      orbit.rotation.x = Math.PI / 2;
      orbit.position.y = p.y;
      this.scene.add(orbit);
    }

    // ---- 七大行星 ----
    this.planets = PLANETS.map((p, i) => {
      const ang = i * 2.399963 + 0.7;
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, 28, 20),
        new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.75, metalness: 0.05 })
      );
      group.add(mesh);
      if (p.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.r * 1.45, p.r * 2.3, 48),
          new THREE.MeshBasicMaterial({ color: 0xd8bd8a, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
        );
        ring.rotation.x = Math.PI / 2.35;
        group.add(ring);
      }
      const px = Math.cos(ang) * p.dist, pz = Math.sin(ang) * p.dist, py = p.y;
      group.position.set(px, py, pz);
      this.scene.add(group);
      return { ...p, mesh, group, pos: new THREE.Vector3(px, py, pz) };
    });

    this._resize();
    this.camera.position.set(0, 7.5, 14.5);
    this.camera.lookAt(0, 0, 0);
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

  /** 跃迁到某颗行星 */
  _travelTo(planet) {
    this.state = "travel";
    this._arrivedPlanet = planet;
    this._from = this.camera.position.clone();
    this._fromLook = this.lookTarget.clone();
    const dir = this.camera.position.clone().sub(planet.pos).normalize();
    this._to = planet.pos.clone().add(dir.multiplyScalar(planet.r * 3.6)).add(new this.THREE.Vector3(0, planet.r * 1.1, 0));
    this._toLook = planet.pos.clone();
    this._travelP = 0;
    this._orbitAng = Math.random() * Math.PI * 2;
  }

  /** 返回银河全景 */
  _returnOverview() {
    this.state = "travel";
    this._arrivedPlanet = null;
    this._from = this.camera.position.clone();
    this._fromLook = this.lookTarget.clone();
    this._to = new this.THREE.Vector3(0, 7.5, 14.5);
    this._toLook = new this.THREE.Vector3(0, 0, 0);
    this._travelP = 0;
  }

  update(dt, hand, gesture) {
    if (!this.ready) return;
    const G = CONFIG.galaxy;
    this._time += dt;

    // ---- 手势切换 ----
    if (gesture !== this._g) {
      if (gesture === "Thumb_Index") {
        if (this.state === "overview") {
          const sel = this.planets.find((p) => p.name === this.selected) || this.planets[3];
          this._travelTo(sel);
        } else if (this.state === "arrived") {
          this._returnOverview();
        }
      }
      if (gesture === "Thumb_Up" && this.state !== "overview" && this.state !== "travel") this._returnOverview();
      this._g = gesture;
    }

    // ---- 银河旋转：握拳加速 / 剪刀手迟缓 ----
    const spinMul = gesture === "Closed_Fist" ? 6 : gesture === "Victory" ? 0.15 : 1;
    this.galaxyPoints.rotation.y += dt * 0.008 * spinMul;

    // ---- 状态机 ----
    if (this.state === "travel") {
      this._travelP = Math.min(1, this._travelP + dt / G.travelDur);
      const e = smooth(this._travelP);
      this.camera.position.lerpVectors(this._from, this._to, e);
      this.lookTarget.lerpVectors(this._fromLook, this._toLook, e);
      this.camera.lookAt(this.lookTarget);
      if (this._travelP >= 1) {
        this.state = this._arrivedPlanet ? "arrived" : "overview";
      }
    } else if (this.state === "arrived") {
      // 到达后：环绕行星缓慢特写
      const p = this._arrivedPlanet;
      this._orbitAng += dt * 0.14;
      const d = p.r * 3.6;
      this.camera.position.set(
        p.pos.x + Math.cos(this._orbitAng) * d,
        p.pos.y + p.r * 1.15,
        p.pos.z + Math.sin(this._orbitAng) * d
      );
      this.lookTarget.copy(p.pos);
      this.camera.lookAt(p.pos);
    } else {
      // 全景：视角随手掌游移；食指上指拉高俯瞰
      let azim = this._ang, height = 7.5, radius = 14.5;
      if (hand && this.vw) {
        const nx = hand.palm.x / this.vw;
        azim += (nx - 0.5) * 1.1;
        if (gesture === "Pointing_Up") { height = 13.5; radius = 9.5; }
        else height = 6.8 + (1 - hand.palm.y / this.vh) * 2.4;
      }
      this._ang += dt * 0.02;
      this.camera.position.set(Math.sin(azim) * radius, height, Math.cos(azim) * radius);
      this.lookTarget.lerp(this._zero, Math.min(1, dt * 3));
      this.camera.lookAt(this.lookTarget);
    }

    // ---- 太阳自转与脉动 ----
    this.sun.rotation.y += dt * 0.12;
    const pulse = 1 + Math.sin(this._time * 2.2) * 0.05;
    this.sunHalo.scale.setScalar(pulse);
    this.sunHalo.material.opacity = 0.2 + Math.sin(this._time * 2.2) * 0.05;

    // ---- 行星标签投影（2D HUD 用）----
    this.labels = this.planets.map((p) => {
      const v = p.pos.clone().project(this.camera);
      return {
        name: p.name, en: p.en, blurb: p.blurb,
        x: (v.x * 0.5 + 0.5) * this.vw,
        y: (-v.y * 0.5 + 0.5) * this.vh,
        visible: v.z < 1 && this.state === "overview",
      };
    });
    // 光标（掌心）最近的可控行星 = 选中
    if (hand && this.vw && this.state === "overview") {
      let best = null, bs = 1e9;
      for (const l of this.labels) {
        if (!l.visible) continue;
        // 驻留偏置：当前选中的行星额外减 55px 距离，防止光标抖动导致标签闪烁
        const d = Math.hypot(l.x - hand.palm.x, l.y - hand.palm.y) - (l.name === this.selected ? 55 : 0);
        if (d < bs) { bs = d; best = l; }
      }
      if (best) { best.selected = true; this.selected = best.name; }
    }
  }

  render() {
    if (!this.ready) return;
    this.renderer.render(this.scene, this.camera);
  }
}

