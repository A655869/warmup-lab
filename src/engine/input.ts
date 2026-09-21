/**
 * 鼠标输入（开发手册 §7.1）：
 * - 通过 Pointer Lock 获取相对鼠标移动；
 * - 尝试申请 unadjustedMovement（原始输入），不支持时明确降级并提示；
 * - 视角更新：yaw -= deltaX * radiansPerCount；鼠标位移绝不乘帧时间。
 */

export type UnadjustedSupport = 'supported' | 'unsupported' | 'unknown';

export interface MouseDelta {
  dx: number;
  dy: number;
}

export class PointerLockInput {
  private delta: MouseDelta = { dx: 0, dy: 0 };
  private moveHandler: ((e: MouseEvent) => void) | null = null;
  private locked = false;
  private readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  /** 请求鼠标锁定；返回原始输入支持情况，供 UI 降级提示 */
  async requestLock(): Promise<UnadjustedSupport> {
    const el = this.element as HTMLElement & {
      requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    try {
      const result = el.requestPointerLock({ unadjustedMovement: true });
      if (result instanceof Promise) await result;
      return 'supported';
    } catch {
      // 降级：不带 unadjustedMovement 重新申请
      try {
        const result = el.requestPointerLock();
        if (result instanceof Promise) await result;
        return 'unsupported';
      } catch {
        return 'unknown';
      }
    }
  }

  exitLock(): void {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  isLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** 开始累计相对位移（不乘帧时间） */
  attach(): void {
    if (this.moveHandler) return;
    this.moveHandler = (e: MouseEvent) => {
      if (!this.isLocked()) return;
      this.delta.dx += e.movementX;
      this.delta.dy += e.movementY;
    };
    document.addEventListener('mousemove', this.moveHandler);
    this.locked = true;
  }

  /** 读取并清零本模拟步的累计位移 */
  consumeDelta(): MouseDelta {
    const d = this.delta;
    this.delta = { dx: 0, dy: 0 };
    return d;
  }

  detach(): void {
    if (this.moveHandler) {
      document.removeEventListener('mousemove', this.moveHandler);
      this.moveHandler = null;
    }
    this.locked = false;
  }

  get attached(): boolean {
    return this.locked;
  }
}

/**
 * 灵敏度换算（占位，必须通过「转身距离校准工具」实测核验后才允许作为默认值）。
 * yaw -= deltaX * radiansPerCount
 */
export function radiansPerCount(sens: number, yawPerSens: number): number {
  return sens * yawPerSens;
}
