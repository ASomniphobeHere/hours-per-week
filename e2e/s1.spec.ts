import { expect, test, type Page } from '@playwright/test';

/**
 * S1 end to end, against a real room: join by code, read the intro, answer the
 * questionnaire, and reach the generated stack.
 *
 * This is Stage 3's own acceptance run. The multi-participant simulation — one
 * facilitator context and N phones through the whole stage machine — is
 * Stage 12's, and it is not this.
 */

const V1_SCREENS = 17;

async function newRoom(page: Page): Promise<string> {
  const response = await page.request.post('/api/room');
  expect(response.ok()).toBe(true);
  return (await response.json()).joinCode as string;
}

async function join(page: Page): Promise<void> {
  const joinCode = await newRoom(page);
  await page.goto('/');
  await page.getByLabel('Room code').fill(joinCode);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Exact: the dev overlay ships a button called "Open Next.js Dev Tools". */
function next(page: Page) {
  return page.getByRole('button', { name: 'Next', exact: true });
}

test.describe('S1', () => {
  test('joins, answers every screen, and reaches the stack', async ({ page }) => {
    await join(page);

    await expect(page.getByText(`1 of ${V1_SCREENS}`)).toBeVisible();
    await expect(page.getByRole('heading')).toHaveText('What time do you wake up?');

    for (let screen = 1; screen <= V1_SCREENS; screen += 1) {
      await expect(page.getByText(`${screen} of ${V1_SCREENS}`)).toBeVisible();
      await next(page).click();
    }

    // §3.3's set, less school — inserted at S4 — and less nothing else: every
    // section derived from its defaults, so none is at zero.
    const stack = page.getByTestId('stack');
    await expect(stack).toBeVisible();
    await expect(stack.locator('[data-activity]')).toHaveCount(9);
    await expect(stack.locator('[data-activity="school"]')).toHaveCount(0);
    await expect(page.getByTestId('not-included')).toBeHidden();

    // Pack order, top to bottom (§3.3).
    const ids = await stack.locator('[data-activity]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-activity')),
    );
    expect(ids).toEqual([
      'sleep',
      'work',
      'commute',
      'eating',
      'household',
      'care',
      'hygiene',
      'admin',
      'leisure',
    ]);
  });

  test('gates a section out and back in without losing its answers (AC 7, AC 8)', async ({
    page,
  }) => {
    await join(page);

    // Walk to the care gate, then into the section behind it.
    for (let screen = 1; screen < 10; screen += 1) await next(page).click();
    await expect(page.getByRole('heading')).toHaveText(
      'Do you regularly look after someone who needs care?',
    );
    await next(page).click();

    const workday = page.getByRole('group', { name: 'On a workday' });
    await workday.getByLabel('Increase').click();
    await expect(workday.getByRole('status')).toContainText('45');

    // Gate it out: the denominator drops, honestly (§4.2.1).
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('radio', { name: 'No' }).click();
    await expect(page.getByText(`10 of ${V1_SCREENS - 1}`)).toBeVisible();

    // Gate it back in: the answer behind it survived the round trip.
    await page.getByRole('radio', { name: 'Yes' }).click();
    await expect(page.getByText(`10 of ${V1_SCREENS}`)).toBeVisible();
    await next(page).click();
    await expect(workday.getByRole('status')).toContainText('45');
  });

  test('resumes in place after a refresh, on one session (AC 6, AC 36)', async ({ page }) => {
    await join(page);

    for (let screen = 1; screen <= 4; screen += 1) await next(page).click();
    await expect(page.getByRole('heading')).toHaveText(
      'How long do you spend travelling to and from work or study?',
    );

    const before = await page.evaluate(() => localStorage.getItem('hpw:current'));

    await page.reload();

    await expect(page.getByRole('heading')).toHaveText(
      'How long do you spend travelling to and from work or study?',
    );
    await expect(page.getByText(`5 of ${V1_SCREENS}`)).toBeVisible();
    // The intro is not shown twice, and no second session was minted — `total`
    // on the console counts session rows (§6.2.2).
    await expect(page.getByRole('button', { name: 'Continue' })).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('hpw:current'))).toBe(before);
  });

  test('gating a section out lands it in Not included (AC 9)', async ({ page }) => {
    await join(page);

    for (let screen = 1; screen < 10; screen += 1) await next(page).click();
    await page.getByRole('radio', { name: 'No' }).click();
    for (let screen = 10; screen < V1_SCREENS; screen += 1) await next(page).click();

    await expect(page.getByTestId('stack').locator('[data-activity="care"]')).toHaveCount(0);
    const notIncluded = page.getByTestId('not-included');
    await expect(notIncluded).toBeVisible();
    await expect(notIncluded.locator('[data-activity="care"]')).toHaveCount(1);
  });
});
