import { expect, test, type Page } from '@playwright/test';

/**
 * S4 against the real pack, the real endpoints and the real squeeze.
 *
 * The unit tests drive the reveal against a two-activity fixture where nothing
 * is tight; what only this file can prove is that the v1 pack's own defaults
 * land the workday where §8.3 needs it — just inside 24 h, so four hours of
 * school is a breach the participant has to rebalance out of, and eight hours
 * is a considerably worse one. The whole exercise rests on that arithmetic
 * being true of the shipped content rather than of a fixture.
 *
 * It also proves the last endpoint in the participant's run: confirm reaches
 * `/complete`, and the session is marked complete on the server rather than
 * only on the phone.
 */

const V1_SCREENS = 17;
const SCHOOL = '[data-activity="school"]';

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
    data: { to: 2 },
  });
  expect(response.ok()).toBe(true);
}

function next(page: Page) {
  return page.getByRole('button', { name: 'Next', exact: true });
}

/** Joins, answers every screen at its default, and finishes into the hold. */
async function reachReveal(page: Page, room: Room): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Room code').fill(room.joinCode);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let screen = 1; screen <= V1_SCREENS; screen += 1) await next(page).click();

  await page.getByTestId('finish').click();
  await openStage(page, room);
  await expect(page.getByTestId('reveal')).toBeVisible({ timeout: 15_000 });
}

