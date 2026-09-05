// ============================================================
// gestures.js —— 手势识别引擎
// 职责：打开摄像头 -> 跑 MediaPipe GestureRecognizer -> 输出
//       { landmarks: 21个手部关键点, gesture: 手势名, ... }
// 所有识别都在浏览器本地完成，视频帧不会离开这台电脑。
// ============================================================

import { CONFIG, GESTURE_INFO } from "./config.js";
// MediaPipe 识别库不在这里静态导入——改为开摄像头时懒加载（见 start()），
// 这样演示模式/粒子模式在断网环境下也能正常运行，不依赖 CDN。

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 把 navigator.mediaDevices 的报错翻译成给新手的友好提示
export function cameraErrorMessage(err) {
  const name = err && err.name ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      title: "摄像头权限被拒绝了",
      tips: [
        "点击浏览器地址栏左侧的锁形/摄像头图标，把摄像头权限改为「允许」",
        "如果找不到入口，在地址栏输入 chrome://settings/content/camera 检查权限",
        "修改权限后点击下方「重试摄像头」即可，无需重启页面",
      ],
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      title: "没有检测到摄像头",
      tips: [
        "检查摄像头是否插好、是否被物理开关关闭",
        "确认没有其他应用（如 Zoom、OBS）占用着摄像头",
        "接入摄像头后点击「重试摄像头」",
      ],
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      title: "摄像头被其他程序占用了",
      tips: [
        "关闭正在使用摄像头的程序（视频会议、直播、录制软件等）",
        "关闭后点击「重试摄像头」",
      ],
    };
  }
  return {
    title: "摄像头启动失败",
    tips: ["浏览器版本过旧？请更新到最新版 Chrome/Edge", "也可以先点「演示模式」体验完整功能"],
  };
}

export class GestureEngine {
  /** @param {HTMLVideoElement} video @param {{onFrame:Function,onGesture:Function,onStatus:Function,onError:Function}} cb */
  constructor(video, cb) {
    this.video = video;
    this.cb = cb;
    this.recognizer = null;
    this.smooth = null;      // 平滑后的 21 个关键点
    this.gesture = "None";   // 已生效手势（防抖后）
    this.confidence = 0;
    this._stable = 0;        // 防抖计数
    this.handSize = 0;       // 手掌大小（归一化）
    this.latencyMs = 0;      // 单帧识别耗时
    this._lastPinchAt = 0;
    this._raf = 0;
    this._destroyed = false;
    this.started = false;
  }

  async start() {
    if (this.started) return true;
    // ---- 1. 打开摄像头 ----
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      this.cb.onError(cameraErrorMessage(err));
      return false;
    }
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
    this.cb.onStatus("摄像头已开启，正在加载识别模型…", "loading");

    // ---- 2. 加载 MediaPipe 模型（懒加载 CDN 库，网络抖动自动重试；GPU 失败降级 CPU）----
    const loadLib = async () => {
      let lib = null;
      for (let i = 0; i < 3; i++) {
        try {
          lib = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");
          break;
        } catch (e) { lib = null; await new Promise((r) => setTimeout(r, 1500)); }
      }
      if (!lib) throw new Error("vision_bundle 加载失败");
      return lib;
    };
    try {
      const lib = await loadLib();
      const vision = await lib.FilesetResolver.forVisionTasks(CONFIG.wasmCDN);
      this.recognizer = await this._create(lib, vision, "GPU");
    } catch (e) {
      try {
        const lib = await loadLib();
        const vision = await lib.FilesetResolver.forVisionTasks(CONFIG.wasmCDN);
        this.recognizer = await this._create(lib, vision, "CPU");
      } catch (e2) {
        this.cb.onError({
          title: "手势识别模型加载失败",
          tips: [
            "首次使用需要联网下载模型（约 8MB），检查网络后重试",
            "也可以先点「演示模式」体验完整功能",
          ],
        });
        return false;
      }
    }
    this.cb.onStatus("已就绪 · 伸出手掌试试", "ok");
    this.started = true;
    this._loop();
    return true;
  }

  _create(lib, vision, delegate) {
    return lib.GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath: CONFIG.modelURL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  _loop() {
    if (this._destroyed) return;
    const v = this.video;
    if (this.recognizer && v.readyState >= 2 && v.currentTime > 0) {
      const t0 = performance.now();
      let res = null;
      try {
        res = this.recognizer.recognizeForVideo(v, v.currentTime * 1000);
      } catch (e) { /* 单帧失败忽略，下一帧继续 */ }
      this.latencyMs = performance.now() - t0;
      if (res) this._handle(res);
    }
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _handle(res) {
    const lm = res.landmarks && res.landmarks[0];
    const g = res.gestures && res.gestures[0] && res.gestures[0][0];
    let gesture = g ? g.categoryName : "None";
    let conf = g ? g.score : 0;

    // 置信度低于阈值 => 视为无手势
    if (conf < CONFIG.gestureThreshold) gesture = "None";

    // ---- 关键点平滑：指数平滑，消除手抖 ----
    if (lm) {
      if (!this.smooth) this.smooth = lm.map((p) => ({ x: p.x, y: p.y }));
      for (let i = 0; i < lm.length; i++) {
        this.smooth[i].x += (lm[i].x - this.smooth[i].x) * CONFIG.smoothing;
        this.smooth[i].y += (lm[i].y - this.smooth[i].y) * CONFIG.smoothing;
      }
    } else {
      this.smooth = null;
    }

    // 手掌大小 = 手腕(0)到中指根(9)的距离（归一化）
    this.handSize = this.smooth ? dist(this.smooth[0], this.smooth[9]) : 0;

    // ---- 自定义手势：捏合（拇指尖 4 与食指尖 8 距离）----
    let pinch = false;
    if (this.smooth && this.handSize > 0.001) {
      const d = dist(this.smooth[4], this.smooth[8]);
      pinch = d / this.handSize < CONFIG.pinchRatio;
    }
    if (pinch) gesture = "Thumb_Index";

    // ---- 防抖：连续 N 帧同一手势才生效 ----
    if (gesture !== this.gesture) {
      this._stable++;
      if (this._stable >= CONFIG.stableFrames) {
        this.gesture = gesture;
        this.confidence = conf;
        this._stable = 0;
        if (gesture === "Thumb_Index") {
          const now = performance.now();
          if (now - this._lastPinchAt < CONFIG.pinchCooldownMs) {
            this.gesture = "None"; // 冷却期内不重复触发撤销
          } else {
            this._lastPinchAt = now;
            this.cb.onGesture("Thumb_Index", conf);
          }
        } else if (gesture !== "None") {
          this.cb.onGesture(gesture, conf);
        }
      }
    } else {
      this._stable = 0;
    }

    this.cb.onFrame({
      landmarks: this.smooth ? this.smooth.map((p) => ({ x: p.x, y: p.y })) : null,
      gesture: this.gesture,
      confidence: this.confidence,
      size: this.handSize,
      latencyMs: this.latencyMs,
    });
  }

  stop() {
    this._destroyed = true;
    this.started = false;
    cancelAnimationFrame(this._raf);
    const s = this.video.srcObject;
    if (s) s.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }
}
