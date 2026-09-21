import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { PointerLockInput } from './input';
import {
  initRapier,
  createPhysics,
  movePlayer,
  freePhysics,
  EYE_OFFSET,
  type PlayerPhysics,
} from './physics';
import type { TrainingSession, SessionStats, StatsListener, SessionEvent, EventListener } from './TrainingSession';
import { loadMap } from '@/scenarios/loader';
import type { TrainingMap } from '@/scenarios/types';
import { createScenario, type Scenario, type ScenarioMode, type RoundResult } from '@/scenarios/runner';
import { WEAPONS, RUN_SPEED_MPS, type WeaponProfile } from '@/data/params';
import { canFire } from '@/gameplay/shooting';
import { spreadDeg, sampleSpread } from '@/gameplay/spread';
import { mulberry32 } from '@/gameplay/rng';

/** 目标血量：训练假设（手册：无可靠依据的部分明确写成训练近似值） */
const TARGET_HP = 100;
/** 击杀后重生延迟（秒） */
const RESPAWN_SEC = 1.0;

export interface SessionOptions {
  /** 场景模式；null 为自由打靶（第一轮行为） */
  scenario: ScenarioMode | null;
  distanceM: number;
  /** 可记录随机种子（手册 §10.3） */
  seed: number;
  /** 回合结束回调（含失败回合，不得剔除） */
  onRound?: (rec: RoundResult) => void;
}

interface Target {
  group: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  headMat: THREE.MeshLambertMaterial;
  spawn: [number, number, number];
  hp: number;
  alive: boolean;
  respawnAtSec: number;
  /** 受击闪白截止时刻（秒） */
  flashUntilSec: number;
}

interface Tracer {
  line: THREE.Line;
  geo: THREE.BufferGeometry;
  mat: THREE.LineBasicMaterial;
  untilSec: number;
}

/**
 * 第一轮引擎会话：
 * - Rapier 胶囊体移动与碰撞（手册 §6.3）；
 * - 模拟步顺序（§6.2）：输入采样 → 移动与碰撞 → 机器人决策（第三轮）→
 *   姿态和命中区更新 → 射击判定 → 事件记录；
 * - 即时射线判定（§10.2），曳光仅是视觉效果，不参与命中；
 * - dispose 释放事件监听、物理世界、纹理和几何资源（§6.4）。
 */
export class GrayboxSession implements TrainingSession {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private loop: FixedStepLoop;
  private input: PointerLockInput;
  private map: TrainingMap | null = null;
  private phys: PlayerPhysics | null = null;
  private weapon: WeaponProfile;
  private raycaster = new THREE.Raycaster();

  private targets: Target[] = [];
  private targetMeshes: THREE.Object3D[] = [];
  private tracers: Tracer[] = [];

  private keys = new Set<string>();
  private triggerHeld = false;
  private lastShotSec: number | null = null;
  private shots = 0;
  private hits = 0;

  private yaw = 0;
  private pitch = 0;
  /**
   * 灵敏度（radiansPerCount）：占位初值，标记「待校准」，
   * 须经「转身距离校准工具」实测核验（手册 §7.1）。
   */
  private sensRadiansPerCount = 0.07 * (Math.PI / 180);

  private simTime = 0;
  private statsTimer = 0;
  private lastFrameMs = 0;
  private statsListeners = new Set<StatsListener>();
  private eventListeners = new Set<EventListener>();
  private disposed = false;
  private disposables: { dispose(): void }[] = [];
  private domCleanup: (() => void)[] = [];
  private readonly canvas: HTMLCanvasElement;

  // —— 第二轮：场景规则 / 误差模型 / 随机种子 / 玩家速度 ——
  private scenario: Scenario | null = null;
  private rand: () => number = () => Math.random();
  private seed = 1;
  private playerSpeedMps = 0;
  private wallMeshes: THREE.Object3D[] = [];
  private shotIndex = 0;
  private onRoundCb: ((rec: RoundResult) => void) | null = null;

