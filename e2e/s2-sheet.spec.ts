import { expect, test, type Page } from '@playwright/test';

/**
 * The sheet at S2, in a real browser — Stage 5's acceptance run.
 *
 * What is here is what only a layout engine settles: 88% of the viewport
 * (§8.1), a backdrop actually dimming the stack, a body scroll that is really
 * locked, and a band that really moves over 200 ms on close. The behaviour
 * behind those — prefill, the live header total, the clamps, the direct-entry
 * round trip — is unit-tested in `components/sheet/Sheet.test.tsx` against the
 * same components.
 *
 * Seeded the way `s2-editor.spec.ts` seeds: the session record a refresh would
 * restore, with an empty answer map so every activity derives from its pack
 * defaults (AC 10).
 */

async function seedEditor(page: Page, answers: Record<string, unknown> = {}): Promise<void> {
  const room = await page.request.post('/api/room');
  expect(room.ok()).toBe(true);
  const { joinCode } = (await room.json()) as { joinCode: string };

  const session = await page.request.post('/api/session', { data: { joinCode } });
  expect(session.ok()).toBe(true);
  const created = (await session.json()) as {
    sessionId: string;
    token: string;
    packVersion: string;
  };

  const state = {
    sessionId: created.sessionId,
    token: created.token,
    packVersion: created.packVersion,
    dayType: 'wd',
    stage: 's2',
    introSeen: true,
    answers,
    authored: {},
    snapshots: {},
  };

  await page.addInitScript((record) => {
    if (localStorage.getItem('hpw:current') !== null) return;
    localStorage.setItem(`hpw:state:${record.sessionId}`, JSON.stringify(record));
    localStorage.setItem('hpw:current', record.sessionId);
  }, state);
}

/** An answer record as the store writes one. */
const answer = (value: unknown) => ({ value, at: 1, revision: 1 });

async function openEditor(page: Page, answers: Record<string, unknown> = {}): Promise<void> {
  await seedEditor(page, answers);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.getByTestId('stack')).toBeVisible();
}

async function openSheet(page: Page, activityId: string): Promise<void> {
  await page.locator(`[data-hit="${activityId}"]`).click();
  await expect(page.getByTestId('sheet')).toBeVisible();
}

