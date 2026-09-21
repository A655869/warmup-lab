import { describe, it, expect } from 'vitest';
import { spreadDeg, sampleSpread, BASE_SPREAD_DEG, WALK_SPREAD_DEG, RUN_SPREAD_DEG } from './spread';
import { mulberry32 } from './rng';

describe('误差模型（手册 §10.3）', () => {
  it('静止：仅基础散布', () => {
    expect(spreadDeg({ speedMps: 0, shotIndex: 0 })).toBe(BASE_SPREAD_DEG);
  });
  it('走动 +3°、跑动 +6°（官方公开增量）', () => {
    expect(spreadDeg({ speedMps: 1.5, shotIndex: 0 })).toBeCloseTo(BASE_SPREAD_DEG + WALK_SPREAD_DEG);
    expect(spreadDeg({ speedMps: 5, shotIndex: 0 })).toBeCloseTo(BASE_SPREAD_DEG + RUN_SPREAD_DEG);
  });
  it('种子随机可复现', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const [ya1, pa1] = sampleSpread(3, a);
    const [ya2, pa2] = sampleSpread(3, b);
    expect(ya1).toBe(ya2);
    expect(pa1).toBe(pa2);
  });
  it('散布不超过上限', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const [y, p] = sampleSpread(6, r);
      expect(Math.hypot(y, p)).toBeLessThanOrEqual((6 * Math.PI) / 180 + 1e-9);
    }
  });
});
