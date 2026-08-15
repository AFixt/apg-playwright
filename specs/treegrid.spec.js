// @ts-check
/**
 * APG Treegrid Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/
 *
 * Derived from apg-usecases `patterns/treegrid/*.uc.yaml`:
 *   treegrid-aria-roles-and-properties, treegrid-navigation
 *
 * Not covered: `treegrid-selection`. This treegrid is single-select-free — it
 * exposes neither `aria-multiselectable` nor `aria-selected` on any row or
 * cell — and the APG only requires the Ctrl/Shift+Space selection keys of a
 * treegrid that supports selection.
 *
 * Focus model: this implementation puts focus on *cells* (roving tabindex on
 * the gridcells); the row elements are not focusable. The APG keyboard table
 * splits several keys into "focus is on a row" and "focus is on a cell"
 * behaviours, and only the cell half is applicable here.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  tabindexes,
} = require('./support/apg');

const MEMBERS = '[role="treegrid"] [role="gridcell"]';

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'treegrid');
});

/** A treegrid cell, addressed by its visible text. The chevron is aria-hidden. */
function cell(page, name) {
  return page.getByRole('gridcell', { name, exact: true });
}

/** A treegrid row, addressed by text unique to it. */
function row(page, text) {
  return page.getByRole('row').filter({ hasText: text });
}

test.describe('Treegrid — roles, states, and properties', () => {
  test('parent rows advertise level, position in set, and collapsed state', async ({ page }) => {
    const treegrid = page.getByRole('treegrid', { name: 'Project Tasks' });
    await expect(treegrid).toHaveAttribute('aria-colcount', '3');

    const phase1 = row(page, 'Phase 1');
    const phase2 = row(page, 'Phase 2');

    for (const [parent, posinset] of [
      [phase1, '1'],
      [phase2, '2'],
    ]) {
      await expect(parent).toHaveAttribute('aria-level', '1');
      await expect(parent).toHaveAttribute('aria-posinset', posinset);
      await expect(parent).toHaveAttribute('aria-setsize', '2');
      await expect(parent).toHaveAttribute('aria-expanded', 'false');
    }

    // aria-expanded="false" has to mean the children are genuinely absent,
    // not merely announced as collapsed.
    await expect(page.getByRole('row', { includeHidden: true })).toHaveCount(3);
    await expect(treegrid).toHaveAttribute('aria-rowcount', '3');
  });

  test('expanding a row reveals child rows one level deeper and updates aria-rowcount', async ({
    page,
  }) => {
    const phase1 = row(page, 'Phase 1');
    const treegrid = page.getByRole('treegrid', { name: 'Project Tasks' });

    await tabUntilFocused(page, cell(page, 'Phase 1'));
    await page.keyboard.press('ArrowRight');

    await expect(phase1).toHaveAttribute('aria-expanded', 'true');
    await expect(cell(page, 'Task 1.1'), 'child rows must actually render').toBeVisible();
    await expect(cell(page, 'Task 1.2')).toBeVisible();

    const child = row(page, 'Task 1.1');
    await expect(child).toHaveAttribute('aria-level', '2');
    await expect(child).toHaveAttribute('aria-posinset', '1');
    await expect(child).toHaveAttribute('aria-setsize', '2');

    // The header row plus four data rows are now present, and the treegrid's
    // advertised row count has to keep up with the rows it actually renders.
    await expect(page.getByRole('row')).toHaveCount(5);
    await expect(treegrid).toHaveAttribute('aria-rowcount', '5');
  });
});

