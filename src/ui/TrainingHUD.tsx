import type { SessionStats } from '@/engine/TrainingSession';

/** 训练中 HUD（手册 §5.2）：仅保留准星、计时、回合信息 */
export function TrainingHUD({ stats }: { stats: SessionStats | null }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* 准星（阶段 0 静态十字，设置项在后续轮次接入） */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-6 w-6">
          <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-emerald-400" />
          <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-emerald-400" />
          <span className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-emerald-400" />
          <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-emerald-400" />
        </div>
      </div>
      {/* 计时与回合信息 */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-zinc-950/60 px-4 py-1 font-mono text-sm text-zinc-200">
        {stats ? stats.simTimeSec.toFixed(2) : '0.00'} s
      </div>
      <div className="absolute right-4 top-4 rounded-md bg-zinc-950/60 px-3 py-1 font-mono text-xs text-zinc-400">
        帧渲染 {stats ? stats.frameMs.toFixed(2) : '–'} ms
      </div>
    </div>
  );
}
