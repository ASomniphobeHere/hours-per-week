import { expect, test, type Page } from '@playwright/test';

/**
 * The facilitator console against a real room (§6.2).
 *
 * The component tests drive the console through an injected `fetch`; this
 * drives it through the endpoints, with a real participant joining in a second
 * tab. What is proved here and nowhere else is that the three numbers on the
 * screen are the room — that a phone joining moves `total` and `S1`, that the
 * two presses reach `POST /room/:id/stage`, and that a reload comes back to
 * the same screen from the next poll rather than from anything remembered.
 *
 * The 3 s poll is real time, as the 5 s disarm is. Both are the behaviour, and
 * a faked clock here would assert something other than what a facilitator gets.
 */

const POLL_MS = 3_000;
/** Room-state assertions wait for a poll to land, plus room to spare. */
const SETTLE = { timeout: POLL_MS * 3 };

interface Room {
  roomId: string;
  joinCode: string;
  consoleUrl: string;
}

async function newRoom(page: Page): Promise<Room> {
  const response = await page.request.post('/api/room');
  expect(response.ok()).toBe(true);
  return (await response.json()) as Room;
}

async function joinAsParticipant(page: Page, room: Room): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Room code').fill(room.joinCode);
  await page.getByRole('button', { name: 'Join' }).click();
}

const stageButton = (page: Page) => page.getByTestId('stage-button');

test.describe('facilitator console', () => {
  test('shows the room, arms, and opens the stage (AC 50, 53, 54)', async ({ page, context }) => {
    const room = await newRoom(page);
    await page.goto(room.consoleUrl);

    // The join code is on screen before anyone has joined — it is what gets
    // read aloud to a latecomer (§6.2.3).
    await expect(page.getByTestId('console-joincode')).toHaveText(room.joinCode);
    await expect(page.getByTestId('console-ready')).toHaveText('0 / 0');
    for (const stage of ['s1', 's2', 's3', 's4', 's5']) {
      await expect(page.getByTestId(`console-stage-${stage}`)).toHaveText('0');
    }
    await expect(stageButton(page)).toBeDisabled();

    // §6.2.3: the counts swap, they do not tween (AC 51). Nothing on the
    // read-outs carries a transition — a count caught mid-flight is a count
    // that can be misread.
    const durations = await page
      .getByTestId('console-ready')
      .evaluate((node) => getComputedStyle(node).transitionDuration);
    expect(durations).toBe('0s');

    const phone = await context.newPage();
    await joinAsParticipant(phone, room);

    await expect(page.getByTestId('console-ready')).toHaveText('0 / 1', SETTLE);
    await expect(page.getByTestId('console-stage-s1')).toHaveText('1', SETTLE);
    await expect(stageButton(page)).toBeEnabled();

    // One press arms; the label names `total`, not `ready` (§6.2.4).
    await stageButton(page).click();
    await expect(stageButton(page)).toHaveText('Confirm — opens for 1 participant');

    // Two presses open it, and the control stops being a button (AC 54).
    await stageButton(page).click();
    await expect(page.getByTestId('stage-open')).toHaveText('Stage open', SETTLE);
    await expect(page.getByTestId('stage-button')).toHaveCount(0);

    // The flag the participant polls is the one that just flipped.
    const status = await page.request.get(`/api/room/${room.roomId}/status`);
    expect(((await status.json()) as { stageOpen: boolean }).stageOpen).toBe(true);

    await phone.close();
  });

  test('disarms after 5 s without a second press (AC 53)', async ({ page, context }) => {
    const room = await newRoom(page);
    const phone = await context.newPage();
    await joinAsParticipant(phone, room);

    await page.goto(room.consoleUrl);
    await expect(stageButton(page)).toBeEnabled(SETTLE);

    await stageButton(page).click();
    await expect(stageButton(page)).toHaveAttribute('data-phase', 'armed');

    await expect(stageButton(page)).toHaveAttribute('data-phase', 'idle', { timeout: 10_000 });
    await expect(stageButton(page)).toHaveText('Open the reveal');

    // Nothing was opened by the press that timed out.
    const status = await page.request.get(`/api/room/${room.roomId}/status`);
    expect(((await status.json()) as { stageOpen: boolean }).stageOpen).toBe(false);

    await phone.close();
  });

  test('a reload comes back to the same screen from the next poll (AC 56)', async ({
    page,
    context,
  }) => {
    const room = await newRoom(page);
    const phone = await context.newPage();
    await joinAsParticipant(phone, room);

    await page.goto(room.consoleUrl);
    await expect(stageButton(page)).toBeEnabled(SETTLE);
    await stageButton(page).click();
    await stageButton(page).click();
    await expect(page.getByTestId('stage-open')).toBeVisible(SETTLE);

    await page.reload();

    // Nothing is stored client-side, so this is the poll answering (§6.2.3).
    await expect(page.getByTestId('stage-open')).toBeVisible(SETTLE);
    await expect(page.getByTestId('console-joincode')).toHaveText(room.joinCode);
    await expect(page.getByTestId('console-ready')).toHaveText('0 / 1');

    await phone.close();
  });

  test('holds at 375 px with no horizontal scroll (AC 58)', async ({ page, context }) => {
    const room = await newRoom(page);
    const phone = await context.newPage();
    await joinAsParticipant(phone, room);

    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto(room.consoleUrl);
    await expect(page.getByTestId('console-ready')).toHaveText('0 / 1', SETTLE);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Every element on the screen is reachable, including the button — the
    // point of the width is that the stage can be opened from a phone while
    // walking the room (§6.2).
    for (const id of ['console-joincode', 'console-ready', 'console-stage-s5', 'stage-button']) {
      await expect(page.getByTestId(id)).toBeInViewport();
    }

    await phone.close();
  });

  test('keeps the last values, dimmed, when the poll drops (AC 52)', async ({ page, context }) => {
    const room = await newRoom(page);
    const phone = await context.newPage();
    await joinAsParticipant(phone, room);

    await page.goto(room.consoleUrl);
    await expect(page.getByTestId('console-ready')).toHaveText('0 / 1', SETTLE);

    // The opposite of the S3 rule (§6.3): the numbers stay, because a console
    // that blanked would take the facilitator's information away over one
    // dropped request.
    await page.route('**/api/room/*/status', (route) => route.abort());
    await expect(page.getByTestId('console-values')).toHaveAttribute('data-stale', 'true', SETTLE);
    await expect(page.getByTestId('console-ready')).toHaveText('0 / 1');
    await expect(page.getByTestId('console-reconnecting')).toBeVisible();

    await page.unroute('**/api/room/*/status');
    await expect(page.getByTestId('console-values')).toHaveAttribute('data-stale', 'false', SETTLE);
    await expect(page.getByTestId('console-reconnecting')).toHaveCount(0);

    await phone.close();
  });
});