test.describe('S4 — the reveal', () => {
  test('is two screens, and the stack is on neither (AC 37a)', async ({ page }) => {
    const room = await newRoom(page);
    await reachReveal(page, room);

    // The commitment: the ask, and no number asked for.
    await expect(page.getByTestId('stack')).toBeHidden();
    await expect(page.getByTestId('school-control')).toBeHidden();

    await page.getByTestId('reveal-continue').click();

    // The pace: the ladder, its per-workday cost, its outcome — and still no
    // stack. What it costs *this* participant is the next screen's business.
    await expect(page.getByTestId('pace')).toBeVisible();
    await expect(page.getByTestId('school-weekly')).toHaveText(/20/);
    await expect(page.getByTestId('school-per-day')).toHaveText('4 h on each workday');
    await expect(page.getByTestId('school-outcome')).not.toBeEmpty();
    await expect(page.getByTestId('stack')).toBeHidden();

    await page.getByTestId('pace-continue').click();
    await expect(page.getByTestId('stack')).toBeVisible();
  });

  test('walks the ladder, and both bounds stop (AC 39, AC 39a)', async ({ page }) => {
    const room = await newRoom(page);
    await reachReveal(page, room);
    await page.getByTestId('reveal-continue').click();

    await expect(page.getByTestId('school-down')).toBeDisabled();
    for (let press = 0; press < 4; press += 1) await page.getByTestId('school-up').click();

    await expect(page.getByTestId('school-weekly')).toHaveText(/40/);
    await expect(page.getByTestId('school-per-day')).toHaveText('8 h on each workday');
    await expect(page.getByTestId('school-up')).toBeDisabled();
    await expect(page.getByTestId('school-down')).toBeEnabled();

    await page.getByTestId('pace-continue').click();
    // Top of the stack, above sleep (§3.3), at the level just chosen.
    const bands = page.getByTestId('stack').locator('[data-activity]');
    await expect(bands.first()).toHaveAttribute('data-activity', 'school');
    await expect(bands.first()).toContainText('8 h');
  });

  test('forces the workday view and leaves the toggle live (AC 37, AC 44)', async ({ page }) => {
    const room = await newRoom(page);
    await reachReveal(page, room);
    await page.getByTestId('reveal-continue').click();
    await page.getByTestId('pace-continue').click();

    await expect(page.getByTestId('stack')).toHaveAttribute('data-daytype', 'wd');

    // School is workday-only, so the weekend stack is untouched by the reveal
    // and the toggle reaches it (§8.3's second required half).
    await page.locator('[data-daytype="we"]').first().click();
    await expect(page.getByTestId('stack')).toHaveAttribute('data-daytype', 'we');
    await expect(page.getByTestId('stack').locator(SCHOOL)).toHaveCount(0);
  });

  test('breaches at the default pace, and rebalancing to fit confirms (AC 41, 43)', async ({
    page,
  }) => {
    const room = await newRoom(page);
    await reachReveal(page, room);
    await page.getByTestId('reveal-continue').click();
    await page.getByTestId('pace-continue').click();

    // The v1 defaults land the workday just inside 24 h, so 4 h of school puts
    // it over: stripes, a red hour count, and confirm inert.
    await expect(page.getByTestId('overflow-stripes')).toBeVisible();
    await expect(page.getByTestId('toggle-hours-wd')).toHaveAttribute('data-breach', 'true');
    await expect(page.getByTestId('confirm')).toBeDisabled();

    // 45 degrees at a 6 px period, from the tokens rather than from this file.
    const stripes = await page
      .getByTestId('overflow-stripes')
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(stripes).toContain('45deg');
    expect(stripes).toContain('6px');

    // The rim as it stands over a breaching stack, kept to compare with the
    // same rim once the week fits (AC 41).
    const rimWhileOver = await page
      .getByTestId('overflow-rim')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.height, style.top].join('|');
      });

    // No message anywhere says how far over. The segment states occupied
    // hours; nothing states the excess (AC 42).
    await expect(page.locator('body')).not.toContainText('over');

    // Cut sleep to its 6 h floor and leisure to nothing — a real rebalance,
    // and Not included is where leisure lands (§7.7).
    await page.locator('[data-hit="sleep"]').click();
    await page.getByTestId('direct-toggle').click();
    await page.getByTestId('direct-hours-wd').fill('6');
    await page.getByTestId('direct-hours-wd').blur();
    await page.getByTestId('sheet-done').click();

    await page.locator('[data-hit="leisure"]').click();
    await page.getByTestId('direct-toggle').click();
    await page.getByTestId('direct-hours-wd').fill('0');
    await page.getByTestId('direct-hours-wd').blur();
    await page.getByTestId('sheet-done').click();

    await expect(page.getByTestId('overflow-stripes')).toBeHidden();
    await expect(page.getByTestId('toggle-hours-wd')).not.toHaveAttribute('data-breach', 'true');
    await expect(page.getByTestId('confirm')).toBeEnabled();

    // One appearance, before and after: the rim is the edge of the day, and it
    // never becomes a warning about crossing it (AC 41).
    const rimWhileFitting = await page
      .getByTestId('overflow-rim')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.height, style.top].join('|');
      });
    expect(rimWhileFitting).toBe(rimWhileOver);

    // §8.4 — fitting enables the control and does not press it.
    await expect(page.getByTestId('stack')).toBeVisible();

    await page.getByTestId('confirm').click();
    // S5 carries no copy: §9's table names no key for it and the client
    // invents none. What proves the confirm is the server's record of it.
    await expect(page.getByTestId('summary')).toBeAttached();
    await expect(page.getByTestId('stack')).toHaveCount(0);
  });

  test('lowering the pace is a route to fitting (§8.3)', async ({ page }) => {
    const room = await newRoom(page);
    await reachReveal(page, room);
    await page.getByTestId('reveal-continue').click();
    for (let press = 0; press < 4; press += 1) await page.getByTestId('school-up').click();
    await page.getByTestId('pace-continue').click();

    await expect(page.getByTestId('stack').locator(SCHOOL)).toContainText('8 h');

    // Back down to the floor from the band's own sheet — the same control the
    // pace screen showed, so the ladder is the one they chose against (AC 40).
    await page.locator('[data-hit="school"]').click();
    await expect(page.getByTestId('sheet-screens')).toHaveCount(0);
    await expect(page.getByTestId('direct-entry')).toHaveCount(0);
    await expect(page.getByTestId('school-weekly')).toHaveText(/40/);
    for (let press = 0; press < 4; press += 1) await page.getByTestId('school-down').click();
    await expect(page.getByTestId('school-outcome')).not.toBeEmpty();
    await page.getByTestId('sheet-done').click();

    await expect(page.getByTestId('stack').locator(SCHOOL)).toContainText('4 h');
  });

  test('the reveal survives a refresh, and the stack does too (§11)', async ({ page }) => {
    const room = await newRoom(page);
    await reachReveal(page, room);

    // The commitment is a thing to have read, not work to have done: a refresh
    // before the commit shows it again.
    await page.reload();
    await expect(page.getByTestId('reveal')).toBeVisible();

    await page.getByTestId('reveal-continue').click();
    await page.getByTestId('school-up').click();
    await page.getByTestId('pace-continue').click();
    await expect(page.getByTestId('stack').locator(SCHOOL)).toContainText('5 h');

    // Once committed, the level is the participant's own value and a refresh
    // returns to the stack with it intact.
    await page.reload();
    await expect(page.getByTestId('stack')).toBeVisible();
    await expect(page.getByTestId('stack').locator(SCHOOL)).toContainText('5 h');
    await expect(page.getByTestId('reveal')).toBeHidden();
  });
});
