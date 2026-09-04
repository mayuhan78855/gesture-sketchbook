// ============================================================
// effects.js —— 「手势 → 粒子效果」注册表（本项目最好玩、最值得改的文件）
//
// 添加一个新手势效果只需要 3 步：
//   1. 在下面的 EFFECTS 里加一个条目，键名用 MediaPipe 的手势名：
//      Open_Palm / Closed_Fist / Pointing_Up / Victory / Thumb_Up /
//      Thumb_Down / ILoveYou / Thumb_Index（捏合，由项目自定义检测）
//   2. 按需写三个钩子（都可省略）：
//        onEnter(hand, ps)  手势生效的瞬间触发一次
//        onFrame(hand, ps)  手势持续期间每帧调用（喷射/持续力场写这里）
//        onExit(hand, ps)   手势结束的瞬间触发一次
//   3. 保存并刷新页面——侧栏图例会自动更新，别的文件一行都不用改。
//
// hand 对象（由 app.js 组装）：
//   tip  食指尖像素坐标 {x,y}     palm  掌心像素坐标
//   mid  食指+中指尖中点          dir   食指指向的单位向量 {x,y}
//   vel  掌心移动速度 {x,y} px/s  size  手掌大小（0~1）
//   color 当前画笔颜色             landmarks 21 个关键点
// ps 对象（粒子系统）：
//   spawn({x,y,vx,vy,life,color,size,gravity,drag})
//   burst(x, y, n, {speed,life,size,color})
//   killAll(factor)   attractors / vortices 力场数组   count 当前粒子数
// ============================================================

import { CONFIG } from "./config.js";

export const EFFECTS = {
  Open_Palm: {
    label: "绘制流",
    en: "STREAM",
    hint: "指尖拖出发光粒子流",
    glyph: "M5 12 L5 7 M9 12 L9 5 M13 12 L13 5 M17 12 L17 7 M5 12 Q10 16 17 12 L17 10",
    onFrame(hand, ps) {
      for (let i = 0; i < CONFIG.particles.streamPerFrame; i++) {
        ps.spawn({
          x: hand.tip.x + (Math.random() - 0.5) * 8,
          y: hand.tip.y + (Math.random() - 0.5) * 8,
          vx: hand.vel.x * 0.55 + (Math.random() - 0.5) * 44,
          vy: hand.vel.y * 0.55 + (Math.random() - 0.5) * 44,
          life: 0.9 + Math.random() * 0.7,
          color: hand.color,
          size: 1.6 + Math.random() * 2.2,
          gravity: 24, drag: 0.94,
        });
      }
    },
  },

  Closed_Fist: {
    label: "能量爆发",
    en: "NOVA",
    hint: "从掌心爆发一圈粒子",
    glyph: "M6 9 Q7 6 12 6 Q17 6 18 9 L18 12 Q18 15 12 15 Q6 15 6 12 Z M7 10 L7 11",
    onEnter(hand, ps) {
      ps.burst(hand.palm.x, hand.palm.y, CONFIG.particles.burstCount, {
        color: hand.color, speed: [140, 470],
      });
    },
  },

  Pointing_Up: {
    label: "离子喷泉",
    en: "JET",
    hint: "指尖向上喷射粒子喷泉",
    glyph: "M10 14 L10 5 M10 5 Q10 3.4 11.4 3.4 Q12.8 3.4 12.8 5 L12.8 14 Q12.8 15.5 11.4 15.5 Q10 15.5 10 14 M8 18 L14 18",
    onFrame(hand, ps) {
      for (let i = 0; i < CONFIG.particles.fountainPerFrame; i++) {
        ps.spawn({
          x: hand.tip.x + (Math.random() - 0.5) * 5,
          y: hand.tip.y,
          vx: hand.dir.x * 240 + (Math.random() - 0.5) * 80,
          vy: hand.dir.y * 240 - 40 + (Math.random() - 0.5) * 50,
          life: 1.1 + Math.random() * 0.6,
          color: hand.color,
          size: 1.4 + Math.random() * 2,
          gravity: 170, drag: 0.985,
        });
      }
    },
  },

  Victory: {
    label: "量子涡流",
    en: "VORTEX",
    hint: "双指间生成旋转力场",
    glyph: "M8 18 L8 8 M8 8 Q8 6.5 9.3 6.5 Q10.6 6.5 10.6 8 L10.6 16 M14 18 L14 6 M14 6 Q14 4.5 15.2 4.5 Q16.4 4.5 16.4 6 L16.4 16",
    onEnter(hand, ps) {
      ps.vortices.push({ x: hand.mid.x, y: hand.mid.y, r: 230, strength: 1600 });
      // 撒一圈"星盘"种子粒子，让涡流一开始就有东西可转
      for (let i = 0; i < 130; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 190;
        ps.spawn({
          x: hand.mid.x + Math.cos(a) * r,
          y: hand.mid.y + Math.sin(a) * r,
          vx: 0, vy: 0,
          life: 2.2 + Math.random() * 1.2,
          color: hand.color, size: 1.5 + Math.random() * 1.6,
          gravity: 0, drag: 1,
        });
      }
    },
    onFrame(hand, ps) {
      const v = ps.vortices[0];
      if (v) { v.x = hand.mid.x; v.y = hand.mid.y; }
    },
    onExit(hand, ps) {
      ps.vortices.length = 0;
      ps.burst(hand.mid.x, hand.mid.y, 90, { color: hand.color, speed: [90, 260], life: [0.4, 0.9] });
    },
  },

  Thumb_Up: {
    label: "超新星清空",
    en: "SUPERNOVA",
    hint: "清空所有粒子并爆发",
    glyph: "M7 12 L7 6 M7 6 Q7 4.5 8.3 4.5 Q9.6 4.5 9.6 6 L9.6 12 M7 12 Q11 11 17 11.5 L17 14 Q17 16.5 13.5 16.5 L10 16.5",
    onEnter(hand, ps) {
      ps.killAll(0.15);
      ps.burst(hand.palm.x, hand.palm.y, CONFIG.particles.novaCount, {
        color: "#2dd8ff", speed: [220, 660], life: [0.6, 1.4], size: [1.4, 3],
      });
    },
  },

  Thumb_Index: {
    label: "引力奇点",
    en: "WELL",
    hint: "捏合产生引力点吸聚粒子",
    glyph: "M6 10 L10 14 M10 14 Q11.5 15.5 12 15.5 M12 4 L15 7 M15 7 Q16.5 8.5 16.5 9 M16.5 9 L20 13",
    onEnter(hand, ps) {
      ps.attractors.push({ x: hand.tip.x, y: hand.tip.y, r: 270, strength: 1400 });
    },
    onFrame(hand, ps) {
      const a = ps.attractors[0];
      if (a) { a.x = hand.tip.x; a.y = hand.tip.y; }
    },
    onExit(hand, ps) {
      ps.attractors.length = 0;
    },
  },
};
