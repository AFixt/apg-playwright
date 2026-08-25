// @ts-check
/**
 * APG Grid Pattern — layout variant
 * https://www.w3.org/WAI/ARIA/apg/patterns/grid/
 *
 * Derived from apg-usecases `patterns/grid/layout-grid-navigation.uc.yaml`.
 *
 * Distinct from `grid.spec.js`, which covers the *data* grid. The APG
 * separates the two by content — a data grid "presents tabular information
 * that has column titles, row titles, or both", a layout grid holds "a single,
 * logically homogenous set of elements" — and gives them different keyboard
 * contracts. See AFixt/apg-react#188.
 *
 * The sharpest difference:
 *
 *   Control+Home / Control+End    REQUIRED for a data grid
 *                                 OPTIONAL for a layout grid
 *
 * So the same two keys are asserted as a hard requirement in `grid.spec.js`
 * and through `markOptional()` here.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused, markOptional } = require('./support/apg');

const GRID = '[role="grid"]';

const ROWS = [
  ['Accordion', 'Breadcrumb', 'Carousel'],
  ['Combobox', 'Disclosure', 'Feed'],
  ['Listbox', 'Menubar', 'Slider'],
];

const link = (page, name) => page.getByRole('link', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'grid-layout');
});

test.describe('Layout Grid — roles, states, and properties', () => {
  test('exposes a named grid of rows and cells', async ({ page }) => {
    const grid = page.getByRole('grid', { name: 'Browse the pattern demos' });
    await expect(grid).toHaveAttribute('aria-rowcount', '3');
    await expect(grid).toHaveAttribute('aria-colcount', '3');
    await expect(page.getByRole('row')).toHaveCount(3);
    await expect(page.getByRole('gridcell')).toHaveCount(9);
  });

  test('has no columnheader, which is what separates it from a data grid', async ({ page }) => {
    // The APG: a layout grid "does not necessarily have header cells for
    // labelling rows or columns". The data grid in grid.spec.js has four.
    await expect(page.getByRole('columnheader')).toHaveCount(0);
  });

  test('binds every position to the link a user sees there', async ({ page }) => {
    // The geometry below is only meaningful if position and name agree.
    const names = await page.locator(`${GRID} [role="gridcell"] a`).allTextContents();
    expect(names.map((n) => n.trim())).toEqual(ROWS.flat());
  });

  test('is a single tab stop with a roving tabindex', async ({ page }) => {
    await expect(link(page, 'Accordion')).toHaveAttribute('tabindex', '0');
    for (const name of ROWS.flat().slice(1)) {
      await expect(link(page, name)).toHaveAttribute('tabindex', '-1');
    }
  });
});

test.describe('Layout Grid — required keyboard navigation', () => {
  test('Right and Left Arrow move one cell along the row', async ({ page }) => {
    await tabUntilFocused(page, link(page, 'Accordion'));
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(link(page, 'Breadcrumb'))).toBe(true);
    await page.keyboard.press('ArrowLeft');
    expect(await isFocused(link(page, 'Accordion'))).toBe(true);
  });

  test('Down and Up Arrow move one cell along the column', async ({ page }) => {
    await tabUntilFocused(page, link(page, 'Accordion'));
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(link(page, 'Combobox'))).toBe(true);
    await page.keyboard.press('ArrowUp');
    expect(await isFocused(link(page, 'Accordion'))).toBe(true);
  });

  test('Home and End move within the row that contains focus', async ({ page }) => {
    await tabUntilFocused(page, link(page, 'Accordion'));
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(link(page, 'Combobox'))).toBe(true);

    await page.keyboard.press('End');
    expect(await isFocused(link(page, 'Feed'))).toBe(true);
    await page.keyboard.press('Home');
    expect(await isFocused(link(page, 'Combobox'))).toBe(true);
  });
});

test.describe('Layout Grid — optional keyboard navigation', () => {
  test('Control+Home and Control+End move to the first and last cell of the grid', async ({
    page,
  }) => {
    markOptional(
      'Grid § Keyboard Interaction For Layout Grids — "Control + Home (optional)" and "Control + End (Optional)"'
    );
    // Required for a data grid, optional here. grid.spec.js asserts the same
    // two keys as a hard requirement against the data-grid demo.
    await tabUntilFocused(page, link(page, 'Accordion'));
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(link(page, 'Combobox'))).toBe(true);

    await page.keyboard.press('Control+End');
    expect(await isFocused(link(page, 'Slider'))).toBe(true);
    await page.keyboard.press('Control+Home');
    expect(await isFocused(link(page, 'Accordion'))).toBe(true);
  });

  test('Page Down and Page Up move by an author-determined number of rows', async ({ page }) => {
    markOptional(
      'Grid § Keyboard Interaction For Layout Grids — "Page Down (Optional)" and "Page Up (Optional)"'
    );
    // The demo sets pageSize to 2, so from row 1 this lands on row 3.
    await tabUntilFocused(page, link(page, 'Accordion'));
    await page.keyboard.press('PageDown');
    expect(await isFocused(link(page, 'Listbox'))).toBe(true);
    await page.keyboard.press('PageUp');
    expect(await isFocused(link(page, 'Accordion'))).toBe(true);
  });

  test('arrow keys wrap at the row and column edges', async ({ page }) => {
    markOptional(
      'Grid § Keyboard Interaction For Layout Grids — "Optionally, if focus is on the right-most cell in the row, focus may move to the first cell in the following row"'
    );
    await tabUntilFocused(page, link(page, 'Accordion'));
    await page.keyboard.press('ArrowLeft');
    expect(await isFocused(link(page, 'Slider'))).toBe(true);
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(link(page, 'Accordion'))).toBe(true);
  });
});