  private constructor(canvas: HTMLCanvasElement, weapon: WeaponProfile) {
    this.canvas = canvas;
    this.weapon = weapon;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // 垂直 FOV（Three.js 相机语义），水平 FOV 按画面比例换算（手册 §7.2）
    this.camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 200);
    this.input = new PointerLockInput(canvas);
    this.loop = new FixedStepLoop({
      simulate: (step) => this.simulate(step),
      render: () => this.renderFrame(),
    });
  }

  static async create(
    canvas: HTMLCanvasElement,
    mapUrl: string,
    weapon: WeaponProfile = WEAPONS.vandal,
    options: SessionOptions = { scenario: null, distanceM: 20, seed: 1 },
  ): Promise<GrayboxSession> {
    await initRapier();
    const s = new GrayboxSession(canvas, weapon);
    s.map = await loadMap(mapUrl); // 校验失败会抛出 → 进入「加载失败」页
    s.phys = createPhysics(s.map);
    s.buildScene();
    s.bindDom();
    s.resize();
    s.seed = options.seed;
    s.rand = mulberry32(options.seed);
    s.onRoundCb = options.onRound ?? null;
    if (options.scenario) s.setupScenario(options.scenario, options.distanceM);
    return s;
  }

  /** 场景模式初始化：单目标管理，多余目标隐藏；可调距离移动掩体（手册 §9.2） */
  private setupScenario(mode: ScenarioMode, distanceM: number): void {
    if (!this.map || !this.phys) return;
    // 多余目标退场（不受通用重生逻辑管理）
    for (let i = 1; i < this.targets.length; i++) {
      this.targets[i].alive = false;
      this.targets[i].group.visible = false;
    }
    // 掩体出枪区：把 cover 箱体（网格+碰撞体）移到所选距离
    if (mode === 'hold-angle') {
      this.map.boxes.forEach((b, i) => {
        if (b.tag !== 'cover') return;
        b.position[2] = -distanceM;
        this.boxMeshes[i].position.z = b.position[2];
        this.phys!.boxColliders[i].setTranslation({ x: b.position[0], y: b.position[1], z: b.position[2] });
      });
    }
    this.scenario = createScenario(mode, this.scenarioHooks(), distanceM);
  }

  private boxMeshes: THREE.Mesh[] = [];

  private scenarioHooks() {
    const t0 = () => this.targets[0];
    return {
      nowSec: () => this.simTime,
      playerSpeedMps: () => this.playerSpeedMps,
      rng: () => this.rand(),
      placeTarget: (x: number, z: number) => t0().group.position.set(x, 0, z),
      moveTarget: (dx: number) => t0().group.position.setX(t0().group.position.x + dx),
      hideTarget: () => (t0().group.visible = false),
      showTarget: () => (t0().group.visible = true),
      targetAlive: () => t0().alive,
      reviveTarget: () => {
        t0().alive = true;
        t0().hp = TARGET_HP;
        t0().group.visible = true;
      },
      isTargetVisible: () => this.checkTargetVisible(),
      endRound: (rec: RoundResult) => {
        // 引擎只产出回合骨架；参数版本/武器等由外层补全（固定参数快照，§十四）
        this.onRoundCb?.(rec);
      },
    };
  }

  /** 可见性口径：目标头部判定体中心与相机之间无墙体遮挡 */
  private checkTargetVisible(): boolean {
    const t = this.targets[0];
    if (!t || !t.group.visible || !t.alive) return false;
    this.syncCamera();
    const headPos = new THREE.Vector3();
    t.group.children[1].getWorldPosition(headPos);
    const dir = headPos.clone().sub(this.camera.position);
    const dist = dir.length();
    dir.normalize();
    const rc = new THREE.Raycaster(this.camera.position.clone(), dir, 0.01, dist - 0.1);
    return rc.intersectObjects(this.wallMeshes, false).length === 0;
  }

  /** 会话中断：进行中的回合记为 abort（红线：失败回合不剔除） */
  abortRound(): void {
    this.scenario?.abort();
  }

  setWeapon(w: WeaponProfile): void {
    this.weapon = w;
  }

  private track<T extends { dispose(): void }>(r: T): T {
    this.disposables.push(r);
    return r;
  }

  private buildScene(): void {
    if (!this.map) return;
    this.scene.background = new THREE.Color(0x1a1d24);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x333a45, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(10, 20, 8);
    this.scene.add(sun);

    const [gx, gz] = this.map.ground.size;
    const ground = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(gx, gz)),
      this.track(new THREE.MeshLambertMaterial({ color: 0x3a4048 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.userData.kind = 'wall';
    this.scene.add(ground);
    this.wallMeshes.push(ground);
    this.scene.add(new THREE.GridHelper(Math.max(gx, gz), Math.max(gx, gz), 0x555c66, 0x2c313a));

    // 墙体/掩体：高对比配色（手册 §9.3）；userData.kind='wall' 供射线判遮挡
    for (const b of this.map.boxes) {
      const mesh = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(...b.size)),
        this.track(new THREE.MeshLambertMaterial({ color: b.tag === 'cover' ? 0x7a6a4f : 0x59616e })),
      );
      mesh.position.set(...b.position);
      mesh.userData.kind = 'wall';
      this.scene.add(mesh);
      this.targetMeshes.push(mesh);
      this.wallMeshes.push(mesh);
      this.boxMeshes.push(mesh);
    }
    this.targetMeshes.push(ground);

    // 几何人形占位目标（胶囊+方块组合，手册 §8.1 第一步）；
    // 命中区即判定体本身：头部球体 / 躯干胶囊（§8.3 简化判定体）
    for (const [idx, t] of this.map.targetSpawns.entries()) {
      const group = new THREE.Group();
      const bodyMat = this.track(new THREE.MeshLambertMaterial({ color: 0xc24b4b }));
      const headMat = this.track(new THREE.MeshLambertMaterial({ color: 0xd9d9d9 }));
      const body = new THREE.Mesh(this.track(new THREE.CapsuleGeometry(0.35, 0.9, 4, 12)), bodyMat);
      body.position.y = 0.95;
      body.userData = { kind: 'target', part: 'body', targetIdx: idx };
      const head = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.22, 16, 12)), headMat);
      head.position.y = 1.75;
      head.userData = { kind: 'target', part: 'head', targetIdx: idx };
      group.add(body, head);
      group.position.set(...t.position);
      this.scene.add(group);
      this.targetMeshes.push(body, head);
      this.targets.push({
        group,
        bodyMat,
        headMat,
        spawn: [...t.position],
        hp: TARGET_HP,
        alive: true,
        respawnAtSec: 0,
        flashUntilSec: 0,
      });
    }

    const spawn = this.map.playerSpawn;
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.syncCamera();
  }

  /** 键盘与扳机监听（仅锁定时生效），dispose 时全部移除 */
  private bindDom(): void {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (!this.input.isLocked()) return;
      if (down) this.keys.add(e.code);
      else this.keys.delete(e.code);
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const md = (e: MouseEvent) => {
      if (this.input.isLocked() && e.button === 0) this.triggerHeld = true;
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) this.triggerHeld = false;
    };
    // 失焦/切后台：清空按键与扳机，防止状态卡住（手册 §3.4 中断处理）
    const blur = () => {
      this.triggerHeld = false;
      this.keys.clear();
    };
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    document.addEventListener('mousedown', md);
    document.addEventListener('mouseup', mu);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);
    this.domCleanup.push(() => {
      document.removeEventListener('keydown', kd);
      document.removeEventListener('keyup', ku);
      document.removeEventListener('mousedown', md);
      document.removeEventListener('mouseup', mu);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
    });
  }

  setSensitivity(radiansPerCount: number): void {
    if (!(radiansPerCount > 0) || radiansPerCount > 0.05) return; // 范围校验（手册 §5.3）
    this.sensRadiansPerCount = radiansPerCount;
  }

  private syncCamera(): void {
    if (this.phys) {
      const p = this.phys.body.translation();
      this.camera.position.set(p.x, p.y + EYE_OFFSET, p.z);
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld(); // 射线判定在渲染帧之间进行，必须手动刷新矩阵
  }

  private simulate(step: number): void {
    // 1) 输入采样（视角：鼠标位移绝不乘帧时间，§7.1）
    const { dx, dy } = this.input.consumeDelta();
    if (dx !== 0 || dy !== 0) {
      this.yaw -= dx * this.sensRadiansPerCount;
      this.pitch -= dy * this.sensRadiansPerCount;
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    }

    // 2) 移动与碰撞（Rapier 胶囊体，§6.2/§6.3），并跟踪玩家速度（急停指标）
    if (this.phys) {
      const before = this.phys.body.translation();
      let fx = 0;
      let fz = 0;
      if (this.keys.has('KeyW')) fz -= 1;
      if (this.keys.has('KeyS')) fz += 1;
      if (this.keys.has('KeyA')) fx -= 1;
      if (this.keys.has('KeyD')) fx += 1;
      if (fx !== 0 || fz !== 0) {
        const len = Math.hypot(fx, fz);
        fx /= len;
        fz /= len;
        // 按 yaw 旋转到世界系
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const wx = fx * cos + fz * sin;
        const wz = -fx * sin + fz * cos;
        // 速度为「训练假设」初值（参数台账：持枪跑步速度待校准）
        movePlayer(this.phys, wx, wz, RUN_SPEED_MPS, step);
      } else {
        movePlayer(this.phys, 0, 0, 0, step); // 仍需重力/贴地步进
      }
      const after = this.phys.body.translation();
      this.playerSpeedMps =
        Math.hypot(after.x - before.x, after.z - before.z) / step;
    }

    // 3) 机器人决策 / 场景规则（第二轮：预设路线 peek，不还击 §11.2）
    // 4) 姿态和命中区更新：目标重生与受击闪白恢复（场景模式下所有目标由场景规则管理，不走通用重生）
    for (const t of this.targets) {
      if (!this.scenario) {
        if (!t.alive && this.simTime >= t.respawnAtSec) {
          t.alive = true;
          t.hp = TARGET_HP;
          t.group.visible = true;
        }
      }
      if (t.flashUntilSec > 0 && this.simTime >= t.flashUntilSec) {
        t.flashUntilSec = 0;
        t.bodyMat.color.setHex(0xc24b4b);
        t.headMat.color.setHex(0xd9d9d9);
        t.bodyMat.emissive.setHex(0x000000);
        t.headMat.emissive.setHex(0x000000);
      }
    }

    // 5) 射击判定：射速检查 → 误差 → 射线 → 最近交点 → 部位 → 伤害（§10.2）
    if (this.triggerHeld && canFire(this.lastShotSec, this.simTime, this.weapon.fireRate.value ?? 0)) {
      this.lastShotSec = this.simTime;
      this.shots += 1;
      this.shotIndex += 1;
      this.fireRay();
    }

    // 6) 事件记录：场景规则步进（回合结算含失败回合）+ 统计推送 + 单调时钟
    this.scenario?.onStep(step);
    this.simTime += step;
    this.statsTimer += step;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      this.emitStats();
    }
  }

  private fireRay(): void {
    this.syncCamera(); // 射击判定使用最新姿态
    // 误差模型（§10.3）：基础散布 + 移动误差（官方 3°/6° 增量），种子随机取样
    const deg = spreadDeg({ speedMps: this.playerSpeedMps, shotIndex: this.shotIndex });
    const [yawOff, pitchOff] = sampleSpread(deg, this.rand);
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 200;
    // 在相机射线方向上叠加散布偏角
    const dir = this.raycaster.ray.direction.clone();
    const up = new THREE.Vector3(0, 1, 0);
    dir.applyAxisAngle(up, yawOff);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    dir.applyAxisAngle(right, pitchOff);
    this.raycaster.ray.direction.copy(dir);
    const hits = this.raycaster.intersectObjects(this.targetMeshes, false);
    this.emit({ type: 'fire', atSec: this.simTime });

    let hitTarget = false;
    let hitPart: 'head' | 'body' | 'leg' | null = null;
    let endPoint: THREE.Vector3 | null = null;
    const hit = hits[0];
    if (hit) {
      endPoint = hit.point;
      const ud = hit.object.userData as { kind?: string; part?: 'head' | 'body' | 'leg'; targetIdx?: number };
      if (ud.kind === 'target' && ud.targetIdx !== undefined) {
        const t = this.targets[ud.targetIdx];
        if (t.alive) {
          hitTarget = true;
          hitPart = ud.part ?? 'body';
          const dmg = this.weapon.baseDamage[hitPart];
          t.hp -= dmg;
          this.hits += 1;
          this.emit({ type: 'hit', atSec: this.simTime, part: hitPart });
          if (t.hp <= 0) {
            t.alive = false;
            t.group.visible = false;
            t.respawnAtSec = this.simTime + RESPAWN_SEC;
            this.emit({ type: 'kill', atSec: this.simTime });
          } else {
            // 受击闪白反馈
            t.flashUntilSec = this.simTime + 0.12;
            t.bodyMat.emissive.setHex(0xffffff);
            t.headMat.emissive.setHex(0xffffff);
          }
        }
      }
      // 命中墙体：仅弹着点，无伤害（§10.2 判断墙体或命中部位）
    }
    // 场景规则记录本发结果（含散布导致的未命中，§10.4 覆盖「准星对准但散布未命中」）
    this.scenario?.onFired({ hitTarget, part: hitPart });
    // 曳光：纯视觉效果，不参与命中判定（红线）
    this.spawnTracer(endPoint ?? this.raycaster.ray.at(80, new THREE.Vector3()));
  }

  private spawnTracer(end: THREE.Vector3): void {
    const start = this.camera.position.clone();
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, geo, mat, untilSec: this.simTime + 0.06 });
  }

  private renderFrame(): void {
    const t0 = performance.now();
    this.syncCamera();
    // 清理过期曳光
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      if (this.simTime >= tr.untilSec) {
        this.scene.remove(tr.line);
        tr.geo.dispose();
        tr.mat.dispose();
        this.tracers.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.lastFrameMs = performance.now() - t0;
  }

  private emitStats(): void {
    const stats: SessionStats = {
      simTimeSec: this.simTime,
      shotsFired: this.shots,
      hits: this.hits,
      frameMs: this.lastFrameMs,
    };
    for (const l of this.statsListeners) l(stats);
  }

  private emit(e: SessionEvent): void {
    for (const l of this.eventListeners) l(e);
  }

  onStats(l: StatsListener): () => void {
    this.statsListeners.add(l);
    return () => this.statsListeners.delete(l);
  }

  onEvent(l: EventListener): () => void {
    this.eventListeners.add(l);
    return () => this.eventListeners.delete(l);
  }

  get pointerInput(): PointerLockInput {
    return this.input;
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    this.input.attach();
    this.loop.start();
  }

  pause(): void {
    this.loop.stop();
    this.triggerHeld = false;
    this.keys.clear();
  }

  resume(): void {
    this.loop.start();
  }

  reset(): void {
    this.loop.stop();
    this.simTime = 0;
    this.shots = 0;
    this.hits = 0;
    this.shotIndex = 0;
    this.lastShotSec = null;
    this.triggerHeld = false;
    this.keys.clear();
    this.playerSpeedMps = 0;
    this.rand = mulberry32(this.seed); // 同一种子 → 可复现（验收标准：复现测试）
    if (this.map && this.phys) {
      const s = this.map.playerSpawn.position;
      this.phys.body.setTranslation({ x: s[0], y: 0.9, z: s[2] }, true);
      this.phys.vy = 0;
      this.yaw = this.map.playerSpawn.yaw;
      this.pitch = 0;
    }
    for (const [i, t] of this.targets.entries()) {
      const scenarioManaged = this.scenario !== null;
      if (scenarioManaged && i > 0) continue; // 场景模式下其余目标保持退场
      t.alive = true;
      t.hp = TARGET_HP;
      t.group.visible = true;
    }
    this.scenario?.reset();
    this.syncCamera();
    this.loop.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.input.detach();
    this.input.exitLock();
    for (const c of this.domCleanup) c();
    this.statsListeners.clear();
    this.eventListeners.clear();
    for (const tr of this.tracers) {
      tr.geo.dispose();
      tr.mat.dispose();
    }
    if (this.phys) freePhysics(this.phys);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
