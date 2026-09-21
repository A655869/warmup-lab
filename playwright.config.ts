import { defineConfig, devices } from '@playwright/test';

/**
 * 端到端（手册 §13.1）：菜单、设置、暂停、存储和截图，确保三维画布非空。
 * 浏览器二进制安装到 D 盘：PLAYWRIGHT_BROWSERS_PATH=D:\1\kimi1\.playwright npx playwright install chromium
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
});
