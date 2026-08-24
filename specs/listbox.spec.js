// @ts-check
/**
 * APG Listbox Pattern
 * https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
 *
 * Derived from apg-usecases `patterns/listbox/*.uc.yaml`:
 *   listbox-container-aria, listbox-option-aria, listbox-orientation,
 *   listbox-single-select-navigation, listbox-focus-management-activedescendant,
 *   listbox-type-ahead
 *
 * Not covered here, and why:
 *   - listbox-multi-select-aria, listbox-multi-select-navigation,
 *     listbox-multi-select-shift, listbox-select-all: the demo page renders a
 *     single-select listbox only, and apg-react ships no multi-select listbox
 *     demo (apg-react#142). There is no aria-multiselectable widget on the page
 *     to drive, so those scenarios cannot be exercised faithfully here.
 *   - listbox-disabled-options, listbox-dynamic-loading,
 *     listbox-rearranging-options, listbox-scrolling-behavior: this listbox has
 *     five always-present, always-enabled, statically ordered options.
 *
 * Focus model note: the APG permits either aria-activedescendant on the
 * container or a roving tabindex over the options. This listbox implements the
 * roving tabindex variant — DOM focus lands on the option itself and the
 * container carries tabindex="-1" — so the activedescendant use case is
 * expressed here as its roving-tabindex equivalent.
 */
const { test, expect } = require('@playwright/test');
const {
  expectTabExits,
  gotoPattern,
  isFocused,
  tabUntilFocused,
  tabindexes,
  markOptional,
} = require('./support/apg');

const FRUITS = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry'];

const optionsOf = (page) => page.getByRole('listbox', { name: 'Fruits' }).getByRole('option');

test.beforeEach(async ({ page }) => {
  await gotoPattern(page, 'listbox');
});

