import { expect, test, type Page } from '@playwright/test';

/**
 * S5 against the real pack and a real rebalance (steps 10.6, 10.7).
 *
 * The unit tests hand `Summary` two snapshots and check what it draws. What
 * only this file can prove is that the two snapshots a real run produces
 * difference to the cuts the participant actually made — the finish snapshot is
 * taken on the phone at Finish, the complete one at confirm, and between them
 * sits the whole reveal, the pace commit and the sheet. A screen that showed
 * the right rows from hand-built input and the wrong ones from a real week
 * would pass everything else in the suite.
 */

const V1_SCREENS = 17;

interface Room {
  roomId: string;
  joinCode: string;
}

async function newRoom(page: Page): Promise<Room> {
  const response = await page.request.post('/api/room');
  expect(response.ok()).toBe(true);
  return (await response.json()) as Room;
}

/** Joins, answers every screen at its default, finishes, and opens the stage. */
async function reachStack(page: Page): Promise<Room> {
  const room = await newRoom(page);
  await page.goto('/');
  await page.getByLabel('Room code').fill(room.joinCode);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let screen = 1; screen <= V1_SCREENS; screen += 1) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  await page.getByTestId('finish').click();
  const opened = await page.request.post(`/api/room/${room.roomId}/stage`, {
    data: { open: true },
  });
  expect(opened.ok()).toBe(true);

  await expect(page.getByTestId('reveal')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('reveal-continue').click();
  await page.getByTestId('pace-continue').click();
  await expect(page.getByTestId('stack')).toBeVisible();
  return room;
}

/** Sets one activity's workday hours directly, from its band. */
async function setWorkdayHours(page: Page, activityId: string, hours: string): Promise<void> {
  await page.locator(`[data-hit="${activityId}"]`).click();
  await page.getByTestId('direct-toggle').click();
  await page.getByTestId('direct-hours-wd').fill(hours);
  await page.getByTestId('direct-hours-wd').blur();
  await page.getByTestId('sheet-done').click();
}

test.describe('S5 — what it cost', () => {
  test('names the cuts the participant actually made, and not school', async ({ page }) => {
    await reachStack(page);

    await setWorkdayHours(page, 'sleep', '6');
    await setWorkdayHours(page, 'leisure', '0');

    await expect(page.getByTestId('confirm')).toBeEnabled();
    await page.getByTestId('confirm').click();

    await expect(page.getByTestId('summary')).toBeVisible();
    await expect(page.getByTestId('summary-cuts')).toBeVisible();

    // Both cuts are rows, `from → to`. The `from` is the finish snapshot's
    // figure — a real number off the participant's own week, not the zero a
    // screen reading the live stack would show for an activity now at zero.
    await expect(page.getByTestId('cut-sleep-wd')).toHaveText(/^\d+(\.\d+)? h → 6 h$/);
    await expect(page.getByTestId('cut-leisure-wd')).toHaveText(/^\d+(\.\d+)? h → 0 h$/);

    // It went up, and it is the reason for the list rather than a member of it.
    await expect(page.getByTestId('cut-school-wd')).toHaveCount(0);

    // A list, not the instrument (step 10.6).
    await expect(page.getByTestId('stack')).toHaveCount(0);
    await expect(page.getByTestId('day-toggle')).toHaveCount(0);
  });

  /**
   * §11's "school fits inside existing slack". Reachable on the real pack by
   * zeroing enough of the workday before Finish that 4 h of school lands in
   * Unallocated — no event, no cut, and a screen that says so (§7.8).
   */
  test('gives a participant who cut nothing their own screen', async ({ page }) => {
    const room = await newRoom(page);
    await page.goto('/');
    await page.getByLabel('Room code').fill(room.joinCode);
    await page.getByRole('button', { name: 'Join' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    for (let screen = 1; screen <= V1_SCREENS; screen += 1) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }

    // Make room in the workday *before* Finish, so the slack is in the finish
    // snapshot and school lands in Unallocated rather than on any band.
    await expect(page.getByTestId('stack')).toBeVisible();
    await setWorkdayHours(page, 'leisure', '0');
    await setWorkdayHours(page, 'work', '0');

    await page.getByTestId('finish').click();
    await page.request.post(`/api/room/${room.roomId}/stage`, { data: { open: true } });
    await expect(page.getByTestId('reveal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('reveal-continue').click();
    await page.getByTestId('pace-continue').click();

    // No stripes, and confirm live on arrival (AC 45).
    await expect(page.getByTestId('overflow-stripes')).toBeHidden();
    await expect(page.getByTestId('confirm')).toBeEnabled();
    await page.getByTestId('confirm').click();

    await expect(page.getByTestId('summary-no-cuts')).toBeVisible();
    await expect(page.getByTestId('summary-cuts')).toHaveCount(0);
    await expect(page.getByTestId('summary')).toContainText('20 hours a week');
  });

  /** Step 10.7 — S5 is terminal, and the tab is the only way off it. */
  test('offers Start over, naming the finished result it destroys', async ({ page }) => {
    await reachStack(page);
    await setWorkdayHours(page, 'leisure', '0');
    await setWorkdayHours(page, 'sleep', '6');
    await expect(page.getByTestId('confirm')).toBeEnabled();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('summary')).toBeVisible();

    await page.getByTestId('options-tab').click();
    await page.getByTestId('options-reset').click();
    await expect(page.getByTestId('options-overlay')).toContainText('finished result');

    await page.getByTestId('options-confirm').click();

    // A fresh session in the same room: §13's statement is unread again, the
    // summary is gone, and the finished run and its snapshots were deleted
    // server-side (§6.2.2, step 4.8). The room's `ready` and `total` both fall
    // by one, which the console reports without comment — the cost step 10.7
    // takes knowingly.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('summary')).toHaveCount(0);
  });
});
