/**
 * 数据驱动地图（开发手册 §9.2）：
 * 地图用 JSON 描述：物体尺寸、位置、出生点、目标路线和训练距离；
 * 带格式版本号；加载时验证尺寸与位置合法性，非法数据拒绝加载并报错。
 */

export const MAP_FORMAT_VERSION = 1;

export interface MapBox {
  /** 箱体/墙体 */
  kind: 'box';
  /** 中心点 [x, y, z]，米制 */
  position: [number, number, number];
  /** 尺寸 [宽, 高, 深]，米制 */
  size: [number, number, number];
  /** 用途标签：wall / cover / ground-decoration 等 */
  tag?: string;
}

export interface MapObject {
  kind: 'ground';
  size: [number, number]; // x, z 尺寸
}

export interface SpawnPoint {
  position: [number, number, number];
  /** 朝向 yaw，弧度 */
  yaw: number;
}

export interface TrainingMap {
  formatVersion: number;
  id: string;
  name: string;
  /** 空间类型：急停通道 / 掩体出枪区 / 开放对枪区 */
  spaceType: 'stop-corridor' | 'cover-peek' | 'open-duel';
  /** 可调训练距离（米） */
  distances: number[];
  ground: MapObject;
  boxes: MapBox[];
  playerSpawn: SpawnPoint;
  targetSpawns: SpawnPoint[];
}

export function validateMap(data: unknown): TrainingMap {
  const m = data as TrainingMap;
  if (!m || typeof m !== 'object') throw new Error('地图数据不是对象');
  if (m.formatVersion !== MAP_FORMAT_VERSION)
    throw new Error(`地图格式版本不支持：${m.formatVersion}（当前支持 ${MAP_FORMAT_VERSION}）`);
  if (!m.id || !m.name) throw new Error('地图缺少 id/name');
  if (!m.ground || m.ground.size.some((v) => !(v > 0))) throw new Error('地面尺寸非法');
  for (const [i, b] of (m.boxes ?? []).entries()) {
    if (b.kind !== 'box') throw new Error(`物体 #${i} 类型非法`);
    if (b.size.some((v) => !(v > 0))) throw new Error(`物体 #${i} 尺寸非法`);
    if (b.position.some((v) => typeof v !== 'number' || Number.isNaN(v)))
      throw new Error(`物体 #${i} 位置非法`);
  }
  if (!m.playerSpawn) throw new Error('缺少玩家出生点');
  // 出生点不被遮挡：简单检查出生点不与任何箱体相交（§9.3 检查清单）
  for (const [i, b] of (m.boxes ?? []).entries()) {
    const [px, py, pz] = m.playerSpawn.position;
    const [bx, by, bz] = b.position;
    const [sx, sy, sz] = b.size;
    if (
      Math.abs(px - bx) < sx / 2 + 0.4 &&
      Math.abs(pz - bz) < sz / 2 + 0.4 &&
      py > by - sy / 2 &&
      py < by + sy / 2 + 1.8
    )
      throw new Error(`玩家出生点被物体 #${i} 遮挡`);
  }
  if (!Array.isArray(m.targetSpawns) || m.targetSpawns.length === 0)
    throw new Error('缺少目标出生点');
  return m;
}
