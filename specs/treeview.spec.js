// @ts-check
/**
 * APG Tree View Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/treeview/
 *
 * Derived from apg-usecases `patterns/treeview/*.uc.yaml`:
 *   treeview-aria-roles-and-properties, treeview-initial-focus,
 *   treeview-keyboard-navigation, treeview-type-ahead
 *
 * Not covered here, and why:
 *   - treeview-multi-select: this tree is single-select and correctly omits
 *     aria-multiselectable, so Shift+Arrow / Control+A have no contract here.
 *   - treeview-expand-all-siblings: the APG marks `*` Optional and this tree
 *     does not advertise it.
 *
 * Shape confirmed against the running demo. Every node is collapsed on load:
 *   Documents (parent) / Pictures (parent) / Notes.txt (leaf, no aria-expanded)
 * Documents opens to Resume.pdf and CoverLetter.pdf.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  tabindexes,
} = require('./support/apg');

const ROOTS = ['Documents', 'Pictures', 'Notes.txt'];

const rootItemsOf = (page) => page.locator('[role=tree] > [role=treeitem]');
const item = (page, name) => page.getByRole('treeitem', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'treeview');
});

test.describe('Tree View — roles, states, and properties', () => {
  test('the tree is named and its root nodes expose level, position and set size', async ({
    page,
  }) => {
    await expect(page.getByRole('tree', { name: 'File Browser' })).toHaveAccessibleName(
      'File Browser'
    );

    for (const [index, name] of ROOTS.entries()) {
      const node = item(page, name);
      await expect(node).toHaveAttribute('aria-level', '1');
      await expect(node).toHaveAttribute('aria-posinset', String(index + 1));
      await expect(node).toHaveAttribute('aria-setsize', '3');
    }

    // The nested values only appear once the user opens a node, which is the
    // point: they have to describe the tree the user is actually looking at.
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('ArrowRight');

    const child = item(page, 'Resume.pdf');
    await expect(child).toBeVisible();
    await expect(child).toHaveAttribute('aria-level', '2');
    await expect(child).toHaveAttribute('aria-posinset', '1');
    await expect(child).toHaveAttribute('aria-setsize', '2');
    await expect(item(page, 'CoverLetter.pdf')).toHaveAttribute('aria-posinset', '2');
  });

  test('parent nodes carry aria-expanded and the leaf node correctly does not', async ({
    page,
  }) => {
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    await expect(item(page, 'Pictures')).toHaveAttribute('aria-expanded', 'false');

    // Notes.txt has no children, so per the APG it must NOT claim aria-expanded
    // — an end node that advertises expandability is a lie to the screen reader.
    await expect(item(page, 'Notes.txt')).not.toHaveAttribute('aria-expanded', /.*/);

    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'Notes.txt')).not.toHaveAttribute('aria-expanded', /.*/);
  });

  test('an expanded node owns its children through a group', async ({ page }) => {
    await expect(page.getByRole('group')).toHaveCount(0);

    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('ArrowRight');

    const group = item(page, 'Documents').getByRole('group');
    await expect(group).toBeVisible();
    await expect(group.getByRole('treeitem')).toHaveCount(2);

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('group')).toHaveCount(0);
    await expect(item(page, 'Resume.pdf')).toHaveCount(0);
  });

  test('the tree is single-select and does not claim aria-multiselectable', async ({ page }) => {
    const tree = page.getByRole('tree', { name: 'File Browser' });
    await expect(tree).not.toHaveAttribute('aria-multiselectable', 'true');

    for (const name of ROOTS) {
      await expect(item(page, name)).toHaveAttribute('aria-selected', 'false');
    }

    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    await expect(item(page, 'Notes.txt')).toHaveAttribute('aria-selected', 'true');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-selected', 'false');
    await expect(item(page, 'Pictures')).toHaveAttribute('aria-selected', 'false');
  });
});

test.describe('Tree View — expanding and collapsing', () => {
  test('Right Arrow opens a closed node and reveals its children', async ({ page }) => {
    const documents = item(page, 'Documents');
    await expect(item(page, 'Resume.pdf')).toHaveCount(0);

    await tabUntilFocused(page, documents);
    await page.keyboard.press('ArrowRight');

    await expect(documents).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'Resume.pdf')).toBeVisible();
    await expect(item(page, 'CoverLetter.pdf')).toBeVisible();
    expect(
      await isFocused(documents),
      'the first Right Arrow opens the node without leaving it'
    ).toBe(true);
  });

  test('a second Right Arrow moves focus to the first child', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    expect(await isFocused(item(page, 'Resume.pdf'))).toBe(true);
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
  });

  test('Left Arrow closes an open node and hides its children', async ({ page }) => {
    const documents = item(page, 'Documents');

    await tabUntilFocused(page, documents);
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Resume.pdf')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(documents).toHaveAttribute('aria-expanded', 'false');
    await expect(item(page, 'Resume.pdf')).toHaveCount(0);
    expect(await isFocused(documents)).toBe(true);
  });

  test('Right Arrow on an end node does nothing', async ({ page }) => {
    const notes = item(page, 'Notes.txt');

    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('End');
    expect(await isFocused(notes)).toBe(true);

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(notes), 'Right Arrow must not move focus off an end node').toBe(true);
    await expect(notes).not.toHaveAttribute('aria-expanded', /.*/);
  });

  test('clicking a parent node toggles it open and closed', async ({ page }) => {
    const pictures = item(page, 'Pictures');
    // Children render inside their parent's <li>, so the <li>'s own centre sits
    // over a child once the node is open. Target the node's own label row —
    // there is no accessible-name handle on it, hence the CSS hook.
    const label = pictures.locator('span.treeitem-label').first();

    await label.click();
    await expect(pictures).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'Holiday.jpg')).toBeVisible();

    await label.click();
    await expect(pictures).toHaveAttribute('aria-expanded', 'false');
    await expect(item(page, 'Holiday.jpg')).toHaveCount(0);
  });
});

