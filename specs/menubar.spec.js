// @ts-check
/**
 * APG Menu and Menubar Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/menubar/
 *
 * Derived from apg-usecases `patterns/menubar/*.uc.yaml`:
 *   menubar-accessibility-features, menubar-keyboard-navigation,
 *   menubar-selecting-items
 *
 * Structure confirmed against the running demo: the menubar holds three
 * `button[role=menuitem][aria-haspopup=menu][aria-expanded]` items (File, Edit,
 * View). A submenu is not in the DOM at all until it is opened, so every
 * submenu assertion below opens the menu first and asserts on what the user can
 * then actually perceive.
 *
 * Not covered here, and why:
 *   - menuitemcheckbox / menuitemradio and aria-disabled items: this menubar
 *     contains plain command items only.
 */
const { test, expect } = require('@playwright/test');
const {
  gotoPattern,
  tabUntilFocused,
  isFocused,
  expectTabExits,
  tabindexes,
} = require('./support/apg');

const BAR_ITEMS = ['File', 'Edit', 'View'];
const FILE_ITEMS = ['New', 'Open', 'Save', 'Save As'];

const barItemsOf = (page) => page.locator('[role=menubar] > * > [role=menuitem]');

/** Tab into the menubar and confirm we landed on `name`. */
async function enterMenubarOn(page, name) {
  const item = page.getByRole('menuitem', { name, exact: true });
  const presses = await tabUntilFocused(page, item);
  expect(presses, 'the menubar must be reachable by Tab').toBeGreaterThan(0);
  return item;
}

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'menubar');
});

