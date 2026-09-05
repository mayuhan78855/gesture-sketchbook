// ============================================================
// config.js -- 全部"可动手改"的参数都集中在这里
// 想改颜色 / 灵敏度 / 笔刷?改完保存,刷新页面即可生效。
// ============================================================

export const CONFIG = {
  // 画笔/粒子共用霓虹色板（适配深色画布）：第 1 个是默认色。练手任务：往数组里加一种你喜欢的颜色（任意 #RRGGBB）
  colors: ["#e8f6ff", "#2dd8ff", "#ff5d6c", "#ffb454", "#7b6cff"],

  // 笔刷粗细范围(像素):实际粗细随"手掌大小"自动变化,手掌离镜头越近笔触越粗
  strokeWidth: { min: 2.5, max: 16 },

  // 线条"能量抖动"强度:让霓虹笔迹带一点示波器的不规则感,调成 0 就是平滑直线
  jitter: 1.1,

  // 手部位置平滑系数(0~1):越大越稳、跟手越"黏";调小更灵敏但更抖
  smoothing: 0.55,

  // 手势置信度阈值:识别器给每个手势一个 0~1 的可信度,低于它算"没手势"
  gestureThreshold: 0.6,

  // 防抖帧数:连续 N 帧识别到同一手势才切换,防止手势闪烁造成误触
  stableFrames: 3,

  // "捏合"判定:拇指尖与食指尖的距离 / 手掌大小 < 此值 => 捏合(撤销一笔)
  pinchRatio: 0.045,
  pinchCooldownMs: 900,

  // 单笔最多点数:防止长时间作画时内存无限增长
  maxPointsPerStroke: 600,

  // 最多保留的笔画数:超出后丢弃最旧的
  maxStrokes: 500,

  // ---------- 粒子系统（粒子模式）----------
  particles: {
    max: 4200,             // 同屏最大粒子数（低配电脑调低到 2000）
    streamPerFrame: 6,     // 绘制流：每帧从指尖喷出的粒子数
    fountainPerFrame: 9,   // 离子喷泉：每帧喷射数
    burstCount: 240,       // 能量爆发：一次爆发的粒子数
    novaCount: 420,        // 超新星清空：爆发粒子数
    trailFade: 0.22,       // 拖影长度：越小尾巴越长
    gravity: 90,           // 默认重力（px/s²），个别效果可覆盖
    handDragRadius: 190,   // 掌风半径：手掌挥动带动周围粒子的范围
    handDragStrength: 0.35,// 掌风强度：动作驱动的力度
  },

  // ---------- 3D 星环（Three.js 模式）----------
  space: {
    count: 14000,        // 星环粒子数（低配电脑调低到 6000）
    ringRadius: 2.3,     // 星环基准半径
    thickness: 0.09,     // 星环厚度
    baseSpin: 0.5,       // 基础自旋速度（手掌挥动可加成 3 倍）
  },

  // ---------- 银河星旅（Three.js 模式）----------
  galaxy: {
    stars: 9000,         // 银河背景星数（低配电脑调低到 5000）
    travelDur: 2.2,      // 跃迁飞行时长（秒）
  },

  // MediaPipe 模型/wasm：已本地化在 vendor/ 目录（gestures.js 会优先加载本地，
  // 下面两个 CDN 地址仅作兜底）
  wasmCDN: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  modelURL: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
};

// 每个手势的中文名与作用(页面图例、提示都从这里读)
export const GESTURE_INFO = {
  Open_Palm:   { label: "张开手掌", hint: "绘制" },
  Closed_Fist: { label: "握拳",     hint: "切换颜色" },
  Pointing_Up: { label: "食指上指", hint: "构造线开关" },
  Victory:     { label: "剪刀手",   hint: "切换笔刷粗细" },
  Thumb_Up:    { label: "点赞",     hint: "清空画布" },
  Thumb_Index: { label: "捏合",     hint: "撤销一笔" },
  None:        { label: "无手势",   hint: "把手伸出来" },
};
