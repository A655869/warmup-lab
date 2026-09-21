/** 设备与运行基线检查（手册 §二）：首版仅支持 Windows 桌面端 Chrome/Edge 与键鼠 */
export function isSupportedDevice(): boolean {
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua) || 'ontouchstart' in window;
  const isChromium = /Chrome|Edg\//.test(ua);
  return !isMobile && isChromium;
}
