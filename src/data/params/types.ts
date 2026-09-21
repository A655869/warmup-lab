/**
 * 参数台账（设计方案 §2.2）：每一项游戏参数保存七个字段，
 * 状态分三级：官方公开 / 实验估计 / 训练假设。
 * 未核验数据一律标记「待校准」，不作为开发常量写死。
 */

export type ParamStatus = 'official' | 'experiment' | 'assumption' | 'uncalibrated';

export const PARAM_STATUS_LABEL: Record<ParamStatus, string> = {
  official: '官方公开',
  experiment: '实验估计',
  assumption: '训练假设',
  uncalibrated: '待校准',
};

export interface ParamEntry<T = number | string> {
  /** 参数名 */
  name: string;
  /** 数值（待校准时为 null） */
  value: T | null;
  /** 单位 */
  unit: string;
  /** 适用武器 */
  weapon: string;
  /** 适用游戏版本 */
  gameVersion: string;
  /** 来源 */
  source: string;
  /** 核验日期（ISO），未核验为 null */
  verifiedAt: string | null;
  /** 状态 */
  status: ParamStatus;
}

/** 一把武器的参数文件（开发手册 §10.1） */
export interface WeaponProfile {
  id: 'vandal' | 'phantom';
  displayName: string;
  /** 射速（发/秒） */
  fireRate: ParamEntry<number>;
  /** 各参数台账条目 */
  ledger: ParamEntry[];
}
