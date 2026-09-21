export function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-300">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
      <p className="text-sm">正在加载训练场景…</p>
    </div>
  );
}

export function LoadErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-zinc-200">
      <div className="max-w-md space-y-4 rounded-xl border border-red-900/50 bg-zinc-900 p-8 text-center">
        <h1 className="text-xl font-bold text-red-400">场景加载失败</h1>
        <p className="break-all text-sm text-zinc-400">{message}</p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium hover:bg-red-500"
        >
          重试
        </button>
      </div>
    </div>
  );
}
