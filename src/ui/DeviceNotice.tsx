export function DeviceNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-zinc-200">
      <div className="max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <h1 className="text-xl font-bold">设备不满足训练要求</h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Warmup Lab 是面向无畏契约玩家的非官方训练工具，首版仅支持
          <b className="text-zinc-200"> Windows 桌面端 Chrome / Edge 浏览器与键鼠</b>。
          请使用符合要求的设备打开。
        </p>
      </div>
    </div>
  );
}
