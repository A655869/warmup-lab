import { describe, it, expect } from 'vitest';
import { transition } from './state';

describe('页面状态机（手册 §5.1）', () => {
  it('正常流转：加载→准备→训练→暂停→训练→结算→准备', () => {
    let s = transition('loading', 'LOAD_OK');
    expect(s).toBe('ready');
    s = transition(s, 'START');
    expect(s).toBe('training');
    s = transition(s, 'PAUSE');
    expect(s).toBe('paused');
    s = transition(s, 'RESUME');
    expect(s).toBe('training');
    s = transition(s, 'FINISH');
    expect(s).toBe('result');
    s = transition(s, 'RESTART');
    expect(s).toBe('ready');
  });
  it('加载失败 → 重试', () => {
    expect(transition('loading', 'LOAD_FAIL')).toBe('load-error');
    expect(transition('load-error', 'RETRY')).toBe('loading');
  });
  it('非法转换抛错（不允许静默偏离）', () => {
    expect(() => transition('ready', 'PAUSE')).toThrow();
    expect(() => transition('result', 'START')).toThrow();
  });
});