test.describe('Listbox — roles, states, and properties', () => {
  test('the listbox is named by its visible label and is not multi-selectable', async ({
    page,
  }) => {
    const listbox = page.getByRole('listbox', { name: 'Fruits' });
    await expect(listbox).toHaveAccessibleName('Fruits');

    // "Otherwise, aria-multiselectable is either set to false or the default
    // value of false is implied." A single-select listbox must not claim it.
    await expect(listbox).not.toHaveAttribute('aria-multiselectable', 'true');

    // …and the widget must behave the way it advertises: choosing a second
    // option replaces the first rather than adding to it.
    await page.getByRole('option', { name: 'Banana' }).click();
    await page.getByRole('option', { name: 'Date' }).click();
    await expect(page.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    await expect(page.getByRole('option', { name: 'Date' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('every option carries an aria-selected state that tracks selection', async ({ page }) => {
    for (const name of FRUITS) {
      await expect(page.getByRole('option', { name })).toHaveAttribute('aria-selected', 'false');
    }

    await page.getByRole('option', { name: 'Cherry' }).click();
    for (const name of FRUITS) {
      await expect(page.getByRole('option', { name })).toHaveAttribute(
        'aria-selected',
        name === 'Cherry' ? 'true' : 'false'
      );
    }
  });

  test('the container is vertical, so it may omit aria-orientation', async ({ page }) => {
    // "The default value of aria-orientation for listbox is vertical." What
    // matters is that the vertical arrow keys are the ones that work.
    const listbox = page.getByRole('listbox', { name: 'Fruits' });
    await expect(listbox).not.toHaveAttribute('aria-orientation', 'horizontal');

    await tabUntilFocused(page, page.getByRole('option', { name: 'Apple' }));
    await page.keyboard.press('ArrowDown');
    expect(
      await isFocused(page.getByRole('option', { name: 'Banana' })),
      'a vertical listbox must respond to Down Arrow'
    ).toBe(true);
  });
});

test.describe('Listbox — selection', () => {
  test('clicking an option selects it and deselects the previous one', async ({ page }) => {
    const banana = page.getByRole('option', { name: 'Banana' });
    const elderberry = page.getByRole('option', { name: 'Elderberry' });

    await banana.click();
    await expect(banana).toHaveAttribute('aria-selected', 'true');

    await elderberry.click();
    await expect(elderberry).toHaveAttribute('aria-selected', 'true');
    await expect(banana).toHaveAttribute('aria-selected', 'false');
  });

  test('arrowing moves selection with focus, one option at a time', async ({ page }) => {
    // The APG allows a single-select listbox to move selection with focus.
    // What it does not allow is more than one option being selected at once.
    await tabUntilFocused(page, page.getByRole('option', { name: 'Apple' }));

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Cherry' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'false'
    );

    const selected = await optionsOf(page).evaluateAll(
      (els) => els.filter((el) => el.getAttribute('aria-selected') === 'true').length
    );
    expect(selected, 'a single-select listbox must never hold two selections').toBe(1);
  });
});

test.describe('Listbox — keyboard navigation', () => {
  test('Tab lands on the first option without changing the selection', async ({ page }) => {
    // "If none of the options are selected before the listbox receives focus,
    // the first option receives focus." Arriving must not silently pick one.
    const apple = page.getByRole('option', { name: 'Apple' });
    const presses = await tabUntilFocused(page, apple);
    expect(presses, 'the listbox must be reachable by Tab').toBeGreaterThan(0);

    await expect(apple).toHaveAttribute('aria-selected', 'false');
  });

  test('the listbox is a single tab stop with a roving tabindex over the options', async ({
    page,
  }) => {
    await tabUntilFocused(page, page.getByRole('option', { name: 'Apple' }));

    // The container itself is removed from the tab ring; the options carry it.
    await expect(page.getByRole('listbox', { name: 'Fruits' })).toHaveAttribute('tabindex', '-1');
    expect(await tabindexes(optionsOf(page))).toEqual(['0', '-1', '-1', '-1', '-1']);

    await expectTabExits(
      page,
      page.getByRole('listbox', { name: 'Fruits' }),
      'Tab must leave the listbox rather than walk its options'
    );
  });

  test('the roving tabindex follows focus as arrow keys move it', async ({ page }) => {
    const options = optionsOf(page);
    await tabUntilFocused(page, page.getByRole('option', { name: 'Apple' }));

    await page.keyboard.press('ArrowDown');
    expect(await isFocused(page.getByRole('option', { name: 'Banana' }))).toBe(true);
    expect(await tabindexes(options)).toEqual(['-1', '0', '-1', '-1', '-1']);

    await page.keyboard.press('ArrowDown');
    expect(await tabindexes(options)).toEqual(['-1', '-1', '0', '-1', '-1']);

    await page.keyboard.press('ArrowUp');
    expect(await tabindexes(options)).toEqual(['-1', '0', '-1', '-1', '-1']);
  });

  test('Down Arrow and Up Arrow step through the options', async ({ page }) => {
    const [apple, banana, cherry] = ['Apple', 'Banana', 'Cherry'].map((name) =>
      page.getByRole('option', { name })
    );

    await tabUntilFocused(page, apple);
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(banana)).toBe(true);
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(cherry)).toBe(true);
    await page.keyboard.press('ArrowUp');
    expect(await isFocused(banana)).toBe(true);
  });

  test('Home moves to the first option and End to the last', async ({ page }) => {
    markOptional('Listbox § Keyboard Interaction — Home and End are marked "(Optional)"');

    const apple = page.getByRole('option', { name: 'Apple' });
    const elderberry = page.getByRole('option', { name: 'Elderberry' });

    await tabUntilFocused(page, apple);
    await page.keyboard.press('End');
    expect(await isFocused(elderberry)).toBe(true);
    await expect(elderberry).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Home');
    expect(await isFocused(apple)).toBe(true);
    await expect(apple).toHaveAttribute('aria-selected', 'true');
  });

  test('arrow navigation stops at both ends rather than wrapping', async ({ page }) => {
    // Unlike tabs, radios and menubars, the APG's listbox arrow keys simply
    // "move focus to the next/previous option" — there is no wrap, and adding
    // one would silently jump the user across the whole list.
    const apple = page.getByRole('option', { name: 'Apple' });
    const elderberry = page.getByRole('option', { name: 'Elderberry' });

    await tabUntilFocused(page, apple);
    await page.keyboard.press('ArrowUp');
    expect(await isFocused(apple), 'Up Arrow on the first option must not wrap').toBe(true);

    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    expect(await isFocused(elderberry), 'Down Arrow on the last option must not wrap').toBe(true);
  });

  // KNOWN GAP — apg-react#155 (Recommended by the APG). The Listbox handles
  // no printable characters, so type-ahead does nothing. The APG lists
  // type-ahead as Recommended for all listboxes, and this one has five options.
  // Written faithfully and marked test.fail so it turns red the day it lands.
  test.fail('typing a character moves focus to the next matching option', async ({ page }) => {
    await tabUntilFocused(page, page.getByRole('option', { name: 'Apple' }));
    await page.keyboard.press('c');

    expect(await isFocused(page.getByRole('option', { name: 'Cherry' }))).toBe(true);
  });
});
