/**
 * React 与训练引擎之间的唯一通道（开发手册 §三）。
 * React 只发送命令并订阅低频统计（≤250ms 聚合一次）；
 * 引擎内部高频状态（位置、速度、姿态）禁止进入 React 树。
 */
export interface TrainingSession {
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  dispose(): void;
}

/** 低频聚合统计，由引擎每 250ms 推送给 React */
export interface SessionStats {
  /** 已模拟时间（单调时钟，秒） */
  simTimeSec: number;
  shotsFired: number;
  hits: number;
  /** 当前帧时间（ms），用于性能观察 */
  frameMs: number;
}

export type StatsListener = (stats: SessionStats) => void;
