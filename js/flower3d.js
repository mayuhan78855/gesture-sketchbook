// ============================================================
// flower3d.js —— 3D 点云花朵扫描仪（flower 独立页专用）
// Three.js 点云花（花瓣/茎/叶）+ 几何扫描笼 + 扫描平面横扫；
// 手势驱动：张手召唤/手腕转=旋转/手远近=缩放/捏合悬停=扫描/握拳重置。
// 单 rAF 循环；LOWEND 自动减半；dispose() 释放全部 GPU 资源。
// ============================================================

async function loadTHREEFlower() {
  let lastErr = null;
  for (const src of ["../vendor/three.module.js", "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"]) {
    try { return await import(src); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("three 加载失败");
}

const clampF = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothF = (t) => t * t * (3 - 2 * t);

export class Flower3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts; // 由 app.js 传入的共享对象（滑杆实时改这里）
    if (this.opts.scaleMin === undefined) this.opts.scaleMin = 0.6;
    if (this.opts.scaleMax === undefined) this.opts.scaleMax = 1.6;
    if (this.opts.sensitivity === undefined) this.opts.sensitivity = 1;
    if (this.opts.moveSpeed === undefined) this.opts.moveSpeed = 1;
    if (this.opts.forceScan === undefined) this.opts.forceScan = false;
    this.ready = false;
    this.state = "idle";
    this.stateText = "AWAITING GESTURE — Open Right Hand to Summon";
    this.count = 0;
    this.fade = 0;          // 点云整体淡入 0..1
    this.reveal = 0;        // 逐层显现进度 0..1
    this.cage = 0.25;       // 扫描笼展开 0.25..1
    this.rotY = 0;          // 花的朝向（手腕控制）
    this.scale = 1;
    this.scanT = 0;         // 扫描平面相位
    this.scanning = false;
    this._g = "None";
    this._time = 0;
    this.pos = { x: 0, y: 0 };
  }

  async init() {
    if (this.ready) return;
    const THREE = await loadTHREEFlower();
    this.THREE = THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    this.camera.position.set(0, 0.35, 4.1);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0x99aacc, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(2, 4, 3);
    this.scene.add(dl);

    // ---- 点云花：花瓣 / 花芯 / 花茎 / 叶 ----
    const LOW = (navigator.hardwareConcurrency || 4) <= 4;
    const per = LOW ? 650 : 1300;      // 每片花瓣粒子
    const total = LOW ? Math.round(11000 / 2) : 11000;
    const group = new THREE.Group();
    const pts = [];
    const cols = [];
    const reveal = [];                  // 逐层显现顺序（0=最先，1=最后）
    const push = (x, y, z, r, g, b, rev) => { pts.push(x, y, z); cols.push(r, g, b); reveal.push(rev); };

    // 花瓣：8 片放射状 3D 杯状粒子簇（叶形宽度 + 边缘上卷 + 整体向相机鼓起，呈立体绽放）
    const PET = 8;
    for (let k = 0; k < PET; k++) {
      const baseA = k * ((Math.PI * 2) / PET) + 0.12;
      const ca = Math.cos(baseA), sa = Math.sin(baseA);
      for (let i = 0; i < per; i++) {
        const u = Math.pow(Math.random(), 0.6);                 // 沿花瓣 0..1（根→尖）
        const half = 0.32 * Math.sin(Math.PI * Math.min(1, u)) * (0.3 + 0.7 * u); // 叶形：根窄→中宽→尖收
        const w = (Math.random() * 2 - 1) * half;               // 横向 -1..1
        const reach = 0.13 + u * 1.5;                            // 径向伸出
        // 杯状几何：横向边缘上卷、尖端微后卷、整体向相机(+Z)鼓起成穹顶
        const cup = w * w * 0.85;
        const tip = u * u * 0.42;
        const dome = u * 0.35;
        const x = ca * reach - sa * w;
        const y = sa * reach + ca * w;
        const z = cup + tip + dome + (Math.random() - 0.5) * 0.05;
        // 颜色：根浅粉 → 中玫瑰 → 边缘深玫红（对齐参考视频：粉玫瑰系，非紫蓝）
        const hue = 348 - u * 28;
        const sat = 62 + u * 22;
        const lig = 84 - u * 24 - Math.abs(w) * 10 - (Math.random() - 0.5) * 5;
        const c = new THREE.Color(`hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${clampF(lig, 44, 92).toFixed(0)}%)`);
        const rev = 0.05 + u * 0.55 + Math.random() * 0.05;     // 逐层显现顺序
        push(x, y, z, c.r, c.g, c.b, clampF(rev, 0, 1));
      }
    }
    // 花芯：金色密簇
    for (let i = 0; i < (LOW ? 260 : 520); i++) {
      const r = Math.pow(Math.random(), 0.5) * 0.2;
      const a = Math.random() * Math.PI * 2;
      const c = new THREE.Color(Math.random() < 0.3 ? "#ffe8c4" : "#ffb347");
      push(Math.cos(a) * r, Math.sin(a) * r, 0.06 + Math.random() * 0.08, c.r, c.g, c.b, Math.random() * 0.1);
    }
    // 花茎：沿曲线采样的点（绿）
    const stemN = LOW ? 450 : 900;
    for (let i = 0; i < stemN; i++) {
      const t = i / stemN;
      const x = 0.22 * Math.sin(t * 2.4) + (Math.random() - 0.5) * 0.03;
      const y = -0.25 - t * 1.75;
      const z = 0.12 * Math.sin(t * 3.1) + (Math.random() - 0.5) * 0.03;
      const c = new THREE.Color(`hsl(${(78 + Math.random() * 22).toFixed(0)}, 46%, ${(26 + t * 20).toFixed(0)}%)`);
      push(x, y, z, c.r, c.g, c.b, 0.7 + t * 0.3);
    }
    // 叶：两片椭圆点云
    for (const [tt, side] of [[0.42, 1], [0.68, -1]]) {
      const n = LOW ? 175 : 350;
      const sy = -0.25 - tt * 1.75;
      for (let i = 0; i < n; i++) {
        const u = Math.random() * Math.PI * 2;
        const er = Math.sqrt(Math.random());
        const lx = Math.cos(u) * 0.52 * er;
        const lz = Math.sin(u) * 0.16 * er;
        const ly = sy + side * 0.12 + Math.sin(u) * 0.1 * er;
        const c = new THREE.Color(`hsl(${(82 + Math.random() * 25).toFixed(0)}, 50%, ${(28 + Math.random() * 16).toFixed(0)}%)`);
        push(lx + 0.3 * side, ly, lz, c.r, c.g, c.b, 0.75 + Math.random() * 0.2);
      }
    }

    const geo = new THREE.BufferGeometry();
    this.baseCol = new Float32Array(cols);
    this.revealArr = new Float32Array(reveal);
    this.count = pts.length / 3;
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cols), 3));
    this.flowerGeo = geo;
    this.flowerMat = new THREE.PointsMaterial({
      size: 0.026, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.flower = new THREE.Points(geo, this.flowerMat);
    group.add(this.flower);
    this.flowerGroup = group;
    this.scene.add(group);

    // ---- 几何扫描笼：八面体线框 + 方形底环，缓慢自转 ----
    const cage = new THREE.Group();
    const oct = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.0, 0)),
      new THREE.LineBasicMaterial({ color: 0x2dd8ff, transparent: true, opacity: 0.22 })
    );
    cage.add(oct);
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.2, 1.2)),
      new THREE.LineBasicMaterial({ color: 0x2dd8ff, transparent: true, opacity: 0.13 })
    );
    cage.add(box);
    this.cageGroup = cage;
    this.scene.add(cage);

    // ---- 扫描平面：半透明青色矩形，沿 Z 往复横扫 ----
    this.scanPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ color: 0x2dd8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    this.scene.add(this.scanPlane);

    this._resize();
    this.ready = true;
  }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height || !this.renderer) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.vw = r.width; this.vh = r.height;
  }

  /** 点云显隐：reveal 控制逐层显现；扫描平面附近临时提亮 */
  _applyColors(scanning) {
    const col = this.flowerGeo.attributes.color.array;
    const pos = this.flowerGeo.attributes.position.array;
    const planeZ = this.scanPlane.position.z;
    for (let i = 0; i < this.count; i++) {
      const rev = this.revealArr[i];
      let f = this.reveal >= rev ? 1 : 0.06;
      let boost = 1;
      if (scanning) {
        const dz = Math.abs(pos[i * 3 + 2] - planeZ);
        boost = 1 + 2.4 * Math.max(0, 1 - dz / 0.3);
      }
      col[i * 3] = this.baseCol[i * 3] * f * boost;
      col[i * 3 + 1] = this.baseCol[i * 3 + 1] * f * boost;
      col[i * 3 + 2] = this.baseCol[i * 3 + 2] * f * boost;
    }
    this.flowerGeo.attributes.color.needsUpdate = true;
  }

  update(dt, hand, gesture) {
    if (!this.ready) return;
    this._time += dt;
    const S = this.opts;

    // ---- 手势状态机 ----
    if (gesture !== this._g) {
      if (gesture === "Open_Palm" && (this.state === "idle" || this.state === "resetting")) {
        this.state = "summoning"; this.reveal = Math.max(this.reveal, 0.02); this.cage = 0.25;
      }
      if (gesture === "Closed_Fist" && this.state !== "idle") {
        this.state = "resetting"; this.scanning = false;
      }
      this._g = gesture;
    }
    this.scanning = (gesture === "Thumb_Index" || this.opts.forceScan) && (this.state === "active" || this.state === "summoning");

    // ---- 手驱动：旋转 / 缩放 / 平移 ----
    if (hand && this.vw) {
      const lm = hand.landmarks;
      if (lm) {
        const dx = lm[9].x - lm[0].x, dy = lm[9].y - lm[0].y;
        const roll = Math.atan2(dx, -dy) * S.sensitivity; // 手腕方向 → 花的朝向
        this.rotY += (roll - this.rotY) * Math.min(1, dt * 2.6);
      }
      const sT = S.scaleMin + clampF((hand.size - 0.12) / 0.3, 0, 1) * (S.scaleMax - S.scaleMin);
      this.scale += (sT - this.scale) * Math.min(1, dt * 3.5);
      this.pos.x += ((hand.palm.x / this.vw - 0.5) * 1.5 * S.moveSpeed - this.pos.x) * Math.min(1, dt * 2.5);
      this.pos.y += (-(hand.palm.y / this.vh - 0.5) * 0.9 * S.moveSpeed - this.pos.y) * Math.min(1, dt * 2.5);
    }

    // ---- 状态推进 ----
    if (this.state === "summoning") {
      this.reveal = Math.min(1, this.reveal + dt * 0.85);
      this.fade = Math.min(1, this.fade + dt * 1.4);
      this.cage = 0.25 + smoothF(Math.min(1, this.fade)) * 0.75;
      if (this.reveal >= 1 && this.fade >= 1) { this.state = "active"; this.stateText = "ACTIVE"; }
      else this.stateText = "SUMMONING";
    } else if (this.state === "resetting") {
      this.reveal = Math.max(0, this.reveal - dt * 1.6);
      this.fade = Math.max(0, this.fade - dt * 1.8);
      this.cage = 0.25 + this.fade * 0.75;
      if (this.fade <= 0.01) { this.state = "idle"; this.stateText = "AWAITING GESTURE — Open Right Hand to Summon"; }
      else this.stateText = "RESETTING";
    } else if (this.state === "active") {
      this.stateText = this.scanning ? "SCANNING" : "ACTIVE";
    }

    // ---- 应用变换 ----
    this.flowerGroup.rotation.y = this.rotY + Math.sin(this._time * 0.5) * 0.06;
    this.flowerGroup.rotation.x = -0.42 + Math.sin(this._time * 0.4) * 0.04; // 略后仰，呈立体绽放（宽扁视角）
    this.flowerGroup.position.set(this.pos.x, this.pos.y + 0.12, 0);
    const sc = this.scale * (0.55 + 0.45 * this.fade);
    this.flowerGroup.scale.setScalar(sc);
    this.cageGroup.position.set(this.pos.x, this.pos.y, 0);
    this.cageGroup.scale.setScalar(this.cage * this.scale * 0.55);
    this.cageGroup.rotation.y += dt * 0.35;
    this.cageGroup.rotation.x = Math.sin(this._time * 0.4) * 0.15;
    this.scanPlane.position.z = Math.sin(this.scanT) * 1.25;
    this.scanPlane.rotation.z += dt * 0.6;
    this.scanPlane.visible = this.scanning || this.state === "summoning";
    if (this.scanning) this.scanT += dt * 3.2;
    this._applyColors(this.scanning);
  }

  render() {
    if (!this.ready) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ready = false;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    if (this.renderer) this.renderer.dispose();
  }

  /** 上传点云（XYZ：x y z [r g b]，或 PLY ascii）：替换花点云并居中归一化 */
  loadPointCloud(text) {
    const THREE = this.THREE;
    const pos = [], col = [];
    const lines = text.split(/\r?\n/);
    let isPly = false, header = false, vCount = 0, read = 0;
    for (const raw of lines) {
      const s = raw.trim();
      if (!s) continue;
      if (/^ply/i.test(s)) { isPly = true; continue; }
      if (isPly && /^format ascii/i.test(s)) { header = true; continue; }
      if (isPly && /^element vertex (\d+)/i.test(s)) { vCount = parseInt(RegExp.$1); continue; }
      if (isPly && /^end_header/i.test(s)) { header = true; continue; }
      if (isPly && !header) continue;
      const f = s.split(/\s+/).map(Number);
      if (f.length >= 3 && f.every((v) => !isNaN(v))) {
        pos.push(f[0], f[1], f[2]);
        if (f.length >= 6) col.push(f[3] / 255, f[4] / 255, f[5] / 255);
        else col.push(0.8, 0.85, 1);
        read++;
        if (isPly && vCount && read >= vCount) break;
      }
    }
    if (!pos.length) return false;
    // 居中 + 归一化到 ~2.2
    let cx = 0, cy = 0, cz = 0;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
    let maxR = 0.001;
    for (let i = 0; i < n; i++) {
      pos[i * 3] -= cx; pos[i * 3 + 1] -= cy; pos[i * 3 + 2] -= cz;
      maxR = Math.max(maxR, Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    }
    const s = 2.2 / maxR;
    for (let i = 0; i < n * 3; i++) pos[i] *= s;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    this.flowerGeo.dispose();
    this.flowerGeo = geo;
    this.flower.geometry = geo;
    this.baseCol = new Float32Array(col);
    this.revealArr = new Float32Array(n); // 上传点云直接全显现
    this.reveal = 1;
    this.fade = 1;
    if (this.state === "idle") { this.state = "active"; this.stateText = "ACTIVE"; }
    this.count = n;
    return true;
  }
}
