/**
 * 训练场景规则（手册 §九/§十一，设计方案 §5.1 分模块指标）。
 * 首版机器人不用大模型/强化学习：预设路线 + 可解释参数（§11.1/§11.2）。
 * 先完成不还击的移动靶，还击后续轮次加入（§11.2）。
 */
import type { RoundRecord } from '@/data/db';

/** 引擎产出的回合结果骨架；参数版本/武器/时间戳由外层补全 */
export type RoundResult = Omit<
  RoundRecord,
  'id' | 'paramsVersion' | 'scenarioVersion' | 'weaponId' | 'startedAt'
>;

export type ScenarioMode = 'stop-shot' | 'hold-angle';

/** 回合超时（秒） */
export const STOP_SHOT_TIMEOUT_SEC = 10;
export const HOLD_ANGLE_TIMEOUT_SEC = 4;
/** 停稳判定阈值（m/s，工程初值，待校准） */
export const STOPPED_THRESHOLD_MPS = 0.5;

export interface ScenarioHooks {
  nowSec(): number;
  playerSpeedMps(): number;
  rng(): number;
  placeTarget(x: number, z: number): void;
  moveTarget(dx: number): void;
  hideTarget(): void;
  showTarget(): void;
  targetAlive(): boolean;
  reviveTarget(): void;
  /**
   * 「目标首次可见」口径（手册 §12.1 要求明确定义）：
   * 目标头部判定体中心与相机之间无墙体遮挡的模拟步。
   */
  isTargetVisible(): boolean;
  endRound(rec: RoundResult): void;
}

export interface Scenario {
  readonly mode: ScenarioMode;
  reset(): void;
  onStep(stepSec: number): void;
  onFired(info: { hitTarget: boolean; part: 'head' | 'body' | 'leg' | null }): void;
  /** 会话中断（结算/退出）：进行中的回合记为 abort（失败回合不得剔除，§5.3） */
  abort(): void;
}

interface Base {
  roundStartSec: number;
  firstShotSec: number | null;
  firstHitSec: number | null;
  killSec: number | null;
  shots: number;
  hits: number;
  active: boolean;
}

function freshBase(now: number): Base {
  return {
    roundStartSec: now,
    firstShotSec: null,
    firstHitSec: null,
    killSec: null,
    shots: 0,
    hits: 0,
    active: true,
  };
}

/* ---------------------------------- 急停首发 ---------------------------------- */

/**
 * 急停首发：目标静止可见，玩家在通道内移动，训练「停稳后首发」。
 * 指标：首发开火时速度、提前开火比例、精度恢复后等待时间（停稳到首发）、首发命中率。
 */
export class StopShotScenario implements Scenario {
  readonly mode = 'stop-shot';
  private r: Base;
  private speedAtFirstShot: number | null = null;
  private firstShotHit: boolean | null = null;
  private stoppedSinceSec: number | null = null;
  private stopWaitSec: number | null = null;
  private intermissionUntil: number | null = null;

  private h: ScenarioHooks;
  private distanceM: number;

  constructor(h: ScenarioHooks, distanceM: number) {
    this.h = h;
    this.distanceM = distanceM;
    this.r = freshBase(h.nowSec());
    this.spawnTarget();
  }

  private spawnTarget(): void {
    const xs = [-2, 0, 2];
    const x = xs[Math.floor(this.h.rng() * xs.length)];
    this.h.placeTarget(x, -this.distanceM);
    this.h.reviveTarget();
    this.h.showTarget();
  }

  reset(): void {
    this.r = freshBase(this.h.nowSec());
    this.speedAtFirstShot = null;
    this.firstShotHit = null;
    this.stoppedSinceSec = null;
    this.stopWaitSec = null;
    this.intermissionUntil = null;
    this.spawnTarget();
  }

