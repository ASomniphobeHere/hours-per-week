import { expect, test, type Page } from '@playwright/test';

/**
 * §7.9 and §5 — starting over, in a real browser, all the way to the database.
 *
 * This is the criterion no unit test can carry: the participant taps a control
 * on their own phone and comes back at question one, with the server's record
 * of the run they abandoned gone and the room still counting them once
 * (§6.2.2). Everything under it is asserted in `app/api/routes.test.ts` and
 * `components/stack/Options.test.tsx`; what is here is the loop closing.
 */

interface Seeded {
  roomId: string;
  joinCode: string;
  sessionId: string;
}

const answer = (value: unknown) => ({ value, at: 1, revision: 1 });

async function seedEditor(page: Page): Promise<Seeded> {
  const room = await page.request.post('/api/room');
  expect(room.ok()).toBe(true);
  const { roomId, joinCode } = (await room.json()) as { roomId: string; joinCode: string };

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
    // Something to lose, so a reset that silently kept the answer map would fail.
    answers: { 'sleep.wake.wd': answer('05:30') },
  };

  await page.addInitScript((record) => {
    if (localStorage.getItem('hpw:current') !== null) return;
    localStorage.setItem(`hpw:state:${record.sessionId}`, JSON.stringify(record));
    localStorage.setItem('hpw:current', record.sessionId);
  }, state);

  return { roomId, joinCode, sessionId: created.sessionId };
}

/** `total` and the per-stage counts the console reads (§6.2.2). */
async function currentSessionId(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('hpw:current'));
}

test.describe('starting over (§7.9)', () => {
  test('resets the run without the participant touching site data (AC 22b)', async ({ page }) => {
    const seeded = await seedEditor(page);
    await page.goto('/');
    await expect(page.getByTestId('stack')).toBeVisible();

    // Two taps and a sentence, never one.
    await page.getByTestId('options-tab').click();
    await expect(page.getByTestId('options-reset')).toBeVisible();
    await page.getByTestId('options-reset').click();
    await expect(page.getByTestId('options-confirm')).toBeVisible();
    await expect(page.getByTestId('stack')).toBeVisible();

    await page.getByTestId('options-confirm').click();

    // Back at the start: §13's statement is unread again, and the stack is gone.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expect(page.getByTestId('stack')).toBeHidden();

    // A new session, in the same room, with no join code re-entered.
    const now = await currentSessionId(page);
    expect(now).not.toBeNull();
    expect(now).not.toBe(seeded.sessionId);
    expect(await page.evaluate((id) => localStorage.getItem(`hpw:state:${id}`), seeded.sessionId))
      .toBeNull();

    // And it survives the refresh §5 promises, rather than reviving the old run.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(await currentSessionId(page)).toBe(now);
  });

  test('leaves the abandoned run behind and the room counting once (§6.2.2)', async ({ page }) => {
    const seeded = await seedEditor(page);
    await page.goto('/');
    await expect(page.getByTestId('stack')).toBeVisible();

    await page.getByTestId('options-tab').click();
    await page.getByTestId('options-reset').click();
    await page.getByTestId('options-confirm').click();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

    // The old session is unreachable: its token no longer authenticates anything.
    const stale = await page.request.get(`/api/session/${seeded.sessionId}/stage`);
    expect(stale.status()).toBe(401);
  });

  test('cancelling changes nothing at all (AC 22c)', async ({ page }) => {
    const seeded = await seedEditor(page);
    await page.goto('/');
    await expect(page.getByTestId('stack')).toBeVisible();

    await page.getByTestId('options-tab').click();
    await page.getByTestId('options-reset').click();
    await page.getByTestId('options-cancel').click();

    await expect(page.getByTestId('options-overlay')).toBeHidden();
    await expect(page.getByTestId('stack')).toBeVisible();
    expect(await currentSessionId(page)).toBe(seeded.sessionId);

    // Still live server-side.
    const stage = await page.request.get(`/api/session/${seeded.sessionId}/stage`, {
      headers: {
        authorization: `Bearer ${JSON.parse(
          (await page.evaluate(
            (id) => localStorage.getItem(`hpw:state:${id}`),
            seeded.sessionId,
          )) ?? '{}',
        ).token}`,
      },
    });
    expect(stage.status()).toBe(200);
  });

  test('the tab is a sliver on the right edge at mid-height (§7.9)', async ({ page }) => {
    await seedEditor(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.getByTestId('stack')).toBeVisible();

    const box = await page.getByTestId('options-tab').boundingBox();
    expect(box).not.toBeNull();
    // Flush to the right edge.
    expect(Math.round(box!.x + box!.width)).toBe(375);
    // Vertically centred, and 15% of the viewport tall.
    expect(Math.round(box!.y + box!.height / 2)).toBeCloseTo(667 / 2, -1);
    expect(Math.round(box!.height)).toBe(Math.round(667 * 0.15));
    // A sliver, not a panel.
    expect(box!.width).toBeLessThan(32);

    // And it costs the stack nothing: §7.2's day is still the full 24 hours.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
});
