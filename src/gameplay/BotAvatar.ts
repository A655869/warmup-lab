import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 机器人人物资产（手册 §8）：
 * - Blender 低模 GLB，AnimationMixer 混合切换动画（待机/左右移动/蹲下/受击）；
 * - 视觉模型与命中区分离（§8.3）：头/躯干判定体绑定对应骨骼，随蹲起移动同步更新；
 * - 提供调试显示开关检查对齐（§8.3）。
 */

export type BotAnim = 'Idle' | 'StrafeLeft' | 'StrafeRight' | 'Crouch' | 'Hit';

export interface BotHitZones {
  head: THREE.Mesh;
  body: THREE.Mesh;
}

export class BotAvatar {
  readonly group: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<BotAnim, THREE.AnimationAction>();
  private current: BotAnim | null = null;
  private hitDebugMats: THREE.Material[] = [];
  readonly hitZones: BotHitZones;
  /** 受击动画播放中的剩余时间 */
  private hitTimer = 0;
  private baseAnim: BotAnim = 'Idle';

  private constructor(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) {
    this.group = gltf.scene;
    this.mixer = new THREE.AnimationMixer(this.group);
    for (const clip of gltf.animations) {
      this.actions.set(clip.name as BotAnim, this.mixer.clipAction(clip));
    }

    // 命中区绑定骨骼（§8.3：简化判定体绑定骨骼，不用外观轮廓判伤害）
    const headBone = this.group.getObjectByName('Head');
    const spineBone = this.group.getObjectByName('Spine');
    if (!headBone || !spineBone) throw new Error('人物 GLB 缺少 Head/Spine 骨骼');

    const headZone = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    // 骨骼空间内的局部偏移：Head 骨尾（头顶上方）即头部判定中心
    headZone.position.set(0, 0.18, 0);
    headBone.add(headZone);

    const bodyZone = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.55, 4, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    bodyZone.position.set(0, -0.05, 0); // Spine 骨骼段中心
    spineBone.add(bodyZone);

    this.hitZones = { head: headZone, body: bodyZone };

    // 调试显示开关用的线框（默认隐藏）
    for (const zone of [headZone, bodyZone]) {
      const wire = new THREE.Mesh(
        zone.geometry,
        new THREE.MeshBasicMaterial({ wireframe: true, color: 0x00ff88, transparent: true, opacity: 0.9, depthTest: false }),
      );
      wire.visible = false;
      wire.raycast = () => {}; // 调试线框不参与命中判定
      zone.add(wire);
      this.hitDebugMats.push(wire.material);
      zone.userData.debugWire = wire;
    }

    this.play('Idle');
  }

  static async load(url: string): Promise<BotAvatar> {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new BotAvatar(gltf);
  }

  /** 动画混合切换（§8.2：AnimationMixer 混合） */
  play(name: BotAnim, fadeSec = 0.15): void {
    if (this.current === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset().fadeIn(fadeSec).play();
    if (prev) prev.fadeOut(fadeSec);
    this.current = name;
  }

  /** 基础循环动画（受击播放完后回到这里） */
  setBaseAnim(name: BotAnim): void {
    this.baseAnim = name;
    if (this.hitTimer <= 0) this.play(name);
  }

  /** 受击反馈（§8.2 受击动画） */
  playHit(): void {
    this.hitTimer = 0.35;
    this.play('Hit', 0.05);
  }

  setDebugHitboxes(visible: boolean): void {
    for (const zone of [this.hitZones.head, this.hitZones.body]) {
      (zone.userData.debugWire as THREE.Mesh).visible = visible;
    }
  }

  update(dtSec: number): void {
    if (this.hitTimer > 0) {
      this.hitTimer -= dtSec;
      if (this.hitTimer <= 0) this.play(this.baseAnim, 0.1);
    }
    this.mixer.update(dtSec);
  }

  /** 释放几何与材质资源（手册 §6.4） */
  dispose(): void {
    this.mixer.stopAllAction();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}
