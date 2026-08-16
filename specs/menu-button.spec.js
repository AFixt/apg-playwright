// @ts-check
/**
 * APG Menu Button Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
 *
 * Derived from apg-usecases `patterns/menu-button/*.uc.yaml`:
 *   menu-button-accessibility-features, menu-button-opening-closing,
 *   menu-button-navigating-options, menu-button-dismissing-without-selection,
 *   menu-button-mouse-interaction
 *
 * The menu is only rendered while it is open, so each test opens it first. The
 * APG requires three different opening keys with two different landing places —
 * Enter and Space focus the first item, Up Arrow focuses the *last* — which is
 * the part implementations most often get half-right, so each key is driven
 * separately rather than through a shared helper.
 */
const { test, expect } = require('@playwright/test');
const { gotoPattern, tabUntilFocused, isFocused, expectTabExits } = require('./support/apg');

const ITEMS = ['New', 'Open', 'Save', 'Exit'];

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'menu-button');
});

/** The menu button itself. */
function button(page) {
  return page.getByRole('button', { name: 'Actions' });
}

/** A menu item, addressed by its label. */
function item(page, name) {
  return page.getByRole('menuitem', { name, exact: true });
}

/** Tab to the button and open the menu with `key`. */
async function openWith(page, key) {
  const presses = await tabUntilFocused(page, button(page));
  expect(presses, 'the menu button must be reachable by Tab').toBeGreaterThan(0);
  await page.keyboard.press(key);
  await expect(page.getByRole('menu')).toBeVisible();
}

test.describe('Menu button — roles, states, and properties', () => {
  test('the button advertises the menu it pops up and tracks its expanded state', async ({
    page,
  }) => {
    await expect(button(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('menu')).toHaveCount(0);

    await openWith(page, 'Enter');

    await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
    // aria-controls has to resolve to the menu that actually appeared, not to
    // a stale or invented id.
    const menuId = await page.getByRole('menu').evaluate((el) => el.id);
    expect(menuId, 'the menu needs an id for the button to reference').toBeTruthy();
    await expect(button(page)).toHaveAttribute('aria-controls', menuId);
  });

  test('the menu is named by its button and holds the expected items', async ({ page }) => {
    await openWith(page, 'Enter');

    const menu = page.getByRole('menu');
    await expect(menu).toHaveAttribute(
      'aria-labelledby',
      await button(page).evaluate((el) => el.id)
    );
    await expect(menu.getByRole('menuitem')).toHaveText(ITEMS);
  });
});

test.describe('Menu button — opening the menu', () => {
  test('Enter opens the menu and puts focus on the first item', async ({ page }) => {
    await openWith(page, 'Enter');
    expect(await isFocused(item(page, 'New'))).toBe(true);
    await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('Space opens the menu and puts focus on the first item', async ({ page }) => {
    await openWith(page, 'Space');
    expect(await isFocused(item(page, 'New'))).toBe(true);
    await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('Down Arrow opens the menu and puts focus on the first item', async ({ page }) => {
    await openWith(page, 'ArrowDown');
    expect(await isFocused(item(page, 'New'))).toBe(true);
  });

  test('Up Arrow opens the menu and puts focus on the last item', async ({ page }) => {
    await openWith(page, 'ArrowUp');
    expect(
      await isFocused(item(page, 'Exit')),
      'Up Arrow must open the menu at its end, not its start'
    ).toBe(true);
  });

  test('clicking the button opens the menu and clicking it again closes it', async ({ page }) => {
    await button(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'true');

    await button(page).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Menu button — navigating the menu', () => {
  test('Down and Up Arrow move focus through the items', async ({ page }) => {
    await openWith(page, 'Enter');

    for (const name of ITEMS.slice(1)) {
      await page.keyboard.press('ArrowDown');
      expect(await isFocused(item(page, name))).toBe(true);
    }

    await page.keyboard.press('ArrowUp');
    expect(await isFocused(item(page, 'Save'))).toBe(true);
  });

  test('Home and End jump to the first and last item', async ({ page }) => {
    await openWith(page, 'Enter');

    await page.keyboard.press('End');
    expect(await isFocused(item(page, 'Exit'))).toBe(true);

    await page.keyboard.press('Home');
    expect(await isFocused(item(page, 'New'))).toBe(true);
  });

  test('the menu uses a roving tabindex so only the focused item is tabbable', async ({ page }) => {
    await openWith(page, 'Enter');
    const items = page.getByRole('menuitem');

    const atFirst = await items.evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')));
    expect(atFirst).toEqual(['0', '-1', '-1', '-1']);

    await page.keyboard.press('End');
    expect(await isFocused(item(page, 'Exit'))).toBe(true);

    const atLast = await items.evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')));
    expect(atLast, 'tabindex="0" must follow focus through the menu').toEqual([
      '-1',
      '-1',
      '-1',
      '0',
    ]);
  });
});

test.describe('Menu button — closing the menu', () => {
  test('Escape closes the menu and returns focus to the button', async ({ page }) => {
    await openWith(page, 'Enter');
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(item(page, 'Open'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    expect(
      await isFocused(button(page)),
      'dismissing the menu must hand focus back to the button'
    ).toBe(true);
  });

  test('activating an item with Enter closes the menu and returns focus to the button', async ({
    page,
  }) => {
    await openWith(page, 'Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(item(page, 'Save'))).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await isFocused(button(page))).toBe(true);
  });

  test('clicking an item closes the menu and returns focus to the button', async ({ page }) => {
    await button(page).click();
    await item(page, 'Open').click();

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await isFocused(button(page))).toBe(true);
  });

  test('the open menu is a single tab stop that does not leak into the page', async ({ page }) => {
    await openWith(page, 'Enter');

    // Only the focused item is tabbable, so Tab must leave the menu outright
    // rather than walking the remaining items one by one.
    await expectTabExits(
      page,
      page.locator('[role="menu"]'),
      'Tab must leave the open menu rather than walk its items'
    );
  });
});
