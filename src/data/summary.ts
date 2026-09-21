import type { RoundRecord } from './db';
import { STOPPED_THRESHOLD_MPS } from '@/scenarios/runner';

/**
 * 结算聚合（设计方案 §5.3/§5.4）：
 * - 统计必须包含失败回合；
 * - 样本不足（<3 回合）明确提示，不输出看似精确的结论；
 * - 结算页只突出三件事：本局表现、最常见失误、下一局建议。
 */

export interface SessionSummary {
  rounds: number;
  killRounds: number;
  timeoutRounds: number;
  abortRounds: number;
  accuracy: number | null; // 命中/开火
  /** 急停首发指标 */
  firstShotAccuracy: number | null;
  avgSpeedAtFirstShot: number | null;
  prematureRatio: number | null; // 未停稳即开火比例
  avgStopWaitSec: number | null;
  /** 架枪反应指标（秒） */
  avgTimeToFirstShot: number | null;
  avgTimeToFirstHit: number | null;
  avgTimeToKill: number | null;
}

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function summarize(rounds: RoundRecord[]): SessionSummary {
  const shots = rounds.reduce((a, r) => a + r.shots, 0);
  const hits = rounds.reduce((a, r) => a + r.hits, 0);
  const speeds = rounds.map((r) => r.speedAtFirstShotMps).filter((v): v is number => v !== null);
  const premature = rounds.filter((r) => r.speedAtFirstShotMps !== null && r.speedAtFirstShotMps >= STOPPED_THRESHOLD_MPS);
  const firstShots = rounds.filter((r) => r.firstShotHit !== null);
  const stops = rounds.map((r) => r.stopWaitSec).filter((v): v is number => v !== null);
  return {
    rounds: rounds.length,
    killRounds: rounds.filter((r) => r.outcome === 'kill').length,
    timeoutRounds: rounds.filter((r) => r.outcome === 'timeout').length,
    abortRounds: rounds.filter((r) => r.outcome === 'abort').length,
    accuracy: shots > 0 ? hits / shots : null,
    firstShotAccuracy: firstShots.length
      ? firstShots.filter((r) => r.firstShotHit).length / firstShots.length
      : null,
    avgSpeedAtFirstShot: avg(speeds),
    prematureRatio: speeds.length ? premature.length / speeds.length : null,
    avgStopWaitSec: avg(stops),
    avgTimeToFirstShot: avg(rounds.map((r) => r.timeToFirstShotSec).filter((v): v is number => v !== null)),
    avgTimeToFirstHit: avg(rounds.map((r) => r.timeToFirstHitSec).filter((v): v is number => v !== null)),
    avgTimeToKill: avg(rounds.map((r) => r.timeToKillSec).filter((v): v is number => v !== null)),
  };
}

export interface Feedback {
  performance: string;
  mistake: string;
  advice: string;
}

export function buildFeedback(rounds: RoundRecord[], mode: 'stop-shot' | 'hold-angle'): Feedback {
  const s = summarize(rounds);
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
  const sec = (v: number | null) => (v === null ? '–' : `${v.toFixed(2)}s`);

  if (s.rounds < 3) {
    return {
      performance: `完成 ${s.rounds} 回合（击杀 ${s.killRounds} / 超时 ${s.timeoutRounds} / 中断 ${s.abortRounds}）。`,
      mistake: '样本不足（少于 3 回合），暂不输出结论。',
      advice: '样本不足。再来几局，让反馈更可靠。',
    };
  }

  if (mode === 'stop-shot') {
    const performance = `首发命中率 ${pct(s.firstShotAccuracy)}；首发时平均速度 ${
      s.avgSpeedAtFirstShot === null ? '–' : s.avgSpeedAtFirstShot.toFixed(1) + ' m/s'
    }；停稳后平均等待 ${sec(s.avgStopWaitSec)} 开火。`;
    if (s.prematureRatio !== null && s.prematureRatio > 0.5) {
      return {
        performance,
        mistake: `过早开火占比较高（${pct(s.prematureRatio)} 的首发在未停稳时打出）。`,
        advice: '下一局保持目标距离不变，优先练习停稳后首发：先松开方向键，确认准星稳定再开火。',
      };
    }
    if (s.firstShotAccuracy !== null && s.firstShotAccuracy < 0.5) {
      return {
        performance,
        mistake: `停稳做得不错，但首发命中率偏低（${pct(s.firstShotAccuracy)}）。`,
        advice: '停稳已经合格，下一局放慢一点，把准星先放到目标躯干高度再停稳开火。',
      };
    }
    return {
      performance,
      mistake: '未停稳首发较少，首发命中率合格，暂无明显失误模式。',
      advice: '可以拉远距离（如 30 米）或开启强化模式继续加压。',
    };
  }

  // 架枪反应
  const performance = `首次开火 ${sec(s.avgTimeToFirstShot)} / 首次命中 ${sec(s.avgTimeToFirstHit)} / 击杀 ${sec(
    s.avgTimeToKill,
  )}（均以目标首次可见为起点）；击杀 ${s.killRounds}/${s.rounds} 回合。`;
  if (s.timeoutRounds / s.rounds > 0.4) {
    return {
      performance,
      mistake: `超时回合偏多（${s.timeoutRounds}/${s.rounds}），目标出现后未能及时完成击杀。`,
      advice: '下一局把准星预放在掩体边缘的头部高度，目标一出现只做微调就开火。',
    };
  }
  if (s.avgTimeToFirstShot !== null && s.avgTimeToFirstShot > 0.6) {
    return {
      performance,
      mistake: '首次开火偏慢（超过 0.6s），反应窗口被拉长。',
      advice: '注意力集中在掩体边缘而不是准星，看到目标先开枪再修正。',
    };
  }
  return {
    performance,
    mistake: '反应耗时分布健康，暂无明显失误模式。',
    advice: '可以缩短距离或开启强化模式压缩反应窗口。',
  };
}
