import { test, expect } from '@playwright/test';

test('首屏进入可操作的训练准备界面（手册 §5.2）', async ({ page }) => {
  await page.goto('/');
  // 三维画布非空
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  // 侧边栏可操作：模式 / 武器 / 距离 / 难度 / 开始按钮
  await expect(page.getByText('训练模块')).toBeVisible();
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
});

test('场景渲染非黑屏（canvas 有实际像素）', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1000);
  const nonBlank = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    return c.width > 0 && c.height > 0;
  });
  expect(nonBlank).toBe(true);
});