test.describe('the sheet (§8.1, AC 24)', () => {
  test('rises to 88% of the viewport with rounded top corners', async ({ page }) => {
    await openEditor(page);
    await openSheet(page, 'sleep');

    const viewport = page.viewportSize()!;
    const box = await page.getByTestId('sheet').boundingBox();
    expect(box?.height).toBeCloseTo(viewport.height * 0.88, 0);
    // Sits on the bottom edge, full width, no horizontal inset.
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(viewport.width);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(viewport.height, 0);

    const radius = await page
      .getByTestId('sheet')
      .evaluate((node) => getComputedStyle(node).borderTopLeftRadius);
    expect(Number.parseFloat(radius)).toBeGreaterThan(0);
  });

  test('dims what is behind it at 45% (§8.1)', async ({ page }) => {
    await openEditor(page);
    await openSheet(page, 'sleep');

    const backdrop = await page
      .getByTestId('sheet-backdrop')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(backdrop).toContain('0.45');
  });

  test('locks body scroll while it is up, and gives it back (AC 24)', async ({ page }) => {
    // An answer set over 24 h, so the stack really does have somewhere to scroll.
    await openEditor(page, { 'leisure.screen.wd': answer(600) });

    /*
     * A real wheel gesture, not `window.scrollTo`: a script can scroll a
     * document whose overflow is hidden, so a programmatic probe would report a
     * lock that is not there for the participant — and miss one that is.
     */
    const wheelDown = async () => {
      await page.mouse.move(180, 20);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(100);
      return page.evaluate(() => window.scrollY);
    };

    expect(await wheelDown()).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, 0));

    await openSheet(page, 'sleep');
    expect(await wheelDown()).toBe(0);

    await page.getByTestId('sheet-done').click();
    await expect(page.getByTestId('sheet')).toBeHidden();
    expect(await wheelDown()).toBeGreaterThan(0);
  });

  test('closes on Escape and on a backdrop tap (AC 24)', async ({ page }) => {
    await openEditor(page);

    await openSheet(page, 'sleep');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sheet')).toBeHidden();

    await openSheet(page, 'sleep');
    // Above the sheet, which occupies the bottom 88% — the exposed strip.
    await page.getByTestId('sheet-backdrop').click({ position: { x: 180, y: 20 } });
    await expect(page.getByTestId('sheet')).toBeHidden();
  });

  test('animates the changed band on close, over 200 ms (AC 24)', async ({ page }) => {
    await openEditor(page);
    const band = page.getByTestId('stack').locator('[data-activity="sleep"]');
    const before = (await band.boundingBox())!.height;

    await openSheet(page, 'sleep');
    await page.getByTestId('direct-toggle').click();
    // Four presses is an hour; at 375x667 that is a visible move.
    for (let press = 0; press < 4; press += 1) {
      await page.getByTestId('direct-up-wd').click();
    }
    // The stack is frozen behind the sheet: nothing has moved yet.
    expect((await band.boundingBox())!.height).toBeCloseTo(before, 1);

    await page.getByTestId('sheet-done').click();

    // Mid-flight: the transition is live and the band is somewhere between.
    // One duration per animated property — §8.1's 200 ms on both `top` and
    // `height`, which is what makes the bands below the change move with it.
    const settling = await page
      .getByTestId('stack')
      .evaluate((node) => getComputedStyle(node.querySelector('[data-activity="sleep"]')!)
        .transitionDuration);
    expect(settling.split(', ')).toEqual(['0.2s', '0.2s']);

    await expect(page.getByTestId('stack')).not.toHaveAttribute('data-settling', 'true');
    expect((await band.boundingBox())!.height).toBeGreaterThan(before);
  });

  test('is dismissed by a downward drag past a quarter of its height (§8.1)', async ({ page }) => {
    await openEditor(page);
    await openSheet(page, 'sleep');

    const box = (await page.getByTestId('sheet').boundingBox())!;
    const startY = box.y + 16;
    await page.mouse.move(box.width / 2, startY);
    await page.mouse.down();
    // Past a quarter of the sheet, in steps so the pointermove stream is real.
    await page.mouse.move(box.width / 2, startY + box.height * 0.4, { steps: 12 });
    await page.mouse.up();

    await expect(page.getByTestId('sheet')).toBeHidden();
  });

  test('holds its layout at 320 px with no horizontal scroll', async ({ page }) => {
    await openEditor(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await openSheet(page, 'sleep');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    expect((await page.getByTestId('sheet').boundingBox())?.width).toBe(320);
  });
});

test.describe('a Not-included row (§7.7, AC 30)', () => {
  test('opens the same sheet and moves the activity into the stack', async ({ page }) => {
    // Care gated out at S1: zero on both day types, so it is inventory.
    await openEditor(page, { 'care.any': answer('no') });

    const list = page.getByTestId('not-included');
    await expect(list).toContainText('Care');
    await expect(page.getByTestId('stack').locator('[data-activity="care"]')).toBeHidden();

    await list.getByRole('button', { name: 'Care' }).click();
    await expect(page.getByTestId('sheet')).toHaveAttribute('data-activity', 'care');
    // Prefilled, with the gate standing at the falsy value it was given.
    await expect(page.getByRole('radio', { name: 'No' })).toBeChecked();

    await page.getByRole('radio', { name: 'Yes' }).click();
    await page.getByTestId('sheet-done').click();

    // In the stack at its pack order — after household, before personal care.
    const ids = await page
      .getByTestId('stack')
      .locator('[data-activity]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-activity')));
    expect(ids.indexOf('care')).toBeGreaterThan(ids.indexOf('household'));
    expect(ids.indexOf('care')).toBeLessThan(ids.indexOf('hygiene'));
    await expect(page.getByTestId('not-included')).toBeHidden();
  });
});
