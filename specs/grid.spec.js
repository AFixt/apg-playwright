// @ts-check
/**
 * APG Grid Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/grid/
 *
 * Derived from apg-usecases `patterns/grid/*.uc.yaml`:
 *   grid-aria-roles-and-properties, grid-data-grid-navigation
 *
 * Not covered, because this demo does not implement the optional variants the
 * APG describes: `grid-editing-and-navigation` (no cell is editable, so there
 * is no edit mode for Enter to start or Escape to cancel) and
 * `grid-selecting-cells-rows-columns` (nothing exposes `aria-selected` or
 * `aria-multiselectable`). Both are "if the grid supports it" features in the
 * APG, so their absence is a scope decision rather than a defect.
 *
 * This demo is a DATA grid: numeric cells under four columnheaders. The layout
 * variant has its own demo and its own spec — see grid-layout.spec.js. The two
 * are not interchangeable: Control+Home / Control+End are required here and
 * optional there, which is why `grid-layout-navigation` is no longer claimed as
 * a source for this file. See AFixt/apg-react#188.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  tabindexes,
} = require('./support/apg');

const HEADER_ROW = 'Q1 Q2 Q3 Q4';
const FIRST_DATA_ROW = '100 200 300 400';
const LAST_DATA_ROW = '40 130 220 310';

/** Every focusable member of the composite, in DOM order. */
const MEMBERS = '[role="grid"] [role="columnheader"], [role="grid"] [role="gridcell"]';

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'grid');
});

/** A column header cell, addressed by its visible text. */
function header(page, name) {
  return page.getByRole('columnheader', { name, exact: true });
}

/** A data cell, addressed by its visible text. */
function cell(page, name) {
  return page.getByRole('gridcell', { name, exact: true });
}

test.describe('Grid — roles, states, and properties', () => {
  test('the grid advertises its dimensions and each row and cell reports its own position', async ({
    page,
  }) => {
    const grid = page.getByRole('grid', { name: 'Quarterly Report' });
    await expect(grid).toHaveAttribute('aria-rowcount', '4');
    await expect(grid).toHaveAttribute('aria-colcount', '4');
    await expect(page.getByRole('row')).toHaveCount(4);

    // aria-rowindex / aria-colindex are only trustworthy if they describe the
    // cell a user actually lands on, so navigate there and then read them.
    await tabUntilFocused(page, header(page, 'Q1'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(cell(page, '200'))).toBe(true);

    await expect(cell(page, '200')).toHaveAttribute('aria-colindex', '2');
    await expect(page.getByRole('row', { name: FIRST_DATA_ROW })).toHaveAttribute(
      'aria-rowindex',
      '2'
    );
    await expect(page.getByRole('row', { name: LAST_DATA_ROW })).toHaveAttribute(
      'aria-rowindex',
      '4'
    );
  });

  test('the first row holds column headers and the rows below hold grid cells', async ({
    page,
  }) => {
    // The role split is only meaningful if navigation crosses it: the same
    // Down Arrow that leaves a columnheader has to arrive on a gridcell.
    await expect(page.getByRole('row', { name: HEADER_ROW }).getByRole('columnheader')).toHaveCount(
      4
    );
    await expect(page.getByRole('row', { name: HEADER_ROW }).getByRole('gridcell')).toHaveCount(0);

    await tabUntilFocused(page, header(page, 'Q1'));
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(header(page, 'Q2'))).toBe(true);

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, '200')), 'Down Arrow must cross into a gridcell').toBe(true);
  });
});

test.describe('Grid — keyboard navigation', () => {
  test('the grid is a single tab stop that Tab enters on the first column header', async ({
    page,
  }) => {
    const presses = await tabUntilFocused(page, header(page, 'Q1'));
    expect(presses, 'the grid must be reachable by Tab').toBe(1);

    // A roving-tabindex composite takes one Tab to enter and one to leave.
    await expectTabExits(
      page,
      page.locator('[role="grid"]'),
      'a second Tab must leave the grid rather than walk its cells'
    );
  });

  test('Right and Left Arrow move within a row and stop at the row edges', async ({ page }) => {
    await tabUntilFocused(page, header(page, 'Q1'));
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, '100'))).toBe(true);

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(cell(page, '200'))).toBe(true);
    await page.keyboard.press('ArrowLeft');
    expect(await isFocused(cell(page, '100'))).toBe(true);

    // The APG grid does not wrap: at the left-most cell, focus does not move.
    await page.keyboard.press('ArrowLeft');
    expect(await isFocused(cell(page, '100')), 'Left Arrow must not wrap to the row end').toBe(
      true
    );

    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(cell(page, '400')), 'Right Arrow must not wrap to the row start').toBe(
      true
    );
  });

  test('Down and Up Arrow move within a column and stop at the grid edges', async ({ page }) => {
    await tabUntilFocused(page, header(page, 'Q1'));

    // Up Arrow on the top row is a no-op, not a wrap to the bottom.
    await page.keyboard.press('ArrowUp');
    expect(await isFocused(header(page, 'Q1')), 'Up Arrow must not wrap to the last row').toBe(
      true
    );

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, '100'))).toBe(true);
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, '60'))).toBe(true);
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, '40'))).toBe(true);

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, '40')), 'Down Arrow must not wrap to the header row').toBe(
      true
    );

    await page.keyboard.press('ArrowUp');
    expect(await isFocused(cell(page, '60'))).toBe(true);
  });

  test('Home and End move to the first and last cell of the current row', async ({ page }) => {
    await tabUntilFocused(page, header(page, 'Q1'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, '60'))).toBe(true);

    await page.keyboard.press('End');
    expect(await isFocused(cell(page, '90')), 'End must stay in the same row').toBe(true);

    await page.keyboard.press('Home');
    expect(await isFocused(cell(page, '60')), 'Home must stay in the same row').toBe(true);
  });

  test('Ctrl+Home and Ctrl+End jump to the first and last cell of the whole grid', async ({
    page,
  }) => {
    await tabUntilFocused(page, header(page, 'Q1'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(cell(page, '200'))).toBe(true);

    await page.keyboard.press('Control+End');
    expect(await isFocused(cell(page, '310')), 'Ctrl+End must reach the last cell').toBe(true);

    await page.keyboard.press('Control+Home');
    expect(await isFocused(header(page, 'Q1')), 'Ctrl+Home must reach the first cell').toBe(true);
  });

  test('the roving tabindex follows focus so only one cell is ever tabbable', async ({ page }) => {
    const members = page.locator(MEMBERS);

    await tabUntilFocused(page, header(page, 'Q1'));
    const atStart = await tabindexes(members);
    expect(
      atStart.filter((t) => t === '0'),
      'exactly one cell may be tabbable'
    ).toHaveLength(1);
    expect(atStart[0], 'the entry point is the first column header').toBe('0');

    await page.keyboard.press('Control+End');
    expect(await isFocused(cell(page, '310'))).toBe(true);

    const atEnd = await tabindexes(members);
    expect(
      atEnd.filter((t) => t === '0'),
      'exactly one cell may be tabbable'
    ).toHaveLength(1);
    expect(atEnd[atEnd.length - 1], 'tabindex="0" must have moved with focus').toBe('0');
    expect(atEnd[0], 'the old entry point must leave the tab ring').toBe('-1');
  });
});
