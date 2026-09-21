/**
 * 页面状态机（开发手册 §5.1）：加载 / 准备 / 训练 / 暂停 / 结算 / 加载失败。
 * 状态转换必须有明确入口与出口；资产加载失败进入「加载失败」页并给出重试，不允许黑屏。
 */

export type PageState = 'loading' | 'ready' | 'training' | 'paused' | 'result' | 'load-error';

export type PageEvent =
  | 'LOAD_OK'
  | 'LOAD_FAIL'
  | 'START' // 准备 → 训练（锁定鼠标）
  | 'RELOAD' // 准备 → 加载（切换模块/距离需重建场景）
  | 'PAUSE' // 训练 → 暂停（Esc 失锁，必须停计时与机器人）
  | 'RESUME' // 暂停 → 训练
  | 'FINISH' // 训练/暂停 → 结算
  | 'RESTART' // 结算 → 准备
  | 'RETRY'; // 加载失败 → 加载

const TRANSITIONS: Record<PageState, Partial<Record<PageEvent, PageState>>> = {
  loading: { LOAD_OK: 'ready', LOAD_FAIL: 'load-error' },
  'load-error': { RETRY: 'loading' },
  ready: { START: 'training', RELOAD: 'loading' },
  training: { PAUSE: 'paused', FINISH: 'result' },
  paused: { RESUME: 'training', FINISH: 'result' },
  result: { RESTART: 'ready' },
};

export function transition(state: PageState, event: PageEvent): PageState {
  const next = TRANSITIONS[state][event];
  if (!next) throw new Error(`非法状态转换：${state} + ${event}`);
  return next;
}
