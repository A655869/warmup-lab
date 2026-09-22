import { test, expect } from '@playwright/test';

/**
 * 第三轮：Blender 低模人物 GLB 接入验证（手册 §8）
 * - GLB 加载：五动画剪辑齐全、命中区绑定 Head/Spine 骨骼并入射线判定网；
 * - 调试开关：准备界面复选框即时切换命中区线框；
 * - 难度参数化：架枪 plus 模式 peek 0.22s / 反应窗口 3s，peek 期间播放 Strafe 动画。
 */

test('人物 GLB 加载：五动画齐全，命中区绑定骨骼并入网', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
  const info = await page.evaluate(() => {
    const s = (window as unknown as { __session: any }).__session;
    const avatar = s.avatar;
    return {
      clips: [...avatar.actions.keys()],
      headInNet: s.targetMeshes.includes(avatar.hitZones.head),
      bodyInNet: s.targetMeshes.includes(avatar.hitZones.body),
      currentAnim: avatar.current,
      headBoundBone: avatar.hitZones.head.parent?.name,
      bodyBoundBone: avatar.hitZones.body.parent?.name,
      // 几何占位体已隐藏且退出射线列表（不挡射线）
      placeholderGone: s.targets[0].group.children
        .filter((c: any) => c !== avatar.group)
        .every((c: any) => c.visible === false && !s.targetMeshes.includes(c)),
    };
  });
  expect(info.clips).toEqual(
    expect.arrayContaining(['Idle', 'StrafeLeft', 'StrafeRight', 'Crouch', 'Hit', 'Fire']),
  );
  expect(info.headInNet).toBe(true);
  expect(info.bodyInNet).toBe(true);
  expect(info.currentAnim).toBe('Idle');
  expect(info.headBoundBone).toBe('Head');
  expect(info.bodyBoundBone).toBe('Spine');
  expect(info.placeholderGone).toBe(true);
});

test('命中区调试开关即时生效（§8.3）', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
  const wireVisible = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __session: any }).__session;
      return (
        s.avatar.hitZones.head.userData.debugWire.visible &&
        s.avatar.hitZones.body.userData.debugWire.visible
      );
    });
  expect(await wireVisible()).toBe(false);
  await page.getByText('命中区调试显示').click();
  expect(await wireVisible()).toBe(true);
  await page.getByText('命中区调试显示').click();
  expect(await wireVisible()).toBe(false);
});

test('架枪强化模式：peek 更快且触发 Strafe 动画', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
  await page.locator('select').first().selectOption('hold-angle');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled({ timeout: 15000 });
  await page.locator('select').nth(3).selectOption('plus');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled({ timeout: 15000 });

  const res = await page.evaluate(() => {
    const s = (window as unknown as { __session: any }).__session;
    const sc = s.scenario;
    const seenAnims = new Set<string>();
    // 手动定步驱动 4 秒（嵌入/无头环境 rAF 可能节流，绕过渲染帧直接步进逻辑帧）
    for (let i = 0; i < 480 && sc.phase !== 'exposed' && sc.phase !== 'done'; i++) {
      s.simulate(1 / 120);
      seenAnims.add(s.avatar.baseAnim);
    }
    return {
      peekDurationSec: sc.peekDurationSec,
      timeoutSec: sc.timeoutSec,
      phase: sc.phase,
      anims: [...seenAnims],
    };
  });
  expect(res.peekDurationSec).toBeCloseTo(0.22);
  expect(res.timeoutSec).toBe(3);
  expect(res.phase).toBe('exposed'); // 4 秒内必然完成一次 peek
  expect(res.anims.some((a) => a === 'StrafeLeft' || a === 'StrafeRight')).toBe(true);
  expect(res.anims).toContain('Idle'); // peek 完成后回待机
});

test('命中人物触发受击动画反馈', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
  const res = await page.evaluate(() => {
    const s = (window as unknown as { __session: any }).__session;
    s.avatar.playHit();
    const during = s.avatar.current;
    s.avatar.update(0.4); // 推进超过受击动画时长
    return { during, after: s.avatar.current };
  });
  expect(res.during).toBe('Hit');
  expect(res.after).toBe('Idle');
});

test('机器人暴露后开火：Fire 动画 + 枪口火光 + 曳光（纯视觉）', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled();
  await page.locator('select').first().selectOption('hold-angle');
  await expect(page.getByRole('button', { name: /开始训练/ })).toBeEnabled({ timeout: 15000 });

  const res = await page.evaluate(() => {
    const s = (window as unknown as { __session: any }).__session;
    const sc = s.scenario;
    const seenAnims = new Set<string>();
    let flashSeen = false;
    // 驱动到暴露后再走 1.5 秒：机器人应已开火数发（无渲染帧时曳光不被清理，可计数）
    let extra = 0;
    for (let i = 0; i < 1200 && extra < 180; i++) {
      s.simulate(1 / 120);
      seenAnims.add(s.avatar.current);
      if (s.avatar.muzzleFlash.visible) flashSeen = true;
      if (sc.phase === 'exposed') extra++;
    }
    return {
      phase: sc.phase,
      anims: [...seenAnims],
      flashSeen,
      tracerCount: s.tracers.length,
    };
  });
  expect(res.phase).toBe('exposed');
  expect(res.anims).toContain('Fire');
  expect(res.flashSeen).toBe(true);
  expect(res.tracerCount).toBeGreaterThan(0);
});
