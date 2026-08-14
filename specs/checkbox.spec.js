// @ts-check
/**
 * APG Checkbox Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
 *
 * Derived from apg-usecases `patterns/checkbox/*.uc.yaml`:
 *   checkbox-aria-roles-and-properties, checkbox-dual-state,
 *   checkbox-tri-state, checkbox-changing-states-in-group,
 *   checkbox-displaying-states
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused } = require('./support/apg');

const AGREE = 'I agree to the terms';
const GROUP = 'Newsletter Preferences';
const ALL = 'All';
const WEEKLY = 'Weekly digest';
const PRODUCT = 'Product updates';
const CHILDREN = [WEEKLY, PRODUCT];

/**
 * Read a checkbox's state the way both a screen reader and the browser see it.
 *
 * These are native `<input type="checkbox">` elements, so the mixed state has
 * to appear twice: as aria-checked="mixed" for assistive technology and as the
 * DOM `indeterminate` property that drives the visual dash. Reading all three
 * at once and asserting them as a single object is what catches a widget that
 * sets one and forgets the other — which would show sighted and non-sighted
 * users different states.
 */
function stateOf(checkbox) {
  return checkbox.evaluate((el) => ({
    checked: el.checked,
    indeterminate: el.indeterminate,
    aria: el.getAttribute('aria-checked'),
  }));
}

const CHECKED = { checked: true, indeterminate: false, aria: 'true' };
const UNCHECKED = { checked: false, indeterminate: false, aria: 'false' };
const MIXED = { checked: false, indeterminate: true, aria: 'mixed' };

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'checkbox');
});

test.describe('Checkbox — roles, states, and properties', () => {
  test('the standalone checkbox exposes its state and its label toggles it', async ({ page }) => {
    const agree = page.getByRole('checkbox', { name: AGREE });
    await expect.poll(() => stateOf(agree)).toEqual(UNCHECKED);

    // Clicking the visible text must work: a label that is not wired to its
    // input shrinks the target to the box itself.
    await page.getByText(AGREE).click();
    await expect.poll(() => stateOf(agree)).toEqual(CHECKED);
  });

  test('the newsletter checkboxes are a named group', async ({ page }) => {
    const group = page.getByRole('group', { name: GROUP });
    const all = group.getByRole('checkbox', { name: ALL });

    // Scoping the lookup through the group proves the grouping is real in the
    // accessibility tree, not just a visual box.
    await tabUntilFocused(page, all);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(CHECKED);

    for (const name of CHILDREN) {
      await expect.poll(() => stateOf(group.getByRole('checkbox', { name }))).toEqual(CHECKED);
    }
  });

  test('every checkbox is in the page tab sequence in DOM order', async ({ page }) => {
    const agree = page.getByRole('checkbox', { name: AGREE });
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    const presses = await tabUntilFocused(page, agree);
    expect(presses, 'the first checkbox must be reachable by Tab').toBeGreaterThan(0);

    await page.keyboard.press('Tab');
    expect(await isFocused(all), 'Tab should reach All').toBe(true);
    await page.keyboard.press('Tab');
    expect(await isFocused(weekly), 'Tab should reach Weekly digest').toBe(true);
    await page.keyboard.press('Tab');
    expect(await isFocused(product), 'Tab should reach Product updates').toBe(true);
  });
});

test.describe('Checkbox — dual-state toggling', () => {
  test('Space toggles the standalone checkbox on and off', async ({ page }) => {
    const agree = page.getByRole('checkbox', { name: AGREE });

    await tabUntilFocused(page, agree);
    await expect.poll(() => stateOf(agree)).toEqual(UNCHECKED);

    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(agree)).toEqual(CHECKED);

    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(agree)).toEqual(UNCHECKED);
  });

  test('toggling one checkbox does not disturb the others', async ({ page }) => {
    const agree = page.getByRole('checkbox', { name: AGREE });
    const all = page.getByRole('checkbox', { name: ALL });

    await tabUntilFocused(page, agree);
    await page.keyboard.press('Space');

    await expect.poll(() => stateOf(agree)).toEqual(CHECKED);
    // The standalone checkbox is outside the group and must stay out of it.
    await expect.poll(() => stateOf(all)).toEqual(UNCHECKED);
  });
});

