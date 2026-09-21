/**
 * 固定步长主循环（开发手册 §6.1）：
 * - requestAnimationFrame 驱动渲染；
 * - 物理/模拟固定 120 Hz（工程设定，非声称模拟官方服务器）；
 * - 帧间插值显示，保证不同刷新率下移动速度一致；
 * - 后台/卡顿恢复时丢弃累积时间，避免瞬间执行大量模拟步（§6.4）。
 */

export const SIM_STEP_SEC = 1 / 120;
/** 单帧最多补偿的模拟时间，超过则丢弃（切后台恢复保护） */
const MAX_FRAME_SEC = 0.1;

export interface FixedLoopCallbacks {
  /** 固定步长模拟，step 恒为 SIM_STEP_SEC */
  simulate(stepSec: number): void;
  /** 渲染，alpha ∈ [0,1) 为插值系数 */
  render(alpha: number): void;
}

export class FixedStepLoop {
  private rafId: number | null = null;
  private lastTimeMs: number | null = null;
  private accumulator = 0;
  private readonly cb: FixedLoopCallbacks;

  constructor(cb: FixedLoopCallbacks) {
    this.cb = cb;
  }

  get running(): boolean {
    return this.rafId !== null;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTimeMs = null;
    this.accumulator = 0;
    const tick = (nowMs: number) => {
      this.rafId = requestAnimationFrame(tick);
      if (this.lastTimeMs === null) {
        this.lastTimeMs = nowMs;
        return;
      }
      let frameSec = (nowMs - this.lastTimeMs) / 1000;
      this.lastTimeMs = nowMs;
      if (frameSec > MAX_FRAME_SEC) frameSec = MAX_FRAME_SEC; // 卡顿/后台恢复保护
      this.accumulator += frameSec;
      while (this.accumulator >= SIM_STEP_SEC) {
        this.cb.simulate(SIM_STEP_SEC);
        this.accumulator -= SIM_STEP_SEC;
      }
      this.cb.render(this.accumulator / SIM_STEP_SEC);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimeMs = null;
    this.accumulator = 0;
  }
}
