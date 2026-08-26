import { expect, test, type Page } from '@playwright/test';

/**
 * The editor at S2, in a real browser — Stage 4's acceptance run.
 *
 * The criteria this file carries are the ones only a layout engine can settle:
 * full-bleed at every supported width (16), the spine at 8% of the viewport
 * (17), the ruler over it (18), tabular digits (14), and a 0.25 h band that can
 * actually be tapped (21). The arithmetic behind them is unit-tested in
 * `components/stack`; what is here is the geometry.
 *
 * Participants reach S2 by answering seventeen screens, which `s1.spec.ts`
 * already walks. This seeds the session record instead — the same record a
 * refresh restores (§5), with the answer map left empty so every activity
 * derives from its pack defaults (AC 10).
 */

const V1_HUE_STEP = 36;

interface Seeded {
  sessionId: string;
}

/** An answer record as the store writes one. */
const answer = (value: unknown) => ({ value, at: 1, revision: 1 });

async function seedEditor(page: Page, answers: Record<string, unknown> = {}): Promise<Seeded> {
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
  };

  // Guarded, so a reload inside a test resumes what the test did rather than
  // being handed the seed again — AC 15 turns on exactly that difference.
  await page.addInitScript((record) => {
    if (localStorage.getItem('hpw:current') !== null) return;
    localStorage.setItem(`hpw:state:${record.sessionId}`, JSON.stringify(record));
    localStorage.setItem('hpw:current', record.sessionId);
  }, state);

  return { sessionId: created.sessionId };
}

async function openEditor(
  page: Page,
  viewport?: { width: number; height: number },
  answers: Record<string, unknown> = {},
): Promise<Seeded> {
  const seeded = await seedEditor(page, answers);
  // Before the first paint, so the measured geometry is the geometry under test
  // rather than whatever a resize has not yet propagated.
  if (viewport !== undefined) await page.setViewportSize(viewport);
  await page.goto('/');
  await expect(page.getByTestId('stack')).toBeVisible();
  return seeded;
}

/** Horizontal overflow of the document, in px. Zero is the requirement. */
function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('editor geometry (§7.2, §7.3)', () => {
  test('is full-bleed with no horizontal scroll at every supported width (AC 16)', async ({
    page,
  }) => {
    await openEditor(page);

    for (const viewport of [
      { width: 320, height: 640 },
      { width: 375, height: 667 },
      { width: 667, height: 375 }, // landscape
    ]) {
      await page.setViewportSize(viewport);
      const stack = await page.getByTestId('stack').boundingBox();
      expect(stack, `stack at ${viewport.width}x${viewport.height}`).not.toBeNull();
      expect(stack?.x, `left edge at ${viewport.width}`).toBe(0);
      expect(stack?.width, `full width at ${viewport.width}`).toBe(viewport.width);
      expect(await horizontalOverflow(page), `overflow at ${viewport.width}`).toBe(0);
    }
  });

  test('gives the spine 8% of the viewport and the body the same hue at 12% (AC 17)', async ({
    page,
  }) => {
    await openEditor(page, { width: 375, height: 667 });

    const band = page.getByTestId('stack').locator('[data-activity="sleep"]');
    const spine = band.locator('span').first();
    const box = await spine.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.width).toBeCloseTo(375 * 0.08, 1);

    // Same hue, full saturation against 12% — §7.5's whole colour argument.
    const [spineColor, fillColor] = await band.evaluate((node) => {
      const [first, second] = [...node.querySelectorAll('span')];
      return [
        getComputedStyle(first as Element).backgroundColor,
        getComputedStyle(second as Element).backgroundColor,
      ];
    });
    // Full saturation against 12%, whatever colour notation the ring is written
    // in — what matters is that one is opaque and the other carries the 0.12.
    expect(spineColor).not.toContain('0.12');
    expect(fillColor).toContain('0.12');
  });

  test('draws the ruler as one scale over the spine (AC 18)', async ({ page }) => {
    await openEditor(page);

    const ruler = page.getByTestId('ruler');
    await expect(ruler).toHaveCount(1);
    const hours = await ruler.locator('[data-hour]').evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute('data-hour'))),
    );
    expect(hours).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24]);

    // Over the spine: the tick's rule starts at the left edge and stays inside it.
    const rule = await ruler.locator('[data-hour="12"] span').first().boundingBox();
    const spine = await page
      .getByTestId('stack')
      .locator('[data-activity="sleep"] span')
      .first()
      .boundingBox();
    expect(rule?.x).toBe(0);
    expect(rule?.width).toBeLessThanOrEqual(spine?.width ?? 0);
  });

  test('spaces the hue ring evenly (AC 20)', async ({ page }) => {
    await openEditor(page);

    const hues = await page
      .getByTestId('stack')
      .locator('[data-activity]')
      .evaluateAll((nodes) =>
        nodes.map((node) => Number.parseFloat((node as HTMLElement).style.getPropertyValue('--band-hue'))),
      );
    expect(hues.length).toBeGreaterThan(1);
    for (const hue of hues) expect(hue % V1_HUE_STEP).toBeCloseTo(0);
    expect(new Set(hues).size).toBe(hues.length);
  });

  test('covers every band with its own hit area, and no neighbour (AC 21)', async ({ page }) => {
    await openEditor(page, { width: 375, height: 667 });

    const stack = page.getByTestId('stack');
    const hits = stack.locator('[data-hit]');
    const count = await hits.count();
    expect(count).toBeGreaterThan(0);

    let previousBottom = -Infinity;
    for (let index = 0; index < count; index += 1) {
      const hit = hits.nth(index);
      const id = await hit.getAttribute('data-hit');
      const overlay = await hit.boundingBox();
      const band = await stack.locator(`[data-activity="${id}"]`).boundingBox();

      // The overlay is the band, to the pixel the layout engine rounds to.
      expect(overlay?.y, `overlay top for ${id}`).toBeCloseTo(band!.y, 0);
      expect(overlay?.height, `overlay height for ${id}`).toBeCloseTo(band!.height, 0);

      // And it reaches into nothing above it — a tap opens what it landed on.
      expect(overlay!.y, `overlay for ${id} clear of its neighbour`).toBeGreaterThanOrEqual(
        previousBottom - 0.5,
      );
      previousBottom = overlay!.y + overlay!.height;
    }
  });

  test('scales label type with band height, within the clamp (AC 22)', async ({ page }) => {
    await openEditor(page, { width: 375, height: 667 });

    const sizes = await page
      .getByTestId('stack')
      .locator('[data-activity]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.querySelector('span:nth-of-type(3) > span:first-child'))
          .filter((label): label is Element => label !== null)
          .map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
      );
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(13);
      expect(size).toBeLessThanOrEqual(34);
    }
  });

  /*
   * §7.4 as amended 2026-08-26: the label is never hidden, and the hour count
   * is what a thin band drops. §7.5 is the reason — colour orients, the label
   * identifies — so a band with no name is only findable by hue, which is the
   * one thing a participant in greyscale cannot do.
   */
  test('names every band, and drops only the hour count on a thin one (§7.4)', async ({
    page,
  }) => {
    await openEditor(page, { width: 375, height: 667 });

    const lines = await page
      .getByTestId('stack')
      .locator('[data-activity]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const labels = node.querySelector('span:nth-of-type(3)');
          return {
            id: node.getAttribute('data-activity'),
            height: box.height,
            name: labels?.firstElementChild?.textContent ?? '',
            lines: labels?.childElementCount ?? 0,
          };
        }),
      );

    expect(lines.length).toBeGreaterThan(0);
    for (const band of lines) {
      // Every band is named, however thin — and the name is really painted,
      // not clipped away by a box smaller than the type in it.
      expect(band.name, `${band.id} at ${band.height}px`).not.toBe('');
      expect(band.lines, `${band.id} at ${band.height}px`).toBe(band.height >= 20 ? 2 : 1);
    }

    // The v1 defaults put both cases on screen at this size, so the assertion
    // above is not passing by only ever seeing one of them.
    expect(lines.some((band) => band.lines === 1)).toBe(true);
    expect(lines.some((band) => band.lines === 2)).toBe(true);
  });
});