test.describe('Checkbox — tri-state parent reflects its children', () => {
  test('checking one child puts the parent in the mixed state', async ({ page }) => {
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    await expect.poll(() => stateOf(all)).toEqual(UNCHECKED);

    await tabUntilFocused(page, weekly);
    await page.keyboard.press('Space');

    await expect.poll(() => stateOf(weekly)).toEqual(CHECKED);
    await expect.poll(() => stateOf(product)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(all)).toEqual(MIXED);
  });

  test('checking every child promotes the parent from mixed to checked', async ({ page }) => {
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    await tabUntilFocused(page, weekly);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(MIXED);

    await tabUntilFocused(page, product);
    await page.keyboard.press('Space');

    await expect.poll(() => stateOf(weekly)).toEqual(CHECKED);
    await expect.poll(() => stateOf(product)).toEqual(CHECKED);
    await expect.poll(() => stateOf(all)).toEqual(CHECKED);
  });

  test('unchecking one child demotes the parent from checked back to mixed', async ({ page }) => {
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    await tabUntilFocused(page, all);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(CHECKED);

    await tabUntilFocused(page, product);
    await page.keyboard.press('Space');

    await expect.poll(() => stateOf(product)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(weekly)).toEqual(CHECKED);
    await expect.poll(() => stateOf(all)).toEqual(MIXED);
  });

  test('unchecking every child returns the parent to unchecked', async ({ page }) => {
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    await tabUntilFocused(page, all);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(CHECKED);

    await tabUntilFocused(page, weekly);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(MIXED);

    await tabUntilFocused(page, product);
    await page.keyboard.press('Space');

    await expect.poll(() => stateOf(weekly)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(product)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(all)).toEqual(UNCHECKED);
  });
});

test.describe('Checkbox — tri-state parent controls its children', () => {
  test('Space on the mixed parent checks every child', async ({ page }) => {
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    // Get the parent into the mixed state through the children first.
    await tabUntilFocused(page, weekly);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(MIXED);

    await tabUntilFocused(page, all);
    await page.keyboard.press('Space');

    await expect.poll(() => stateOf(all)).toEqual(CHECKED);
    await expect.poll(() => stateOf(weekly)).toEqual(CHECKED);
    await expect.poll(() => stateOf(product)).toEqual(CHECKED);
  });

  test('Space cycles the parent from mixed to checked to unchecked', async ({ page }) => {
    // The APG's tri-state cycle: activating a mixed checkbox checks it, and
    // activating it again unchecks it. "Mixed" is a state the group reports,
    // not a state the user can type their way back into.
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    await tabUntilFocused(page, product);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(MIXED);

    await tabUntilFocused(page, all);
    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(CHECKED);

    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(weekly)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(product)).toEqual(UNCHECKED);

    await page.keyboard.press('Space');
    await expect.poll(() => stateOf(all)).toEqual(CHECKED);
    await expect.poll(() => stateOf(weekly)).toEqual(CHECKED);
    await expect.poll(() => stateOf(product)).toEqual(CHECKED);
  });

  test('clicking the parent label drives the whole group', async ({ page }) => {
    const all = page.getByRole('checkbox', { name: ALL });
    const weekly = page.getByRole('checkbox', { name: WEEKLY });
    const product = page.getByRole('checkbox', { name: PRODUCT });

    await page.getByText(ALL, { exact: true }).click();
    await expect.poll(() => stateOf(all)).toEqual(CHECKED);
    await expect.poll(() => stateOf(weekly)).toEqual(CHECKED);
    await expect.poll(() => stateOf(product)).toEqual(CHECKED);

    await page.getByText(ALL, { exact: true }).click();
    await expect.poll(() => stateOf(all)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(weekly)).toEqual(UNCHECKED);
    await expect.poll(() => stateOf(product)).toEqual(UNCHECKED);
  });
});