test.describe('Tree View — selection', () => {
  test('Enter selects the focused node and deselects the previous one', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('Enter');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(item(page, 'Notes.txt')).toHaveAttribute('aria-selected', 'true');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-selected', 'false');
  });

  test('Space selects the focused node', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('End');
    await page.keyboard.press('Space');

    await expect(item(page, 'Notes.txt')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Tree View — keyboard navigation', () => {
  test('Tab lands on the first node and the tree is a single tab stop', async ({ page }) => {
    // "Focus moves to the first node if none are selected."
    const documents = item(page, 'Documents');
    const presses = await tabUntilFocused(page, documents);
    expect(presses, 'the tree must be reachable by Tab').toBeGreaterThan(0);

    expect(await tabindexes(rootItemsOf(page))).toEqual(['0', '-1', '-1']);

    await expectTabExits(
      page,
      page.locator('[role=tree]'),
      'Tab must leave the tree rather than walk its nodes'
    );
  });

  test('the roving tabindex follows focus as arrow keys move it', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(item(page, 'Pictures'))).toBe(true);
    expect(await tabindexes(rootItemsOf(page))).toEqual(['-1', '0', '-1']);

    await page.keyboard.press('ArrowDown');
    expect(await tabindexes(rootItemsOf(page))).toEqual(['-1', '-1', '0']);

    await page.keyboard.press('ArrowUp');
    expect(await tabindexes(rootItemsOf(page))).toEqual(['-1', '0', '-1']);
  });

  test('Down and Up Arrow move between visible nodes without opening them', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(item(page, 'Pictures'))).toBe(true);
    await expect(item(page, 'Pictures')).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowUp');
    expect(await isFocused(item(page, 'Documents'))).toBe(true);
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Down Arrow walks into an open node’s children', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Resume.pdf')).toBeVisible();

    await page.keyboard.press('ArrowDown');
    expect(
      await isFocused(item(page, 'Resume.pdf')),
      'the next visible node after an open parent is its first child'
    ).toBe(true);
  });

  test('Home moves to the first node and End to the last visible node', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));

    await page.keyboard.press('End');
    expect(await isFocused(item(page, 'Notes.txt'))).toBe(true);
    expect(await tabindexes(rootItemsOf(page))).toEqual(['-1', '-1', '0']);

    await page.keyboard.press('Home');
    expect(await isFocused(item(page, 'Documents'))).toBe(true);
    expect(await tabindexes(rootItemsOf(page))).toEqual(['0', '-1', '-1']);
  });

  test('arrow navigation stops at both ends rather than wrapping', async ({ page }) => {
    // The APG's tree arrows move to the next/previous focusable node; there is
    // no wrap, so the user always knows when they have hit the end of the tree.
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('ArrowUp');
    expect(
      await isFocused(item(page, 'Documents')),
      'Up Arrow on the first node must not wrap'
    ).toBe(true);

    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    expect(
      await isFocused(item(page, 'Notes.txt')),
      'Down Arrow on the last node must not wrap'
    ).toBe(true);
  });

  // KNOWN GAP — apg-react#155 (Recommended by the APG). TreeView handles no printable
  // characters. The APG lists type-ahead as Recommended for all trees.
  test.fail('typing a character moves focus to the next matching node', async ({ page }) => {
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('p');

    expect(await isFocused(item(page, 'Pictures'))).toBe(true);
  });
});

test.describe('Tree View — navigating inside an open node', () => {
  /**
   * KNOWN BUG — apg-react#154, shared root cause for the
   * three test.fail cases below.
   *
   * TreeView renders each child `li[role=treeitem]` *inside* its parent
   * `li[role=treeitem]`, and puts `onKeyDown` and `onFocus` on every one of
   * them. Both events bubble, so a keystroke on a nested node is handled twice:
   * once by the node itself and again by each ancestor treeitem, which then
   * re-runs the same key against its own position and undoes the child's move.
   * The bubbled focus handler likewise resets the roving tabindex back to the
   * ancestor. The effect is that a keyboard user can enter a subtree but cannot
   * navigate within it, and Shift+Tab returns them to the parent instead of the
   * node they were on. Root-level navigation is unaffected, which is why this
   * survives the tests above.
   */

  /** Open Documents and step into Resume.pdf using only the keyboard. */
  async function focusFirstChild(page) {
    await tabUntilFocused(page, item(page, 'Documents'));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await isFocused(item(page, 'Resume.pdf'))).toBe(true);
  }

  test.fail('the roving tabindex follows focus into a child node', async ({ page }) => {
    await focusFirstChild(page);

    await expect(item(page, 'Resume.pdf')).toHaveAttribute('tabindex', '0');
    await expect(item(page, 'Documents')).toHaveAttribute('tabindex', '-1');
  });

  test.fail('Down Arrow on a child moves to the next visible node', async ({ page }) => {
    await focusFirstChild(page);

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(item(page, 'CoverLetter.pdf'))).toBe(true);
  });

  test.fail(
    'Left Arrow on a child moves focus to its parent without closing it',
    async ({ page }) => {
      // "Left Arrow: When focus is on a child node that is also either an end node
      // or a closed node, moves focus to its parent node." It moves focus — it
      // does not also collapse the parent out from under the user.
      await focusFirstChild(page);

      await page.keyboard.press('ArrowLeft');
      expect(await isFocused(item(page, 'Documents'))).toBe(true);
      await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
      await expect(item(page, 'Resume.pdf')).toBeVisible();
    }
  );
});