test.describe('Menubar — roles, states, and properties', () => {
  test('the menubar is named, horizontal, and every item advertises its popup', async ({
    page,
  }) => {
    const menubar = page.getByRole('menubar', { name: 'Main' });
    await expect(menubar).toHaveAccessibleName('Main');
    await expect(menubar).toHaveAttribute('aria-orientation', 'horizontal');

    for (const name of BAR_ITEMS) {
      const item = page.getByRole('menuitem', { name, exact: true });
      await expect(item).toHaveAttribute('aria-haspopup', 'menu');
      await expect(item).toHaveAttribute('aria-expanded', 'false');
    }

    // aria-expanded must be a live state: no menu exists until one is opened.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'File', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  });

  test('an open submenu is a menu labelled by the item that opened it', async ({ page }) => {
    const file = await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');

    const menu = page.getByRole('menu', { name: 'File' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-labelledby', await file.evaluate((el) => el.id));

    for (const name of FILE_ITEMS) {
      await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
  });

  test('only one submenu is open at a time', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('menu', { name: 'File' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'File', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(page.getByRole('menu')).toHaveCount(1);
  });
});

test.describe('Menubar — opening and closing submenus', () => {
  test('Enter opens the submenu and focuses its first item', async ({ page }) => {
    const file = await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');

    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
    expect(await isFocused(page.getByRole('menuitem', { name: 'New', exact: true }))).toBe(true);
  });

  test('Down Arrow opens the submenu and focuses its first item', async ({ page }) => {
    const file = await enterMenubarOn(page, 'File');
    await page.keyboard.press('ArrowDown');

    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
    expect(await isFocused(page.getByRole('menuitem', { name: 'New', exact: true }))).toBe(true);
  });

  test('Up Arrow opens the submenu and focuses its last item', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('ArrowUp');

    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
    expect(
      await isFocused(page.getByRole('menuitem', { name: 'Save As', exact: true })),
      'Up Arrow must open the menu at its last item'
    ).toBe(true);
  });

  test('Space opens the submenu', async ({ page }) => {
    const file = await enterMenubarOn(page, 'File');
    await page.keyboard.press('Space');

    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  });

  test('Escape closes the submenu and returns focus to its menubar item', async ({ page }) => {
    const file = await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(file).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await isFocused(file), 'Escape must not strand focus on a removed node').toBe(true);
  });

  test('Enter on a submenu item activates it and closes the whole menu', async ({ page }) => {
    const file = await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(page.getByRole('menuitem', { name: 'Open', exact: true }))).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(file).toHaveAttribute('aria-expanded', 'false');
    expect(await isFocused(file), 'activating an item must return focus to the menubar').toBe(true);
  });

  test('clicking an open menubar item closes its submenu again', async ({ page }) => {
    const file = page.getByRole('menuitem', { name: 'File', exact: true });

    await file.click();
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();

    await file.click();
    await expect(file).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test.describe('Menubar — navigating the menubar', () => {
  test('the menubar is one tab stop and only one item is tabbable', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    expect(await tabindexes(barItemsOf(page))).toEqual(['0', '-1', '-1']);

    await expectTabExits(
      page,
      page.locator('[role=menubar]'),
      'Tab must leave the menubar rather than walk its items'
    );
  });

  test('the roving tabindex follows focus as arrow keys move it', async ({ page }) => {
    await enterMenubarOn(page, 'File');

    await page.keyboard.press('ArrowRight');
    expect(await isFocused(page.getByRole('menuitem', { name: 'Edit', exact: true }))).toBe(true);
    expect(await tabindexes(barItemsOf(page))).toEqual(['-1', '0', '-1']);

    await page.keyboard.press('ArrowRight');
    expect(await tabindexes(barItemsOf(page))).toEqual(['-1', '-1', '0']);

    await page.keyboard.press('ArrowLeft');
    expect(await tabindexes(barItemsOf(page))).toEqual(['-1', '0', '-1']);
  });

  test('Right Arrow wraps from the last menubar item to the first', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('End');
    expect(await isFocused(page.getByRole('menuitem', { name: 'View', exact: true }))).toBe(true);

    await page.keyboard.press('ArrowRight');
    expect(
      await isFocused(page.getByRole('menuitem', { name: 'File', exact: true })),
      'Right Arrow on the last menubar item must wrap'
    ).toBe(true);
  });

  test('Left Arrow wraps from the first menubar item to the last', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('ArrowLeft');

    expect(
      await isFocused(page.getByRole('menuitem', { name: 'View', exact: true })),
      'Left Arrow on the first menubar item must wrap'
    ).toBe(true);
  });

  test('Home and End jump to the first and last menubar item', async ({ page }) => {
    const file = await enterMenubarOn(page, 'File');

    await page.keyboard.press('End');
    expect(await isFocused(page.getByRole('menuitem', { name: 'View', exact: true }))).toBe(true);
    expect(await tabindexes(barItemsOf(page))).toEqual(['-1', '-1', '0']);

    await page.keyboard.press('Home');
    expect(await isFocused(file)).toBe(true);
    expect(await tabindexes(barItemsOf(page))).toEqual(['0', '-1', '-1']);
  });

  test('moving along the menubar while a menu is open swaps which menu is open', async ({
    page,
  }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible();
    expect(await isFocused(page.getByRole('menuitem', { name: 'Undo', exact: true }))).toBe(true);

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
    expect(await isFocused(page.getByRole('menuitem', { name: 'New', exact: true }))).toBe(true);
  });
});

test.describe('Menubar — navigating an open submenu', () => {
  test('Down and Up Arrow step through the submenu items', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(page.getByRole('menuitem', { name: 'Open', exact: true }))).toBe(true);
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(page.getByRole('menuitem', { name: 'Save', exact: true }))).toBe(true);
    await page.keyboard.press('ArrowUp');
    expect(await isFocused(page.getByRole('menuitem', { name: 'Open', exact: true }))).toBe(true);
  });

  test('Down Arrow wraps from the last submenu item to the first', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('ArrowUp');
    expect(await isFocused(page.getByRole('menuitem', { name: 'Save As', exact: true }))).toBe(
      true
    );

    await page.keyboard.press('ArrowDown');
    expect(
      await isFocused(page.getByRole('menuitem', { name: 'New', exact: true })),
      'Down Arrow on the last item wraps to the first'
    ).toBe(true);
  });

  test('Up Arrow wraps from the first submenu item to the last', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');
    expect(await isFocused(page.getByRole('menuitem', { name: 'New', exact: true }))).toBe(true);

    await page.keyboard.press('ArrowUp');
    expect(
      await isFocused(page.getByRole('menuitem', { name: 'Save As', exact: true })),
      'Up Arrow on the first item wraps to the last'
    ).toBe(true);
  });

  test('Home and End jump to the first and last submenu item', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');

    await page.keyboard.press('End');
    expect(await isFocused(page.getByRole('menuitem', { name: 'Save As', exact: true }))).toBe(
      true
    );

    await page.keyboard.press('Home');
    expect(await isFocused(page.getByRole('menuitem', { name: 'New', exact: true }))).toBe(true);
  });

  test('the open submenu carries its own roving tabindex', async ({ page }) => {
    await enterMenubarOn(page, 'File');
    await page.keyboard.press('Enter');

    const items = page.getByRole('menu', { name: 'File' }).getByRole('menuitem');
    expect(await tabindexes(items)).toEqual(['0', '-1', '-1', '-1']);

    await page.keyboard.press('ArrowDown');
    expect(await tabindexes(items)).toEqual(['-1', '0', '-1', '-1']);

    await page.keyboard.press('End');
    expect(await tabindexes(items)).toEqual(['-1', '-1', '-1', '0']);
  });

  // KNOWN GAP — apg-react#155 (Optional for menus per the APG). The Menubar handles no
  // printable characters, so type-ahead inside an open menu does nothing. The
  // APG marks this key Optional for menus — "Move focus to the next item in the
  // current menu whose label begins with that printable character" — so this is
  // a recommendation-level gap rather than a conformance failure. It is written
  // faithfully and marked test.fail so it flips red if type-ahead ever lands.
  test.fail(
    'typing a character moves focus to the next matching submenu item',
    async ({ page }) => {
      await enterMenubarOn(page, 'File');
      await page.keyboard.press('Enter');
      expect(await isFocused(page.getByRole('menuitem', { name: 'New', exact: true }))).toBe(true);

      await page.keyboard.press('s');
      expect(await isFocused(page.getByRole('menuitem', { name: 'Save', exact: true }))).toBe(true);
    }
  );
});
