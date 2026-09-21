import Dexie, { type EntityTable } from 'dexie';

/**
 * 本地存储（开发手册 §12.2）：IndexedDB 保存参数版本、场景版本和训练结果。
 * 失败回合（未命中、超时、死亡、中断）必须保留，不得剔除（设计方案 §5.3）。
 */

export interface RoundRecord {
  id?: number;
  /** 参数版本快照号 */
  paramsVersion: string;
  /** 场景版本 */
  scenarioVersion: string;
  scenarioId: string;
  weaponId: string;
  startedAt: number;
  /** 回合结局：成功 / 未命中 / 超时 / 死亡 / 中断 */
  outcome: 'kill' | 'miss' | 'timeout' | 'death' | 'abort';
  /** 三个独立耗时（秒），无则 null（设计方案 §5.2 术语） */
  timeToFirstShotSec: number | null;
  timeToFirstHitSec: number | null;
  timeToKillSec: number | null;
  /** 开火/命中数 */
  shots: number;
  hits: number;
  /** 急停首发指标：首发开火时速度（m/s） */
  speedAtFirstShotMps: number | null;
  /** 急停首发指标：首发是否命中 */
  firstShotHit: boolean | null;
  /** 急停首发指标：停稳到首发的等待时间（秒），未停稳即开火为 null */
  stopWaitSec: number | null;
}

export interface SessionRecord {
  id?: number;
  paramsVersion: string;
  startedAt: number;
  endedAt: number | null;
}

const db = new Dexie('warmup-lab') as Dexie & {
  rounds: EntityTable<RoundRecord, 'id'>;
  sessions: EntityTable<SessionRecord, 'id'>;
};

db.version(1).stores({
  rounds: '++id, scenarioId, weaponId, paramsVersion, startedAt',
  sessions: '++id, startedAt',
});

export { db };
