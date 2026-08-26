import { expect, test, type Page } from '@playwright/test';

/**
 * §6.3's three entry paths, against a real room and a real flag.
 *
 * The unit tests drive the machine against an injected `fetch`; this drives it
 * against the endpoints — `POST /room/:id/stage` flips the flag the way the
 * console will (step 8.5), and the phone finds out by polling. What is proved
 * here and nowhere else is that the poll, the flag and the 5 s floor are the
 * same three things on both sides of the wire.
 *
 * The 5 s floor is real time and there is no way around it: the hold exists to
 * be waited through, and a test that mocked the clock would be asserting
 * something other than what a participant gets.
 */

const V1_SCREENS = 17;
const HOLD_MS = 5_000;

interface Room {
  roomId: string;
  joinCode: string;
}

async function newRoom(page: Page): Promise<Room> {
  const response = await page.request.post('/api/room');
  expect(response.ok()).toBe(true);
  return (await response.json()) as Room;
}

async function openStage(page: Page, room: Room): Promise<void> {
  const response = await page.request.post(`/api/room/${room.roomId}/stage`, {
    data: { open: true },
  });
  expect(response.ok()).toBe(true);
}

async function join(page: Page, room: Room): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Room code').fill(room.joinCode);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Exact: the dev overlay ships a button called "Open Next.js Dev Tools". */
function next(page: Page) {
  return page.getByRole('button', { name: 'Next', exact: true });
}

async function answerEverything(page: Page): Promise<void> {
  for (let screen = 1; screen <= V1_SCREENS; screen += 1) await next(page).click();
}

test.describe('S3', () => {
  test('Finish holds until the facilitator opens the stage (AC 32, AC 33)', async ({ page }) => {
    const room = await newRoom(page);
    await join(page, room);
    await answerEverything(page);

    await page.getByTestId('finish').click();
    await expect(page.getByTestId('hold')).toBeVisible();

    // The ellipsis fills a dot at a time (§6.3), so the line reaches three
    // dots six seconds in and the swap follows the pause.
    await expect(page.getByTestId('hold-line')).toHaveText(/\.\.\.$/, { timeout: 10_000 });
    await expect(page.getByTestId('hold-line')).not.toHaveText(/\.$/, { timeout: 10_000 });

    // The flag is still closed, so the hold is open-ended. Finish marked the
    // participant ready; it did not advance anyone (AC 32).
    await page.waitForTimeout(HOLD_MS + 1_000);
    await expect(page.getByTestId('hold')).toBeVisible();

    await openStage(page, room);

    // One poll away, and the floor is long spent.
    await expect(page.getByTestId('stack')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-activity]').first()).toBeVisible();
  });

  test('a late joiner works at their own pace and still holds 5 s (§6.3 row 2, §11)', async ({
    page,
  }) => {
    const room = await newRoom(page);
    await openStage(page, room);

    // This phone has never seen the flag closed, so nothing pulls it forward:
    // §11 gives a mid-session joiner the full questionnaire.
    await join(page, room);
    await expect(page.getByText(`1 of ${V1_SCREENS}`)).toBeVisible();
    await page.waitForTimeout(4_000);
    await expect(page.getByTestId('hold')).toBeHidden();

    await answerEverything(page);
    await expect(page.getByTestId('stack')).toBeVisible();

    const pressedAt = Date.now();
    await page.getByTestId('finish').click();
    await expect(page.getByTestId('hold')).toBeVisible();

    await expect(page.getByTestId('stack')).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - pressedAt).toBeGreaterThanOrEqual(HOLD_MS);
  });

  test('force-advances a participant still in S1, with a full stack (AC 35)', async ({ page }) => {
    const room = await newRoom(page);
    await join(page, room);

    // Two screens in, seventeen to go.
    await next(page).click();
    await expect(page.getByText(`2 of ${V1_SCREENS}`)).toBeVisible();

    await openStage(page, room);
    await expect(page.getByTestId('hold')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('stack')).toBeVisible({ timeout: 10_000 });
    // §4.2.1 rule 6 and §4.6's defaults: every gate truthy, every section at
    // its field defaults, so a participant who answered one screen out of
    // seventeen arrives with all nine of them (§11).
    await expect(page.getByTestId('stack').locator('[data-activity]')).toHaveCount(9);
    const notIncluded = page.getByTestId('not-included');
    await expect(notIncluded.locator('[data-activity]')).toHaveCount(1);
    // School, revealed at S4 (§3.3) and still at zero: step 7.2's pace screen
    // is what commits it and moves it into the stack.
    await expect(notIncluded.locator('[data-activity="school"]')).toHaveCount(1);
  });

  test('resumes in S3 after a refresh and restarts the floor (§11)', async ({ page }) => {
    const room = await newRoom(page);
    await join(page, room);
    await answerEverything(page);
    await page.getByTestId('finish').click();
    await expect(page.getByTestId('hold')).toBeVisible();

    const reloadedAt = Date.now();
    await page.reload();
    await expect(page.getByTestId('hold')).toBeVisible();

    // Opened immediately: without the restart the floor would already be spent
    // from the Finish above, and the flag alone would release them.
    await openStage(page, room);
    await expect(page.getByTestId('stack')).toBeVisible({ timeout: 15_000 });
    expect(Date.now() - reloadedAt).toBeGreaterThanOrEqual(HOLD_MS);
  });
});
