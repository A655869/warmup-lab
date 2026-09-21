import { describe, it, expect } from 'vitest';
import { canFire, damageFor } from './shooting';

describe('射速检查（手册 §10.2 第一步）', () => {
  it('首发立即可射', () => {
    expect(canFire(null, 0, 9.75)).toBe(true);
  });
  it('未达到射速间隔时禁止开火', () => {
    // 狂徒 9.75 发/秒 ≈ 102.6ms 间隔
    expect(canFire(0, 0.05, 9.75)).toBe(false);
  });
  it('达到间隔后允许开火', () => {
    expect(canFire(0, 0.103, 9.75)).toBe(true);
  });
  it('非法射速返回 false', () => {
    expect(canFire(null, 0, 0)).toBe(false);
  });
});

describe('伤害结算（部位倍率）', () => {
  it('头部 4 倍、身体 1 倍、腿部 0.85 倍、墙体/未命中 0', () => {
    expect(damageFor('head', 40)).toBe(160);
    expect(damageFor('body', 40)).toBe(40);
    expect(damageFor('leg', 40)).toBeCloseTo(34);
    expect(damageFor('wall', 40)).toBe(0);
    expect(damageFor('miss', 40)).toBe(0);
  });
});