  onStep(): void {
    const now = this.h.nowSec();
    if (this.intermissionUntil !== null) {
      if (now >= this.intermissionUntil) {
        this.intermissionUntil = null;
        this.reset();
      }
      return;
    }
    if (!this.r.active) return;

    // 停稳时刻跟踪
    if (this.h.playerSpeedMps() < STOPPED_THRESHOLD_MPS) {
      if (this.stoppedSinceSec === null) this.stoppedSinceSec = now;
    } else {
      this.stoppedSinceSec = null;
    }

    // 击杀 → 回合完成
    if (!this.h.targetAlive()) {
      this.r.killSec = now;
      this.finish('kill');
      return;
    }
    // 超时 → 失败回合（保留，不得剔除）
    if (now - this.r.roundStartSec >= STOP_SHOT_TIMEOUT_SEC) this.finish('timeout');
  }

  onFired(info: { hitTarget: boolean; part: 'head' | 'body' | 'leg' | null }): void {
    if (!this.r.active) return;
    const now = this.h.nowSec();
    this.r.shots += 1;
    if (this.r.firstShotSec === null) {
      this.r.firstShotSec = now;
      this.speedAtFirstShot = this.h.playerSpeedMps();
      this.firstShotHit = info.hitTarget;
      this.stopWaitSec =
        this.stoppedSinceSec !== null ? now - this.stoppedSinceSec : null;
    }
    if (info.hitTarget) {
      this.r.hits += 1;
      if (this.r.firstHitSec === null) this.r.firstHitSec = now;
    }
  }

  private finish(outcome: RoundRecord['outcome']): void {
    this.r.active = false;
    this.h.endRound({
      scenarioId: this.mode,
      outcome,
      timeToFirstShotSec: this.r.firstShotSec !== null ? this.r.firstShotSec - this.r.roundStartSec : null,
      timeToFirstHitSec: this.r.firstHitSec !== null ? this.r.firstHitSec - this.r.roundStartSec : null,
      timeToKillSec: this.r.killSec !== null ? this.r.killSec - this.r.roundStartSec : null,
      shots: this.r.shots,
      hits: this.r.hits,
      speedAtFirstShotMps: this.speedAtFirstShot,
      firstShotHit: this.firstShotHit,
      stopWaitSec: this.stopWaitSec,
    });
    this.intermissionUntil = this.h.nowSec() + 0.8;
  }

  abort(): void {
    if (!this.r.active || this.intermissionUntil !== null) return;
    if (this.r.shots === 0) return; // 未开始的回合不记录
    this.finish('abort');
  }
}

/* ---------------------------------- 架枪反应 ---------------------------------- */

/**
 * 架枪反应：目标从掩体后随机延迟 peek 出枪，玩家架枪反应。
 * 指标：目标首次可见 → 首次开火 / 首次命中 / 击杀 三个独立耗时（设计方案 §5.2 术语）。
 * 首版机器人不还击（§11.2），等待时间随机化避免背节奏（§11.2）。
 */
export class HoldAngleScenario implements Scenario {
  readonly mode = 'hold-angle';
  private r: Base;
  private phase: 'hidden' | 'peeking' | 'exposed' | 'done' = 'hidden';
  private peekAtSec: number;
  private visibleSec: number | null = null;
  private peekProgress = 0;
  private intermissionUntil: number | null = null;
  private hiddenX = 0;
  private exposedX = 0;
  private curX = 0;
  private readonly z: number;

  /** peek 移动时长（秒，出枪速度，难度参数之一） */
  private readonly PEEK_DURATION_SEC = 0.3;

  private h: ScenarioHooks;

  constructor(h: ScenarioHooks, distanceM: number) {
    this.h = h;
    this.z = -distanceM;
    this.r = freshBase(h.nowSec());
    this.peekAtSec = h.nowSec() + this.randomDelay();
    this.setupPositions();
  }

  private randomDelay(): number {
    return 0.8 + this.h.rng() * 1.2; // 0.8–2.0s 随机等待（§11.2 随机化）
  }

