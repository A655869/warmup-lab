import RAPIER from '@dimforge/rapier3d-compat';
import type { TrainingMap } from '@/scenarios/types';

/**
 * 物理与碰撞（开发手册 §6.3 / 技术栈选型：Rapier）：
 * - 角色碰撞使用胶囊体；地面、墙壁使用简化碰撞体；视觉模型复杂度不影响碰撞。
 * - 模拟步顺序（§6.2）：输入采样 → 移动与碰撞 → …
 */

export async function initRapier(): Promise<void> {
  await RAPIER.init();
}

export interface PlayerPhysics {
  world: RAPIER.World;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  /** 垂直速度（重力累积）， grounded 时清零 */
  vy: number;
}

/** 胶囊体尺寸：总高约 1.8m（米制统一，手册 §8.2） */
export const PLAYER_CAPSULE = { halfHeight: 0.55, radius: 0.35 } as const;
/** 胶囊中心出生高度（脚底贴地） */
export const SPAWN_CENTER_Y = PLAYER_CAPSULE.halfHeight + PLAYER_CAPSULE.radius;
/** 眼睛相对胶囊中心的偏移（站姿眼高约 1.6m） */
export const EYE_OFFSET = 1.6 - SPAWN_CENTER_Y;

export function createPhysics(map: TrainingMap): PlayerPhysics {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // 地面：简化碰撞体
  const [gx, gz] = map.ground.size;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(gx / 2, 0.1, gz / 2).setTranslation(0, -0.1, 0),
  );

  // 墙体/掩体：简化碰撞体（与视觉网格一一对应）
  for (const b of map.boxes) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2).setTranslation(
        b.position[0],
        b.position[1],
        b.position[2],
      ),
    );
  }

  // 玩家：运动学胶囊体 + 角色控制器
  const s = map.playerSpawn.position;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(s[0], SPAWN_CENTER_Y, s[2]),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER_CAPSULE.halfHeight, PLAYER_CAPSULE.radius),
    body,
  );
  const controller = world.createCharacterController(0.01);
  controller.enableAutostep(0.4, 0.2, true);
  controller.enableSnapToGround(0.4);
  controller.setApplyImpulsesToDynamicBodies(false);

  return { world, body, collider, controller, vy: 0 };
}

const GRAVITY = 18; // m/s²，手感取向的工程值

/** 移动与碰撞一步：水平期望位移 + 重力，由角色控制器解算 */
export function movePlayer(
  phys: PlayerPhysics,
  dirX: number,
  dirZ: number,
  speedMps: number,
  stepSec: number,
): void {
  const p = phys.body.translation();
  if (phys.controller.computedGrounded()) phys.vy = 0;
  else phys.vy -= GRAVITY * stepSec;

  const desired = { x: dirX * speedMps * stepSec, y: phys.vy * stepSec, z: dirZ * speedMps * stepSec };
  phys.controller.computeColliderMovement(phys.collider, desired);
  const m = phys.controller.computedMovement();
  phys.body.setTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }, true);
  // 步进世界以刷新查询管线（角色控制器的碰撞查询依赖最新 broad-phase）
  phys.world.timestep = stepSec;
  phys.world.step();
}

export function freePhysics(phys: PlayerPhysics): void {
  phys.world.free();
}
