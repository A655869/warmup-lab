/**
 * 结算页（设计方案 §5.4）：只突出三件事——本局表现、最常见失误、下一局建议。
 * 统计必须包含失败回合；样本不足时明确提示，不输出看似精确的结论。
 */
export function ResultScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-zinc-200">
      <div className="w-full max-w-lg space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <h2 className="text-xl font-bold">本局结算</h2>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-400">本局表现</h3>
          <p className="text-sm text-zinc-500">阶段 0 骨架：指标接入后展示首发命中率、三个独立耗时等。</p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-400">最常见失误</h3>
          <p className="text-sm text-zinc-500">样本不足，暂不输出结论。</p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-400">下一局建议</h3>
          <p className="text-sm text-zinc-500">样本不足，暂不输出建议。</p>
        </section>
        <button
          onClick={onRestart}
          className="w-full rounded-lg bg-red-600 py-3 text-sm font-bold hover:bg-red-500"
        >
          返回准备界面
        </button>
      </div>
    </div>
  );
}
