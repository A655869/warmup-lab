import { WEAPONS, PARAM_STATUS_LABEL } from '@/data/params';

export interface TrainingConfig {
  scenarioId: 'stop-shot' | 'hold-angle';
  weaponId: 'vandal' | 'phantom';
  distanceM: number;
  difficulty: 'standard' | 'plus';
}

export const SCENARIO_LABEL: Record<TrainingConfig['scenarioId'], string> = {
  'stop-shot': '急停首发 · 灰盒通道',
  'hold-angle': '架枪反应 · 掩体出枪区',
};

/** 准备界面侧边栏：模式 / 武器 / 距离 / 难度（手册 §5.2） */
export function SetupPanel({
  config,
  onChange,
  onStart,
}: {
  config: TrainingConfig;
  onChange: (c: TrainingConfig) => void;
  onStart: () => void;
}) {
  return (
    <aside className="flex w-72 flex-col gap-5 border-l border-zinc-800 bg-zinc-900/80 p-5 text-zinc-200">
      <div>
        <h1 className="text-lg font-bold">Warmup Lab</h1>
        <p className="mt-1 text-xs text-zinc-500">适用于无畏契约玩家的非官方训练工具</p>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-zinc-400">训练模块</span>
        <select
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 p-2"
          value={config.scenarioId}
          onChange={(e) => onChange({ ...config, scenarioId: e.target.value as TrainingConfig['scenarioId'] })}
        >
          {Object.entries(SCENARIO_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-zinc-400">武器</span>
        <select
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 p-2"
          value={config.weaponId}
          onChange={(e) => onChange({ ...config, weaponId: e.target.value as 'vandal' | 'phantom' })}
        >
          {Object.values(WEAPONS).map((w) => (
            <option key={w.id} value={w.id}>
              {w.displayName}（射速 {w.fireRate.value} {w.fireRate.unit} ·{' '}
              {PARAM_STATUS_LABEL[w.fireRate.status]}）
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-zinc-400">训练距离</span>
        <select
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 p-2"
          value={config.distanceM}
          onChange={(e) => onChange({ ...config, distanceM: Number(e.target.value) })}
        >
          {[10, 20, 30].map((d) => (
            <option key={d} value={d}>
              {d} 米
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-zinc-400">难度</span>
        <select
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 p-2"
          value={config.difficulty}
          onChange={(e) => onChange({ ...config, difficulty: e.target.value as 'standard' | 'plus' })}
        >
          <option value="standard">标准</option>
          <option value="plus">强化模式（成绩不与标准模式比较）</option>
        </select>
      </label>

      <button
        onClick={onStart}
        className="mt-auto rounded-lg bg-red-600 py-3 text-sm font-bold hover:bg-red-500"
      >
        开始训练（点击后锁定鼠标）
      </button>
      <p className="text-xs leading-relaxed text-zinc-500">
        提示：训练中按 Esc 退出鼠标锁定将自动暂停。机制为可校准近似模型，不承诺与游戏客户端完全一致。
      </p>
    </aside>
  );
}
