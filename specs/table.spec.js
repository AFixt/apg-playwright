// @ts-check
/**
 * APG Table Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/table/
 *
 * Derived from apg-usecases `patterns/table/*.uc.yaml`:
 *   table-structure-and-roles, table-labelling-and-describing,
 *   table-cells-spanning, table-sortable-columns,
 *   table-visibility-and-presence, table-interactive-widgets
 *
 * The demo renders a plain semantic `<table>`: a `<caption>` of "Employees",
 * a `<thead>` of three `<th scope="col">` headers, and three `<tbody>` rows of
 * `<td>` cells.
 *
 * This is the static end of the pattern — there is no state to change and no
 * widget to operate, so the assertions are about the accessibility tree the
 * markup produces and about the header/cell associations a screen reader
 * relies on when reading a cell out of context.
 *
 * Not covered, and why:
 *   - table-cells-spanning: no cell in this fixture spans rows or columns.
 *   - table-sortable-columns: no header is sortable, so there is no aria-sort.
 *   - table-visibility-and-presence: nothing here hides rows or columns, so
 *     aria-colcount/rowcount/colindex/rowindex are correctly absent.
 *   - table-interactive-widgets: the table holds no controls — asserted below
 *     rather than merely noted, since a stray tab stop would be a real bug.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabNeverReaches } = require('./support/apg');

const CAPTION = 'Employees';
const HEADERS = ['Name', 'Department', 'Location'];
const ROWS = [
  ['Alice', 'Engineering', 'Austin'],
  ['Bob', 'Marketing', 'Denver'],
  ['Carol', 'Sales', 'Chicago'],
];

const table = (page) => page.getByRole('table', { name: CAPTION });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'table');
});

test.describe('Table — labelling', () => {
  test('the table is named by its caption', async ({ page }) => {
    // A `<caption>` is what lets assistive technology answer "which table am I
    // in?" when a user lands mid-table from a list of tables.
    await expect(table(page)).toHaveAccessibleName(CAPTION);
    await expect(table(page).locator('caption')).toHaveText(CAPTION);
  });
});

test.describe('Table — structure and roles', () => {
  test('the table exposes header and body row groups', async ({ page }) => {
    // `<thead>` and `<tbody>` map to two rowgroups. Collapsing them into one
    // loses the "this row is the header row" boundary.
    await expect(table(page).getByRole('rowgroup')).toHaveCount(2);
    await expect(table(page).getByRole('row')).toHaveCount(ROWS.length + 1);
  });

  test('the header row exposes columnheaders, not plain cells', async ({ page }) => {
    const headerRow = table(page).getByRole('row').first();

    await expect(headerRow.getByRole('columnheader')).toHaveText(HEADERS);
    // `<td>` styled to look like a header is the commonest way this breaks;
    // the header row must contribute no plain cells at all.
    await expect(headerRow.getByRole('cell')).toHaveCount(0);
  });

  test('each data row exposes its cells in column order', async ({ page }) => {
    const rows = table(page).getByRole('row');

    for (const [index, expected] of ROWS.entries()) {
      // +1 skips the header row.
      await expect(rows.nth(index + 1).getByRole('cell')).toHaveText(expected);
    }
  });
});

test.describe('Table — header and cell association', () => {
  test('every column header is scoped to its column', async ({ page }) => {
    const scopes = await table(page)
      .locator('th')
      .evaluateAll((els) => els.map((el) => el.getAttribute('scope')));

    expect(scopes).toEqual(['col', 'col', 'col']);
  });

  test('each data cell resolves to the header sitting above it', async ({ page }) => {
    // This is the assertion that matters for a screen reader user arrowing
    // across a row: "Department: Engineering", not just "Engineering". It is
    // computed from position, so it catches a header row that is the wrong
    // length or out of order as well as a missing scope.
    const associations = await table(page).evaluate((el) => {
      const headers = Array.from(el.querySelectorAll('thead th')).map((th) =>
        (th.textContent || '').trim()
      );
      return Array.from(el.querySelectorAll('tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => ({
          header: headers[td.cellIndex],
          value: (td.textContent || '').trim(),
        }))
      );
    });

    expect(associations).toEqual(
      ROWS.map((row) => row.map((value, column) => ({ header: HEADERS[column], value })))
    );
  });
});

test.describe('Table — keyboard behaviour', () => {
  test('a static table introduces no tab stops', async ({ page }) => {
    // table-interactive-widgets: where a table *does* hold controls, each is
    // its own tab stop and the table is never a single composite stop. This
    // fixture holds none, so the honest assertion is that Tab finds nothing
    // inside it — a table that swallowed a tab stop would fail here.
    expect(
      await tabNeverReaches(page, table(page), 10),
      'a static table must not take focus itself'
    ).toBe(true);

    const focusableInside = await table(page).evaluate(
      (el) => el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').length
    );
    expect(focusableInside, 'this fixture holds no interactive widgets').toBe(0);
  });
});