test.describe('Treegrid — expanding and collapsing', () => {
  test('Right Arrow on a collapsed row expands it', async ({ page }) => {
    const phase2 = row(page, 'Phase 2');

    await tabUntilFocused(page, cell(page, 'Phase 1'));
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, 'Phase 2'))).toBe(true);

    await expect(phase2).toHaveAttribute('aria-expanded', 'false');
    await expect(cell(page, 'Task 2.1')).toHaveCount(0);

    await page.keyboard.press('ArrowRight');
    await expect(phase2).toHaveAttribute('aria-expanded', 'true');
    await expect(cell(page, 'Task 2.1')).toBeVisible();
  });

  test('Left Arrow on an expanded row collapses it and removes its children', async ({ page }) => {
    const phase1 = row(page, 'Phase 1');

    await tabUntilFocused(page, cell(page, 'Phase 1'));
    await page.keyboard.press('ArrowRight');
    await expect(phase1).toHaveAttribute('aria-expanded', 'true');
    await expect(cell(page, 'Task 1.1')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(phase1).toHaveAttribute('aria-expanded', 'false');
    await expect(cell(page, 'Task 1.1'), 'collapsing must remove the child rows').toHaveCount(0);
    expect(await isFocused(cell(page, 'Phase 1')), 'focus stays on the collapsed row').toBe(true);
  });

  test('clicking a parent row cell toggles the row', async ({ page }) => {
    const phase1 = row(page, 'Phase 1');

    await cell(page, 'Phase 1').click();
    await expect(phase1).toHaveAttribute('aria-expanded', 'true');
    await expect(cell(page, 'Task 1.2')).toBeVisible();

    await cell(page, 'Phase 1').click();
    await expect(phase1).toHaveAttribute('aria-expanded', 'false');
    await expect(cell(page, 'Task 1.2')).toHaveCount(0);
  });

  test('Right Arrow on a cell that is not the right-most moves focus one cell right', async ({
    page,
  }) => {
    // KNOWN BUG — apg-react#165.
    // APG Right Arrow: "If focus is on any other cell, moves focus one cell to
    // the right." The row-level exceptions above it in that table ("if focus is
    // on a collapsed row, expands the row") apply when focus is on the *row*,
    // and this treegrid does not make rows focusable at all — focus is always
    // on a cell. Expanding a collapsed row from its first cell is a reasonable
    // merge of the two halves and is tested as passing above; but once the row
    // is already expanded, its first cell is just "any other cell" and Right
    // Arrow must reach the next cell in the same row. This implementation
    // instead jumps down into the first child row, which leaves "Team A"
    // unreachable by Right Arrow from where a user starts.
    test.fail();

    const phase1 = row(page, 'Phase 1');
    await tabUntilFocused(page, cell(page, 'Phase 1'));
    await page.keyboard.press('ArrowRight');
    await expect(phase1).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(cell(page, 'Team A'))).toBe(true);
  });
});

test.describe('Treegrid — keyboard navigation', () => {
  test('the treegrid is a single tab stop entered on the first data cell', async ({ page }) => {
    const presses = await tabUntilFocused(page, cell(page, 'Phase 1'));
    expect(presses, 'the treegrid must be reachable by Tab').toBe(1);

    await expectTabExits(
      page,
      page.locator('[role="treegrid"]'),
      'a second Tab must leave the treegrid, not walk its cells'
    );
  });

  test('Down and Up Arrow move between rows in the same column', async ({ page }) => {
    await tabUntilFocused(page, cell(page, 'Phase 1'));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(cell(page, 'Task 1.1'))).toBe(true);

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, 'Task 1.2'))).toBe(true);
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, 'Phase 2'))).toBe(true);

    await page.keyboard.press('ArrowUp');
    expect(await isFocused(cell(page, 'Task 1.2'))).toBe(true);
  });

  test('Home and End move to the first and last cell of the current row', async ({ page }) => {
    await tabUntilFocused(page, cell(page, 'Phase 1'));
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cell(page, 'Phase 2'))).toBe(true);

    await page.keyboard.press('End');
    expect(await isFocused(cell(page, 'Not started')), 'End stays in the same row').toBe(true);

    await page.keyboard.press('Home');
    expect(await isFocused(cell(page, 'Phase 2')), 'Home stays in the same row').toBe(true);
  });

  test('Ctrl+Home and Ctrl+End jump to the first and last cell of the treegrid', async ({
    page,
  }) => {
    await tabUntilFocused(page, cell(page, 'Phase 1'));
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 'Task 1.1')).toBeVisible();

    await page.keyboard.press('Control+End');
    expect(
      await isFocused(cell(page, 'Not started')),
      'Ctrl+End must reach the last cell of the last visible row'
    ).toBe(true);

    await page.keyboard.press('Control+Home');
    expect(await isFocused(cell(page, 'Phase 1')), 'Ctrl+Home must reach the first cell').toBe(
      true
    );
  });

  test('the roving tabindex follows focus through expansions', async ({ page }) => {
    await tabUntilFocused(page, cell(page, 'Phase 1'));
    const atStart = await tabindexes(page.locator(MEMBERS));
    expect(
      atStart.filter((t) => t === '0'),
      'exactly one cell may be tabbable'
    ).toHaveLength(1);
    expect(atStart[0]).toBe('0');

    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 'Task 1.1')).toBeVisible();
    await page.keyboard.press('Control+End');
    expect(await isFocused(cell(page, 'Not started'))).toBe(true);

    const atEnd = await tabindexes(page.locator(MEMBERS));
    expect(
      atEnd.filter((t) => t === '0'),
      'exactly one cell may be tabbable'
    ).toHaveLength(1);
    expect(atEnd[atEnd.length - 1], 'tabindex="0" must move with focus').toBe('0');
    expect(atEnd[0], 'the previous entry point must leave the tab ring').toBe('-1');
  });
});
