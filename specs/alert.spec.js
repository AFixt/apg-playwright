// @ts-check
/**
 * APG Alert Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/alert/
 *
 * Derived from apg-usecases `patterns/alert/*.uc.yaml`:
 *   alert-role-and-accessibility, alert-appearance-and-behavior,
 *   alert-on-page-load, alert-content-and-importance,
 *   alert-design-considerations
 *
 * The demo renders one alert in the initial markup ("This is an info alert!")
 * and a "Trigger Alert" button that inserts a second one ("New alert
 * inserted") after load. Everything interesting about the pattern lives in
 * that second alert: an alert only earns its role by arriving *after* the
 * document has settled, without stealing focus from whatever the user was
 * doing. The tests below therefore drive the trigger and assert against the
 * inserted alert, never against the one that was there all along.
 *
 * Not covered, and why:
 *   - alert-on-page-load's "But" clause (an alert present before load must NOT
 *     be announced) is a screen-reader-announcement assertion. The DOM looks
 *     identical either way, so no browser-level assertion can distinguish it.
 *   - alert-content-and-importance's "brief and important" and
 *     alert-design-considerations' alert-frequency clauses are editorial
 *     judgements. The length budget below is the machine-checkable floor.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused } = require('./support/apg');

const TRIGGER = 'Trigger Alert';
const INSERTED = 'New alert inserted';
const PRELOADED = 'This is an info alert!';

/** The alert the trigger button inserts, as opposed to the one present on load. */
function insertedAlert(page) {
  return page.getByRole('alert').filter({ hasText: INSERTED });
}

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'alert');
});

test.describe('Alert — roles, states, and properties', () => {
  test('the inserted alert is exposed with role=alert and an assertive live region', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: TRIGGER });

    // Before the trigger runs, the inserted alert does not exist at all — so
    // the assertions below are about a node that genuinely arrived post-load.
    await expect(insertedAlert(page)).toHaveCount(0);

    await tabUntilFocused(page, trigger);
    await page.keyboard.press('Enter');

    const alert = insertedAlert(page);
    await expect(alert).toBeVisible();
    // role=alert implies aria-live=assertive; the demo states it explicitly,
    // and a component that dropped it would still read as an alert in the tree
    // while announcing politely (or not at all) in practice.
    await expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  test('a new alert node is added to the accessibility tree rather than the old one being reused', async ({
    page,
  }) => {
    // alert-on-page-load: assistive technology announces an alert because a new
    // node entered the tree after load. Mutating text inside an existing alert
    // is a weaker signal, so assert the count actually grows.
    await expect(page.getByRole('alert')).toHaveCount(1);

    const trigger = page.getByRole('button', { name: TRIGGER });
    await tabUntilFocused(page, trigger);
    await page.keyboard.press('Enter');

    await expect(page.getByRole('alert')).toHaveCount(2);
    await expect(page.getByRole('alert').first()).toContainText(PRELOADED);
    await expect(page.getByRole('alert').last()).toContainText(INSERTED);
  });
});

test.describe('Alert — appearance and focus behaviour', () => {
  test('activating the trigger leaves keyboard focus on the trigger', async ({ page }) => {
    // The whole point of an alert (rather than an alert dialog) is that it
    // interrupts nothing. A component that focused its own alert would strand
    // a keyboard user away from the control they just used.
    const trigger = page.getByRole('button', { name: TRIGGER });

    const presses = await tabUntilFocused(page, trigger);
    expect(presses, 'the trigger must be reachable by Tab').toBeGreaterThan(0);

    await page.keyboard.press('Enter');

    await expect(insertedAlert(page)).toBeVisible();
    expect(await isFocused(trigger), 'focus must stay on the trigger').toBe(true);
  });

  test('the alert persists instead of auto-dismissing itself', async ({ page }) => {
    // alert-appearance-and-behavior uses a 5s persistence floor: content that
    // vanishes before a screen reader finishes speaking it is unusable, and
    // WCAG 2.2.1 / 2.2.3 make timed disappearance a finding in its own right.
    const trigger = page.getByRole('button', { name: TRIGGER });
    await tabUntilFocused(page, trigger);
    await page.keyboard.press('Enter');

    const alert = insertedAlert(page);
    await expect(alert).toBeVisible();

    // A real wall-clock wait is the assertion, not a workaround for flakiness:
    // there is no event to await for "the alert did not remove itself".
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(5_000);

    await expect(alert).toBeVisible();
    await expect(alert).toContainText(INSERTED);
  });

  test('the alert message is short enough to be announced quickly', async ({ page }) => {
    // A structural proxy for "brief and important". A message far longer than
    // ordinary UI copy is flagged for human review rather than auto-failed.
    const trigger = page.getByRole('button', { name: TRIGGER });
    await tabUntilFocused(page, trigger);
    await page.keyboard.press('Enter');

    const message = insertedAlert(page).locator('.alert-message');
    await expect(message).toBeVisible();
    const text = (await message.innerText()).trim();
    expect(text.length, `alert copy should be terse, got: ${text}`).toBeLessThanOrEqual(120);
    expect(text.length, 'an alert with no copy announces nothing').toBeGreaterThan(0);
  });
});

test.describe('Alert — dismissal', () => {
  test('the Dismiss button removes the alert from the accessibility tree', async ({ page }) => {
    const trigger = page.getByRole('button', { name: TRIGGER });
    await tabUntilFocused(page, trigger);
    await page.keyboard.press('Enter');

    const alert = insertedAlert(page);
    await expect(alert).toBeVisible();

    // The close control is icon-only (a "×" glyph marked aria-hidden), so its
    // whole accessible name comes from aria-label. Locating it by role+name is
    // itself the assertion that the label survived.
    const dismiss = alert.getByRole('button', { name: 'Dismiss' });
    await dismiss.click();

    await expect(insertedAlert(page)).toHaveCount(0);
    // Dismissing one alert must not take the unrelated one with it.
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText(PRELOADED);
  });

  test('an alert dismissed by the user can be raised again by the trigger', async ({ page }) => {
    const trigger = page.getByRole('button', { name: TRIGGER });

    await tabUntilFocused(page, trigger);
    await page.keyboard.press('Enter');
    await insertedAlert(page).getByRole('button', { name: 'Dismiss' }).click();
    await expect(insertedAlert(page)).toHaveCount(0);

    // A re-raised alert has to be a genuinely new node, otherwise the second
    // occurrence of the same condition would never be announced.
    await tabUntilFocused(page, trigger);
    await page.keyboard.press('Space');

    await expect(insertedAlert(page)).toBeVisible();
    expect(await isFocused(trigger), 'focus must stay on the trigger').toBe(true);
  });

  test('the Dismiss button is reachable and operable from the keyboard', async ({ page }) => {
    const dismiss = page.getByRole('alert').getByRole('button', { name: 'Dismiss' });

    const presses = await tabUntilFocused(page, dismiss);
    expect(presses, 'Dismiss must be reachable by Tab').toBeGreaterThan(0);

    await page.keyboard.press('Enter');

    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