  private setupPositions(): void {
    // 掩体中心 x=1.5（地图 cover 箱横跨 x∈[0,3]）；
    // peek 方向随机：右出 x=4.5 或左出 x=-1.5（均在掩体遮挡范围外）
    const side = this.h.rng() < 0.5 ? -1 : 1;
    this.hiddenX = 1.5;
    this.exposedX = side < 0 ? -1.5 : 4.5;
    this.curX = this.hiddenX;
    this.h.placeTarget(this.hiddenX, this.z);
    this.h.reviveTarget();
    this.h.hideTarget();
  }

  reset(): void {
    this.r = freshBase(this.h.nowSec());
    this.phase = 'hidden';
    this.peekAtSec = this.h.nowSec() + this.randomDelay();
    this.visibleSec = null;
    this.peekProgress = 0;
    this.intermissionUntil = null;
    this.setupPositions();
  }

  onStep(stepSec: number): void {
    const now = this.h.nowSec();
    if (this.intermissionUntil !== null) {
      if (now >= this.intermissionUntil) {
        this.intermissionUntil = null;
        this.reset();
      }
      return;
    }
    if (!this.r.active) return;

    if (this.phase === 'hidden' && now >= this.peekAtSec) {
      this.phase = 'peeking';
      this.h.showTarget();
    }
    if (this.phase === 'peeking') {
      this.peekProgress = Math.min(1, this.peekProgress + stepSec / this.PEEK_DURATION_SEC);
      const x = this.hiddenX + (this.exposedX - this.hiddenX) * this.peekProgress;
      this.h.moveTarget(x - this.curX);
      this.curX = x;
      if (this.peekProgress >= 1) this.phase = 'exposed';
    }
    if (this.phase !== 'hidden') {
      // 首次可见采样（口径：头部判定体中心与相机间无遮挡）
      if (this.visibleSec === null && this.h.isTargetVisible()) this.visibleSec = now;

      if (!this.h.targetAlive()) {
        this.r.killSec = now;
        this.finish('kill');
        return;
      }
      if (this.visibleSec !== null && now - this.visibleSec >= HOLD_ANGLE_TIMEOUT_SEC)
        this.finish('timeout');
    }
  }

  onFired(info: { hitTarget: boolean; part: 'head' | 'body' | 'leg' | null }): void {
    if (!this.r.active) return;
    const now = this.h.nowSec();
    this.r.shots += 1;
    if (this.r.firstShotSec === null) this.r.firstShotSec = now;
    if (info.hitTarget) {
      this.r.hits += 1;
      if (this.r.firstHitSec === null) this.r.firstHitSec = now;
    }
  }

  private finish(outcome: RoundRecord['outcome']): void {
    this.r.active = false;
    const v = this.visibleSec;
    this.h.endRound({
      scenarioId: this.mode,
      outcome,
      // 三个耗时均以「目标首次可见」为起点（设计方案 §5.2）
      timeToFirstShotSec: v !== null && this.r.firstShotSec !== null ? this.r.firstShotSec - v : null,
      timeToFirstHitSec: v !== null && this.r.firstHitSec !== null ? this.r.firstHitSec - v : null,
      timeToKillSec: v !== null && this.r.killSec !== null ? this.r.killSec - v : null,
      shots: this.r.shots,
      hits: this.r.hits,
      speedAtFirstShotMps: null,
      firstShotHit: null,
      stopWaitSec: null,
    });
    this.intermissionUntil = this.h.nowSec() + 0.8;
  }

  abort(): void {
    if (!this.r.active || this.intermissionUntil !== null) return;
    if (this.phase === 'hidden' && this.r.shots === 0) return; // 未实质开始
    this.finish('abort');
  }
}

export function createScenario(
  mode: ScenarioMode,
  hooks: ScenarioHooks,
  distanceM: number,
): Scenario {
  return mode === 'stop-shot'
    ? new StopShotScenario(hooks, distanceM)
    : new HoldAngleScenario(hooks, distanceM);
}
