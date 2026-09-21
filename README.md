# Warmup Lab

适用于无畏契约玩家的**非官方**网页对枪训练工具。围绕移动后首发、掩体出枪和动态对枪，提供可重复的训练场景与逐发反馈。

> 本项目为独立运行的训练软件，与 Riot Games 无任何关联；不使用拳头游戏的任何模型、贴图、音效、地图资产；不读取、不注入、不交互游戏进程。机制为可校准的近似模型，不承诺与游戏客户端完全一致。

## 技术栈

Vite + React + TypeScript + Three.js + Rapier + Dexie(IndexedDB)；测试 Vitest + Playwright；资产管线 Blender → GLB。

## 运行基线

首版仅支持 **Windows 桌面端 Chrome / Edge + 键鼠**。不满足要求的设备会看到设备要求提示页。

## 开发

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest 单元/集成测试
npm run test:e2e   # Playwright 端到端（需先安装浏览器，见下）
npm run build      # 生产构建 → dist/
```

Playwright 浏览器安装到项目外 D 盘目录（避免占用 C 盘）：

```bash
set PLAYWRIGHT_BROWSERS_PATH=D:\1\kimi1\.playwright
npx playwright install chromium
```

## 目录结构（开发手册固定）

```
src/
  app/         页面、导航、训练流程（含六态页面状态机）
  ui/          设置、准星、计时器、结算面板
  engine/      输入、时钟、相机、渲染、物理（TrainingSession 为 React 唯一通道）
  gameplay/    移动、武器、命中、机器人
  scenarios/   场景加载、训练规则、生成器（JSON 数据驱动地图）
  data/        参数版本、统计、本地存储（参数台账七字段 + 状态标注）
  assets/      资产清单和加载管理
public/assets/ 人物、地图、纹理、声音
```

## 参数台账规范

每一项游戏参数保存七个字段：数值、单位、适用武器、游戏版本、来源、核验日期、状态（官方公开 / 实验估计 / 训练假设 / 待校准）。未核验数据一律标记「待校准」，不作为开发常量写死。详见 `src/data/params/`。

## 许可证

MIT
