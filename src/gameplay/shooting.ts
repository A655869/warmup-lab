/**
 * 射击与命中（开发手册 §10）：即时射线判定；曳光仅是视觉效果，不参与命中。
 * 开火流程固定顺序：射速检查 → 计算当前误差 → 生成射线 → 找最近交点 → 判断墙体或命中部位 → 结算伤害。
 * 阶段 0 仅提供纯函数骨架与射速检查，误差/射线在阶段 1 接入 Three.js 场景。
 */

/** 射速检查：距离上次开火是否已达到最小间隔 */
export function canFire(lastShotSec: number | null, nowSec: number, fireRatePerSec: number): boolean {
  if (fireRatePerSec <= 0) return false;
  if (lastShotSec === null) return true;
  return nowSec - lastShotSec >= 1 / fireRatePerSec - 1e-9;
}

/** 命中部位 */
export type HitPart = 'head' | 'body' | 'leg' | 'wall' | 'miss';

export interface ShotResult {
  part: HitPart;
  /** 命中距离（米），未命中为 null */
  distanceM: number | null;
}

/** 伤害结算（阶段 0 占位：按部位倍率表，数值须在参数台账登记后方可启用） */
export function damageFor(part: HitPart, baseDamage: number, headMultiplier = 4, legMultiplier = 0.85): number {
  switch (part) {
    case 'head':
      return baseDamage * headMultiplier;
    case 'body':
      return baseDamage;
    case 'leg':
      return baseDamage * legMultiplier;
    default:
      return 0;
  }
}
