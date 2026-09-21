import { useRef, useState } from 'react';
import type { RoundRecord } from '@/data/db';
import { buildFeedback } from '@/data/summary';
import { exportJson, exportCsv, importJson, clearAll, downloadText } from '@/data/export';

/**
 * 结算页（设计方案 §5.4）：只突出三件事——本局表现、最常见失误、下一局建议。
 * 数据操作：JSON 备份导入、CSV 导出、清空数据（手册 §12.2）。
 */
export function ResultScreen({
  rounds,
  mode,
  onRestart,
}: {
  rounds: RoundRecord[];
  mode: 'stop-shot' | 'hold-angle';
  onRestart: () => void;
}) {
  const fb = buildFeedback(rounds, mode);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-zinc-200">
      <div className="w-full max-w-lg space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <h2 className="text-xl font-bold">本局结算</h2>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-400">本局表现</h3>
          <p className="text-sm leading-relaxed">{fb.performance}</p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-400">最常见失误</h3>
          <p className="text-sm leading-relaxed">{fb.mistake}</p>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-400">下一局建议</h3>
          <p className="text-sm leading-relaxed">{fb.advice}</p>
        </section>

        <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4 text-xs">
          <button
            className="rounded-md border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800"
            onClick={async () =>
              downloadText(`warmup-lab-backup-${Date.now()}.json`, await exportJson())
            }
          >
            导出 JSON 备份
          </button>
          <button
            className="rounded-md border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800"
            onClick={async () =>
              downloadText(`warmup-lab-rounds-${Date.now()}.csv`, await exportCsv(), 'text/csv')
            }
          >
            导出 CSV
          </button>
          <button
            className="rounded-md border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800"
            onClick={() => fileRef.current?.click()}
          >
            导入备份
          </button>
          <button
            className="rounded-md border border-red-900 px-3 py-1.5 text-red-400 hover:bg-red-950"
            onClick={async () => {
              if (window.confirm('确定清空全部本地训练数据？此操作不可恢复。')) {
                await clearAll();
                setNotice('已清空全部数据。');
              }
            }}
          >
            清空数据
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const n = await importJson(await f.text());
                setNotice(`已导入 ${n} 条回合记录。`);
              } catch (err) {
                setNotice(`导入失败：${err instanceof Error ? err.message : String(err)}`);
              }
              e.target.value = '';
            }}
          />
        </div>
        {notice && <p className="text-xs text-amber-400">{notice}</p>}

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
