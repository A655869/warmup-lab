import * as THREE from 'three';
import { FixedStepLoop } from './loop';
import { PointerLockInput } from './input';
import type { TrainingSession, SessionStats, StatsListener } from './TrainingSession';
import { loadMap } from '@/scenarios/loader';
import type { TrainingMap } from '@/scenarios/types';

/**
 * 阶段 0 引擎会话骨架：
 * - 加载灰盒地图并渲染（Three.js）；
 * - 120 Hz 固定步长模拟循环（当前仅推进时钟，移动/物理在阶段 1 接入 Rapier）；
 * - 每 250ms 向 React 推送一次聚合统计；
 * - dispose 释放事件监听、渲染器与几何/材质资源（手册 §6.4）。
 */
export class GrayboxSession implements TrainingSession {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private loop: FixedStepLoop;
  private input: PointerLockInput;
  private map: TrainingMap | null = null;
  private simTime = 0;
  private statsTimer = 0;
  private lastFrameMs = 0;
  private listeners = new Set<StatsListener>();
  private disposed = false;
  private disposables: { dispose(): void }[] = [];
  private readonly canvas: HTMLCanvasElement;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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

  static async create(canvas: HTMLCanvasElement, mapUrl: string): Promise<GrayboxSession> {
    const s = new GrayboxSession(canvas);
    s.map = await loadMap(mapUrl); // 校验失败会抛出 → 进入「加载失败」页
    s.buildScene();
    s.resize();
    return s;
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
    const groundGeo = this.track(new THREE.PlaneGeometry(gx, gz));
    const groundMat = this.track(new THREE.MeshLambertMaterial({ color: 0x3a4048 }));
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(Math.max(gx, gz), Math.max(gx, gz), 0x555c66, 0x2c313a);
    this.scene.add(grid);

    // 墙体/掩体：高对比配色，避免装饰影响目标识别（手册 §9.3）
    for (const b of this.map.boxes) {
      const geo = this.track(new THREE.BoxGeometry(...b.size));
      const mat = this.track(
        new THREE.MeshLambertMaterial({ color: b.tag === 'cover' ? 0x7a6a4f : 0x59616e }),
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...b.position);
      this.scene.add(mesh);
    }

    // 几何人形占位目标（胶囊+方块组合，手册 §8.1 第一步）
    for (const t of this.map.targetSpawns) {
      const body = new THREE.Mesh(
        this.track(new THREE.CapsuleGeometry(0.35, 0.9, 4, 12)),
        this.track(new THREE.MeshLambertMaterial({ color: 0xc24b4b })),
      );
      body.position.set(t.position[0], 0.95, t.position[2]);
      this.scene.add(body);
      const head = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(0.22, 16, 12)),
        this.track(new THREE.MeshLambertMaterial({ color: 0xd9d9d9 })),
      );
      head.position.set(t.position[0], 1.75, t.position[2]);
      this.scene.add(head);
    }

    const spawn = this.map.playerSpawn;
    this.camera.position.set(spawn.position[0], 1.6, spawn.position[2]);
    this.camera.rotation.set(0, spawn.yaw, 0, 'YXZ');
  }

  private simulate(step: number): void {
    // 阶段 0：仅推进单调时钟；移动/碰撞/机器人/命中在后续轮次接入。
    this.simTime += step;
    this.statsTimer += step;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      this.emitStats();
    }
  }

  private renderFrame(): void {
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.lastFrameMs = performance.now() - t0;
  }

  private emitStats(): void {
    const stats: SessionStats = {
      simTimeSec: this.simTime,
      shotsFired: 0,
      hits: 0,
      frameMs: this.lastFrameMs,
    };
    for (const l of this.listeners) l(stats);
  }

  onStats(l: StatsListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
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
  }

  resume(): void {
    this.loop.start();
  }

  reset(): void {
    this.loop.stop();
    this.simTime = 0;
    this.loop.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.input.detach();
    this.input.exitLock();
    this.listeners.clear();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
