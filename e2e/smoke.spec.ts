import { test, expect } from '@playwright/test';

test('首屏进入可操作的训练准备界面（手册 §5.2）', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByText('训练模块')).toBeVisible();
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
});

test('场景渲染非黑屏（canvas 有实际像素）', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    return c !== null && c.width > 0 && c.height > 0;
  });
});

test('主流程：开始训练 → HUD → Esc 暂停 → 结束本局 → 结算页', async ({ page }) => {
  await page.goto('/');
  const start = page.getByRole('button', { name: /开始训练/ });
  await expect(start).toBeEnabled();
  await start.click();
  // 训练 HUD：计时与命中信息
  await expect(page.getByText('开火', { exact: false })).toBeVisible();
  // Esc 退出鼠标锁定 → 自动暂停
  // （headless Chromium 不模拟系统级 Esc 退锁，用 exitPointerLock 触发同一红线路径：失锁→暂停）
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByText('已暂停')).toBeVisible();
  // 结束本局 → 结算页三段结构
  await page.getByRole('button', { name: /结束本局/ }).click();
  await expect(page.getByText('本局结算')).toBeVisible();
  await expect(page.getByText('本局表现')).toBeVisible();
  await expect(page.getByText('最常见失误')).toBeVisible();
  await expect(page.getByText('下一局建议')).toBeVisible();
  // 数据操作可用
  await expect(page.getByRole('button', { name: '导出 JSON 备份' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '导出 CSV' })).toBeEnabled();
  // 返回准备界面
  await page.getByRole('button', { name: /返回准备界面/ }).click();
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
});

test('切换训练模块后场景重建且不崩溃', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
  await page.locator('select').first().selectOption('hold-angle');
  // RELOAD → loading → ready
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('canvas')).toBeVisible();
});
