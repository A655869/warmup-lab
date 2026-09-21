/**
 * 射击误差模型（手册 §10.3）：
 * 区分基础散布、移动误差、连续射击误差和后坐，四者独立实现；
 * 组合方式以实验验证为准。当前为第一阶段近似：
 * - 基础散布：0.25°（训练假设，待校准）
 * - 移动误差：走动 +3°、跑动 +6°（官方补丁说明 9.10，见参数台账）
 * - 连续射击/后坐：后续轮次接入
 */

export const BASE_SPREAD_DEG = 0.25; // 训练假设
export const WALK_SPREAD_DEG = 3; // 官方公开（9.10 补丁说明）
export const RUN_SPREAD_DEG = 6; // 官方公开（9.10 补丁说明）

/** 判定走/跑的速度阈值（训练假设，待实测校准） */
export const WALK_THRESHOLD_MPS = 0.5;
export const RUN_THRESHOLD_MPS = 3.0;

export interface ErrorInput {
  speedMps: number;
  /** 连续第几发（0 起），当前版本不参与计算 */
  shotIndex: number;
}

export function spreadDeg(input: ErrorInput): number {
  let deg = BASE_SPREAD_DEG;
  if (input.speedMps >= RUN_THRESHOLD_MPS) deg += RUN_SPREAD_DEG;
  else if (input.speedMps >= WALK_THRESHOLD_MPS) deg += WALK_SPREAD_DEG;
  return deg;
}

/**
 * 在圆锥内取一个随机偏角（rand 为种子随机源）。
 * 返回 [偏航偏移, 俯仰偏移]（弧度），叠加到射击方向上。
 */
export function sampleSpread(spreadDegrees: number, rand: () => number): [number, number] {
  const maxRad = (spreadDegrees * Math.PI) / 180;
  const angle = rand() * Math.PI * 2;
  const mag = Math.sqrt(rand()) * maxRad; // 均匀面积分布
  return [Math.cos(angle) * mag, Math.sin(angle) * mag];
}
