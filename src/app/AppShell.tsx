import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageMachine, usePointerLockPause } from './hooks';
import { isSupportedDevice } from './device';
import { GrayboxSession } from '@/engine/session';
import type { SessionStats, SessionEvent } from '@/engine/TrainingSession';
import { WEAPONS } from '@/data/params';
import { DeviceNotice } from '@/ui/DeviceNotice';
import { LoadingScreen, LoadErrorScreen } from '@/ui/LoadingScreen';
import { SetupPanel, type TrainingConfig } from '@/ui/SetupPanel';
import { TrainingHUD } from '@/ui/TrainingHUD';
import { PausedOverlay } from '@/ui/PausedOverlay';
import { ResultScreen } from '@/ui/ResultScreen';

const MAP_URL = 'assets/maps/graybox-stop-corridor-01.json';

export function AppShell() {
  const { state, send } = usePageMachine('loading');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<GrayboxSession | null>(null);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [lastEvent, setLastEvent] = useState<SessionEvent | null>(null);
  const [rawInputNote, setRawInputNote] = useState<string | null>(null);
  const [config, setConfig] = useState<TrainingConfig>({
    scenarioId: 'graybox-stop-corridor-01',
    weaponId: 'vandal',
    distanceM: 20,
    difficulty: 'standard',
  });

  // 武器切换即时生效（不需重建会话）
  useEffect(() => {
    sessionRef.current?.setWeapon(WEAPONS[config.weaponId]);
  }, [config.weaponId]);

  // 加载资产（状态：loading）；失败进入 load-error，不允许黑屏
  // generation 守卫：StrictMode/重复触发时丢弃过期启动，避免非法状态转换
  const bootGenRef = useRef(0);
  const boot = useCallback(async (gen: number) => {
    if (!canvasRef.current) return;
    sessionRef.current?.dispose();
    sessionRef.current = null;
    try {
      const session = await GrayboxSession.create(
        canvasRef.current,
        MAP_URL,
        WEAPONS[config.weaponId],
      );
      if (gen !== bootGenRef.current) {
        session.dispose(); // 过期启动：释放资源后丢弃
        return;
      }
      session.onStats(setStats);
      session.onEvent(setLastEvent);
      // 调试钩子：便于端到端验证与问题排查
      (window as unknown as { __session?: GrayboxSession }).__session = session;
      session.start(); // 准备界面中场景照常渲染
      sessionRef.current = session;
      send('LOAD_OK');
    } catch (err) {
      if (gen !== bootGenRef.current) return;
      setLoadError(err instanceof Error ? err.message : String(err));
      send('LOAD_FAIL');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state === 'loading') void boot(++bootGenRef.current);
  }, [state, boot]);

  useEffect(() => {
    const onResize = () => sessionRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      sessionRef.current?.dispose();
    };
  }, []);

  const startTraining = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const support = await session.pointerInput.requestLock();
    if (support === 'unsupported')
      setRawInputNote('当前浏览器不支持原始鼠标输入，已降级（可能影响手感一致性）。');
    else if (support === 'unknown' && !session.pointerInput.isLocked())
      setRawInputNote('鼠标锁定失败：请直接点击画面中央后再移动鼠标；若仍无效请用 Chrome/Edge 打开。');
    session.reset();
    send('START');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc 失锁 → 自动暂停（红线：必须停计时与机器人）
  usePointerLockPause(
    useCallback(() => {
      sessionRef.current?.pause();
      send('PAUSE');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    state === 'training',
  );

  const resume = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await session.pointerInput.requestLock();
    session.resume();
    send('RESUME');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupportedDevice()) return <DeviceNotice />;

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* 中间三维场景：首屏即进入可操作的训练准备界面（手册 §5.2） */}
      <main className="relative flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {state === 'training' && <TrainingHUD stats={stats} lastEvent={lastEvent} />}
        {state === 'paused' && (
          <PausedOverlay
            onResume={resume}
            onFinish={() => {
              sessionRef.current?.pause();
              send('FINISH');
            }}
          />
        )}
        {rawInputNote && state === 'training' && (
          <div className="absolute left-4 top-4 max-w-xs rounded-md bg-amber-900/80 px-3 py-2 text-xs text-amber-100">
            {rawInputNote}
          </div>
        )}
        {(state === 'loading' || state === 'load-error') && (
          <div className="absolute inset-0">
            {state === 'loading' ? (
              <LoadingScreen />
            ) : (
              <LoadErrorScreen message={loadError} onRetry={() => send('RETRY')} />
            )}
          </div>
        )}
      </main>

      {(state === 'ready' || state === 'training' || state === 'paused') && state === 'ready' && (
        <SetupPanel config={config} onChange={setConfig} onStart={startTraining} />
      )}
      {state === 'result' && (
        <div className="absolute inset-0">
          <ResultScreen onRestart={() => send('RESTART')} />
        </div>
      )}
    </div>
  );
}
