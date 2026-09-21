import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageMachine, usePointerLockPause } from './hooks';
import { isSupportedDevice } from './device';
import { GrayboxSession } from '@/engine/session';
import type { SessionStats, SessionEvent } from '@/engine/TrainingSession';
import { WEAPONS, PARAMS_VERSION } from '@/data/params';
import { db, type RoundRecord } from '@/data/db';
import { DeviceNotice } from '@/ui/DeviceNotice';
import { LoadingScreen, LoadErrorScreen } from '@/ui/LoadingScreen';
import { SetupPanel, type TrainingConfig } from '@/ui/SetupPanel';
import { TrainingHUD } from '@/ui/TrainingHUD';
import { PausedOverlay } from '@/ui/PausedOverlay';
import { ResultScreen } from '@/ui/ResultScreen';

const MAP_URLS: Record<TrainingConfig['scenarioId'], string> = {
  'stop-shot': 'assets/maps/graybox-stop-corridor-01.json',
  'hold-angle': 'assets/maps/graybox-cover-peek-01.json',
};

type RoundInput = Omit<RoundRecord, 'id' | 'paramsVersion' | 'scenarioVersion' | 'weaponId' | 'startedAt'>;

export function AppShell() {
  const { state, send } = usePageMachine('loading');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<GrayboxSession | null>(null);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [lastEvent, setLastEvent] = useState<SessionEvent | null>(null);
  const [rawInputNote, setRawInputNote] = useState<string | null>(null);
  const [sessionRounds, setSessionRounds] = useState<RoundRecord[]>([]);
  const [config, setConfig] = useState<TrainingConfig>({
    scenarioId: 'stop-shot',
    weaponId: 'vandal',
    distanceM: 20,
    difficulty: 'standard',
  });
  const configRef = useRef(config);
  configRef.current = config;

  // 武器切换即时生效（不需重建会话）
  useEffect(() => {
    sessionRef.current?.setWeapon(WEAPONS[config.weaponId]);
  }, [config.weaponId]);

  // 回合结束 → 写入 IndexedDB（含失败回合，不得剔除）+ 本局列表
  const handleRoundRef = useRef((rec: RoundInput) => {
    const c = configRef.current;
    const full = {
      ...rec,
      paramsVersion: PARAMS_VERSION,
      scenarioVersion: c.scenarioId,
      weaponId: c.weaponId,
      startedAt: Date.now(),
    };
    void db.rounds.add(full).then((id) => {
      setSessionRounds((prev) => [...prev, { ...full, id } as RoundRecord]);
    });
  });

  // 加载资产（状态：loading）；失败进入 load-error，不允许黑屏
  // generation 守卫：StrictMode/重复触发时丢弃过期启动，避免非法状态转换
  const bootGenRef = useRef(0);
  const boot = useCallback(async (gen: number) => {
    if (!canvasRef.current) return;
    sessionRef.current?.dispose();
    sessionRef.current = null;
    const c = configRef.current;
    try {
      const session = await GrayboxSession.create(
        canvasRef.current,
        MAP_URLS[c.scenarioId],
        WEAPONS[c.weaponId],
        {
          scenario: c.scenarioId,
          distanceM: c.distanceM,
          seed: Date.now() % 2147483647,
          onRound: (rec) => handleRoundRef.current(rec),
        },
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

  // 准备界面切换训练模块/距离 → 重建会话（RELOAD → loading → ready）
  const bootedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${config.scenarioId}@${config.distanceM}`;
    if (state === 'ready' && bootedKeyRef.current === null) bootedKeyRef.current = key;
    if (state === 'ready' && bootedKeyRef.current !== key) {
      bootedKeyRef.current = key;
      send('RELOAD');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, config.scenarioId, config.distanceM]);

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
    setSessionRounds([]); // 新一局清空本局回合列表（历史已在 IndexedDB）
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

  // Esc 键兜底：若指针锁定未生效（少数环境），仍保证 Esc 可暂停
  useEffect(() => {
    if (state !== 'training') return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.pointerLockElement) {
        sessionRef.current?.pause();
        send('PAUSE');
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const resume = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await session.pointerInput.requestLock();
    session.resume();
    send('RESUME');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    // 进行中的回合记为中断（abort），失败回合计入统计（红线）
    sessionRef.current?.abortRound();
    sessionRef.current?.pause();
    send('FINISH');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupportedDevice()) return <DeviceNotice />;

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* 中间三维场景：首屏即进入可操作的训练准备界面（手册 §5.2） */}
      <main className="relative flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {state === 'training' && <TrainingHUD stats={stats} lastEvent={lastEvent} />}
        {state === 'paused' && <PausedOverlay onResume={resume} onFinish={finish} />}
        {rawInputNote && state === 'training' && (
          <div className="absolute left-4 top-20 max-w-xs rounded-md bg-amber-900/80 px-3 py-2 text-xs text-amber-100">
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
        {state === 'result' && (
          <div className="absolute inset-0 overflow-auto">
            <ResultScreen
              rounds={sessionRounds}
              mode={config.scenarioId}
              onRestart={() => send('RESTART')}
            />
          </div>
        )}
      </main>

      {state === 'ready' && (
        <SetupPanel config={config} onChange={setConfig} onStart={startTraining} />
      )}
    </div>
  );
}