test.describe('the day-type toggle (§7.1)', () => {
  test('sets both totals in tabular digits, so a change cannot reflow the tab (AC 14)', async ({
    page,
  }) => {
    await openEditor(page);

    for (const dayType of ['wd', 'we']) {
      const numeric = await page
        .getByTestId(`toggle-hours-${dayType}`)
        .evaluate((node) => getComputedStyle(node).fontVariantNumeric);
      expect(numeric, dayType).toContain('tabular-nums');
    }
  });

  test('swaps the stack and nothing else, and survives a refresh (AC 11, AC 15)', async ({
    page,
  }) => {
    await openEditor(page);

    const before = await page.getByTestId('toggle-hours-we').textContent();
    await page.getByRole('button', { name: /weekend/i }).click();
    await expect(page.getByTestId('stack')).toHaveAttribute('data-daytype', 'we');
    // The other day's total is untouched by the switch — it was already live.
    expect(await page.getByTestId('toggle-hours-we').textContent()).toBe(before);

    await page.reload();
    await expect(page.getByTestId('stack')).toHaveAttribute('data-daytype', 'we');
  });
});

test.describe('Not included (§7.7)', () => {
  // The care section gated out at S1: zero on both day types, so no band.
  const GATED_OUT = { 'care.any': answer('no') };

  test('does not shrink the stack to bring the list on screen (AC 29)', async ({ page }) => {
    const viewport = { width: 375, height: 667 };
    await openEditor(page, viewport, GATED_OUT);

    // The stack still owns the viewport at 24 hours — that is what makes it read
    // as a full day — and the list is below the fold.
    const stack = await page.getByTestId('stack').boundingBox();
    const toggle = await page.getByTestId('day-toggle').boundingBox();
    const footer = await page.getByTestId('editor-footer').boundingBox();
    const chrome = (toggle?.height ?? 0) + (footer?.height ?? 0);
    expect(stack?.height).toBeCloseTo(viewport.height - chrome, 0);
    expect(await page.getByTestId('not-included').boundingBox()).not.toBeNull();
  });

  test('scrolls to the list when the footer count is tapped (AC 29)', async ({ page }) => {
    await openEditor(page, { width: 375, height: 667 }, GATED_OUT);

    // The stack owns the viewport, so the list starts below the fold — mostly,
    // not entirely, which is the affordance §7.7 asks the footer count to fix.
    const list = page.getByTestId('not-included');
    await expect(list).not.toBeInViewport({ ratio: 0.9 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.getByTestId('not-included-count').click();

    await expect(list).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('opens no list and no count when every activity has hours (AC 31)', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByTestId('not-included')).toHaveCount(0);
    await expect(page.getByTestId('not-included-count')).toHaveCount(0);
  });
});
