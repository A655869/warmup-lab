/** 暂停遮罩（手册 §5.2）：Esc 失锁自动暂停，计时停止、机器人停火（阶段 1 接入机器人） */
export function PausedOverlay({ onResume, onFinish }: { onResume: () => void; onFinish: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/70">
      <div className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-8 text-center text-zinc-200">
        <h2 className="text-xl font-bold">已暂停</h2>
        <p className="text-sm text-zinc-400">计时已停止，恢复后从暂停点继续。</p>
        <div className="flex gap-3">
          <button
            onClick={onResume}
            className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium hover:bg-red-500"
          >
            继续训练
          </button>
          <button
            onClick={onFinish}
            className="rounded-lg border border-zinc-600 px-6 py-2 text-sm hover:bg-zinc-800"
          >
            结束本局
          </button>
        </div>
      </div>
    </div>
  );
}
